import {
  STACKCHAN_HTTP_HEALTH_MARKER,
  STACKCHAN_HTTP_MIN_INTERVAL_MS_DEFAULT,
  STACKCHAN_HTTP_PATHS,
  STACKCHAN_HTTP_TIMEOUT_MS_DEFAULT,
} from "../constants"
import type { DeviceResult, HandState, StackchanHttpOptions } from "../types"

/**
 * 機器上の HTTP サーバー（Obake・既定 8765）のクライアント。
 *
 * 実測した機器の癖に合わせてあるので、次の 3 つは必ず守ること。
 * - **ボディ・content-type を付けない**（公式 UI の `fetch(u,{method:'POST'})` と同じ）
 * - **同時に 1 本だけ・最低 `minIntervalMs` 空けて送る**（連続アクセスで機器が固まる）
 * - **`STACKCHAN_HTTP_PATHS` 以外のパスを叩かない**（未知パスは 404 ではなく接続リセット）
 */
export interface StackchanHttpClient {
  /** 手を開く / 閉じる（`POST /obake/hand_open` / `hand_close`） */
  handSet(state: HandState, signal?: AbortSignal): Promise<DeviceResult>
  /** LED を点ける / 消す（`POST /obake/led_on` / `led_off`） */
  ledSet(on: boolean, signal?: AbortSignal): Promise<DeviceResult>
  /** `GET /` が 200 で本文に `Obake` を含むかどうか */
  health(signal?: AbortSignal): Promise<DeviceResult<{ ok: boolean }>>
}

/** 指定ミリ秒待つ。プロセスをこのタイマーで生かし続けない */
function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}

/** 例外を DeviceResult のエラー文字列に落とす */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "timeout"
    if (error.name === "AbortError") return "aborted"
    return error.message
  }
  return String(error)
}

/** 1 回分の送信結果。再試行の判断にネットワークエラーかどうかを持つ */
interface AttemptResult {
  result: DeviceResult<string>
  /** 応答を受け取れなかった（機器に届いたか不明）場合 true */
  networkError: boolean
}

export function createStackchanHttpClient(
  options: StackchanHttpOptions
): StackchanHttpClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "")
  const timeoutMs = options.timeoutMs ?? STACKCHAN_HTTP_TIMEOUT_MS_DEFAULT
  const minIntervalMs =
    options.minIntervalMs ?? STACKCHAN_HTTP_MIN_INTERVAL_MS_DEFAULT

  /** 直列キュー。ここに繋いだ順にしか送らない（同時 1 本） */
  let queue: Promise<unknown> = Promise.resolve()
  /** 最後に送信を開始した時刻。次の送信まで minIntervalMs 空ける */
  let lastSentAt = 0

  /** 機器へ 1 回だけ送る。例外は投げず DeviceResult にする */
  const sendOnce = async (
    method: "GET" | "POST",
    path: string,
    startedAt: number,
    signal?: AbortSignal
  ): Promise<AttemptResult> => {
    await sleep(minIntervalMs - (Date.now() - lastSentAt))
    lastSentAt = Date.now()
    const timeout = AbortSignal.timeout(timeoutMs)
    const merged = signal ? AbortSignal.any([timeout, signal]) : timeout

    try {
      // ボディも content-type も付けない（機器はそれ以外を受け付けない）
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        cache: "no-store",
        signal: merged,
      })
      const text = await response.text()
      const latencyMs = Date.now() - startedAt
      if (response.ok) {
        return {
          networkError: false,
          result: { ok: true, status: response.status, data: text, latencyMs },
        }
      }
      return {
        networkError: false,
        result: {
          ok: false,
          status: response.status,
          data: text,
          error:
            text.trim().length > 0
              ? text.trim()
              : `HTTP ${response.status} ${response.statusText}`.trim(),
          latencyMs,
        },
      }
    } catch (error) {
      return {
        networkError: true,
        result: {
          ok: false,
          error: toErrorMessage(error),
          latencyMs: Date.now() - startedAt,
        },
      }
    }
  }

  /**
   * 直列キューに 1 件積む。
   * `retry` が true のときだけ、応答を受け取れなかった場合に 1 回だけ送り直す
   * （hand / led は冪等なので二重送信しても害が無い）
   */
  const send = (
    method: "GET" | "POST",
    path: string,
    retry: boolean,
    signal?: AbortSignal
  ): Promise<DeviceResult<string>> => {
    const run = async (): Promise<DeviceResult<string>> => {
      const startedAt = Date.now()
      const first = await sendOnce(method, path, startedAt, signal)
      if (!first.networkError || !retry) return first.result
      // タイムアウト・呼び出し側の中断は送り直しても同じ結果になる
      if (first.result.error === "timeout" || first.result.error === "aborted") {
        return first.result
      }
      if (signal?.aborted) return first.result
      const second = await sendOnce(method, path, startedAt, signal)
      return second.result
    }
    // 前の送信が失敗してもキューは止めない
    const next = queue.then(run, run)
    queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  return {
    handSet(state: HandState, signal?: AbortSignal): Promise<DeviceResult> {
      return send(
        "POST",
        state === "open"
          ? STACKCHAN_HTTP_PATHS.handOpen
          : STACKCHAN_HTTP_PATHS.handClose,
        true,
        signal
      )
    },

    ledSet(on: boolean, signal?: AbortSignal): Promise<DeviceResult> {
      return send(
        "POST",
        on ? STACKCHAN_HTTP_PATHS.ledOn : STACKCHAN_HTTP_PATHS.ledOff,
        true,
        signal
      )
    },

    async health(signal?: AbortSignal): Promise<DeviceResult<{ ok: boolean }>> {
      // ヘルスチェック用のパスは機器に無いので、操作 UI の HTML を取りに行く
      const result = await send(
        "GET",
        STACKCHAN_HTTP_PATHS.root,
        false,
        signal
      )
      const reachable =
        result.ok &&
        typeof result.data === "string" &&
        result.data.includes(STACKCHAN_HTTP_HEALTH_MARKER)
      if (result.ok && !reachable) {
        return {
          ok: false,
          status: result.status,
          data: { ok: false },
          error: `本文に ${STACKCHAN_HTTP_HEALTH_MARKER} が含まれていません`,
          latencyMs: result.latencyMs,
        }
      }
      return { ...result, data: { ok: reachable } }
    },
  }
}
