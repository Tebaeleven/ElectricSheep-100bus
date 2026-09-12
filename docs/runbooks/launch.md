# 起動 / 停止 runbook（`pnpm run up` / `pnpm down`）

ハッカソン当日に**必要なものを 1 コマンドで全部起動・全部停止**するための手順。
実体は [`scripts/dev-up.mjs`](../../scripts/dev-up.mjs) と [`scripts/dev-down.mjs`](../../scripts/dev-down.mjs)（Node 22 標準のみ・依存なし）。
ポート割当の正本は [`scripts/ports.json`](../../scripts/ports.json)（人間向けは [`docs/ports.md`](../ports.md)）。

> **`pnpm up` ではなく `pnpm run up`。**
> `up` は pnpm 自身のコマンド（`pnpm update` の別名）なので、`pnpm up` と書くと**依存の更新が走る**。
> スクリプトを起動するには **`pnpm run up`**（または同じものを指す **`pnpm start`**）と書く。
> 停止の `pnpm down` は pnpm のコマンドと衝突しないのでそのまま書ける。

```bash
pnpm run up            # モック構成（既定）
pnpm run up real       # Electron 実機構成
pnpm run up demo       # 本番デモ構成
pnpm run up web        # Web 3000 だけ
pnpm down              # 起動したものを止める
pnpm down --all        # Supabase（Docker）も止める
```

## プロファイル

| プロファイル | 起動するもの | Web の env 上書き | 起動後に開くページ |
|---|---|---|---|
| `mock`（既定） | Supabase → **スタックちゃん bridge 8030 → 偽スタックちゃん** → 機器モック 3 台（8791-8793）→ ロボットモック（8787）→ Web 3000 → Mastra Studio 4111 | `DEVICE_MODE=mock` | `/` と `/dev` |
| `real` | Supabase → **スタックちゃん bridge 8030** → Ghost Companion の Next 3100 → Electron（`electron:open`、Desktop API 8801）→ Web 3000 → Studio 4111 | `DEVICE_MODE=real` / `DESKTOP_BASE_URL=http://127.0.0.1:8801` / `STACKCHAN_BRIDGE_URL=http://127.0.0.1:8030` | `/` と `/dev` |
| `demo` | `real` から **Studio とモックを外した**構成（Supabase → bridge 8030 → Next 3100 → Electron → Web 3000） | `real` と同じ | `/` だけ |
| `web` | Web 3000 のみ（Supabase は**起動していればそのまま**使う。起動はしない） | なし（`.env.local` のまま） | `/` と `/dev` |

オプション:

| オプション | 効果 |
|---|---|
| `--no-open` | 起動後にブラウザを開かない |
| `--no-studio` | Mastra Studio を起動しない（`demo` は元から起動しない） |
| `--no-bridge` | スタックちゃん bridge（8030）と偽スタックちゃんを起動しない（`real` / `demo` では `STACKCHAN_BRIDGE_URL` の上書きも外れる） |
| `--mock-device` | 偽スタックちゃんも起動する（`real` / `demo` で**実機が無いとき**の確認用。`mock` は既定で起動する） |
| `--dry-run` | 起動計画（役割・ポート・コマンド・env 上書き）だけ表示して終わる |
| `--help` | ヘルプ |

### `real` / `demo` の env 上書きについて

**`.env.local` は書き換えない。** `DEVICE_MODE=real` / `DESKTOP_BASE_URL=http://127.0.0.1:8801` /
`STACKCHAN_BRIDGE_URL=http://127.0.0.1:8030` は Web の子プロセスに**環境変数として渡すだけ**なので、
`RAIL_BASE_URL` は `.env.local` の値がそのまま使われる（レールはモック 8791 のまま、
デスクトップは Electron 実機、スタックちゃんは PC 側 bridge に向く）。`pnpm down` 後に `.env.local` を直す必要はない。

`DEVICE_MODE=real` で `STACKCHAN_BRIDGE_URL` があると、`createDevices` は旧契約の `STACKCHAN_WS_URL` ではなく
**bridge クライアント（B 方式）** を使う（[`devices.md`](devices.md) §4.3）。機器（M5Stack）は bridge の
`ws://<PC の IP>:8030/obake/media` に自分から繋ぎに来る。

### スタックちゃん bridge と偽スタックちゃん

| プロファイル | bridge 8030 | 偽スタックちゃん（ポート無し） |
|---|---|---|
| `mock` | 起動する | **起動する**（`/dev` でカメラ画像と首制御を確認できるようにするため） |
| `real` / `demo` | 起動する | 起動しない（`--mock-device` を付けたときだけ起動） |
| `web` | 起動しない | 起動しない |

- 偽スタックちゃん（`pnpm stackchan:mock-device`）は **bridge に WS クライアントとして繋ぎに行くだけ**でポートを持たない。
  そのため readiness は**プロセスが起動直後に落ちていないこと**で判定する。起動順は必ず **bridge → 偽機器**。
- `mock` プロファイルでも **Web は `DEVICE_MODE=mock` のまま**（プロセス内モック）。bridge と偽機器は
  `/dev` から実際の JPEG / 首制御を触るための実物で、Web の機器呼び出し経路とは独立している。
- 8030 は**ファーム側の接続先に合わせた固定ポート**なのでずらせない（`scripts/ports.json` の `reserved` 参照）。

## `pnpm run up` の内部動作

1. **起動計画を表示** — プロファイルの役割・ポート・コマンド・env 上書き・開くページ。`--dry-run` はここで終わる。
2. **`.env.local` の用意** — `client/web/.env.local` が無ければ `client/web/.env.example` からコピーし
   「キーを入れてください」と警告する。`GOOGLE_GENERATIVE_AI_API_KEY` が空なら**太字で警告して起動は続ける**
   （会話 `/api/chat` だけが失敗する。それ以外の起動確認はできる）。
3. **事前チェック** — `real` / `demo` は `client/desktop/node_modules/electron/dist/Electron.app` の有無を見る
   （`client/desktop` はルート workspace 外なので `pnpm --dir client/desktop install` が別途必要）。
4. **ポートの取り合いを検出** — [`scripts/check-ports.mjs`](../../scripts/check-ports.mjs) `--json` を呼び、
   使うポートを**別のプロセス**が掴んでいたら**起動せずに終了（exit 1）**。`pnpm down` か `pnpm ports:free <名前>` を案内する。
   **同じ役割のプロセスが既に動いていれば「再利用」**してそのまま使う（判定は下の readiness）。
5. **起動** — `child_process.spawn` で子プロセスとして起動し、標準出力・標準エラーに
   `[web]` `[studio]` `[robot]` `[devices]` `[bridge]` `[mock-device]` `[desk-next]` `[electron]` の色付きプレフィックスを付けて
   **1 つのターミナルに流す**。Electron は Next 3100 が応答してから `electron:open` で起動する。
6. **readiness をポーリング** — 下表の URL が応答したら Ready。全部 Ready になったら**サマリー表**（役割・URL・状態）を出す。
7. **ブラウザを開く** — `--no-open` でなければ `open` で `http://localhost:3000` と `http://localhost:3000/dev`（`demo` は前者だけ）。
8. **Ctrl+C で子プロセスを全部停止** — SIGTERM → 3 秒待って SIGKILL。
   **Supabase と Electron は止めない**（Electron は `open` で起動した別プロセスなので `pnpm down` で止める）。

### readiness の見方

| サービス | readiness に使う URL | Ready の判定 |
|---|---|---|
| Web 3000 | `http://127.0.0.1:3000/api/dev/env` | 本文に `deviceMode` が含まれる（**3000 に別の Next が居ても Ready にならない**） |
| Mastra Studio 4111 | `http://127.0.0.1:4111/` | 応答すれば Ready |
| 機器モック | `http://127.0.0.1:8791/api/v1/rail/status` | 本文に `state` / `position` |
| ロボットモック | `http://127.0.0.1:8787/status` | 本文に `commandCount` |
| スタックちゃん bridge | `http://127.0.0.1:8030/obake/status` | 本文に `connected` |
| 偽スタックちゃん | （ポート無し） | 起動から 1.5 秒後にプロセスが生きていれば Ready |
| Ghost Companion の Next | `http://127.0.0.1:3100/` | 応答すれば Ready |
| Desktop API（Electron） | `http://127.0.0.1:8801/api/v1/desktop/status` | 本文に `running` |
| Supabase | `http://127.0.0.1:54321/rest/v1/` | 応答すれば Ready（401 でもよい） |

**「ポートが埋まっている」ではなく「役割の URL が正しく応答する」で判定する**のが要点。
3000 に別プロジェクトの Next が居る場合、プロセス名（`node` / `next`）は同じでも `/api/dev/env` が無いので
再利用されず、**衝突として止まる**。Web を再利用するときは `deviceMode` がプロファイルと一致するかも見る
（`real` で起動しようとして 3000 が `mock` で動いていたら、`pnpm down` を案内して止まる）。

## `pnpm down` の内部動作

1. 台帳の **app / mock / real** のポート（`infra` = Supabase 以外）を `lsof` で調べる。
2. 掴んでいる PID が**このリポジトリのものかを 2 段階で判定**する。
   `ps -p <pid> -o command` にこのリポジトリのフルパスが含まれるか（Electron・tsx・pnpm はこれで分かる）、
   それで駄目ならプロセスの **cwd** がこのリポジトリ配下か（`lsof -a -d cwd -p <pid>`）。
   **Next の dev サーバーはプロセス名を `next-server (v16.2.6)` に書き換えてしまいコマンドラインから判別できない**ので cwd で見る。
   どちらにも当てはまらないものは「触りません」と表示して**そのまま残す**（名前だけの `pkill` はしない）。
3. 対象の一覧（PID・ポート・コマンド）を表示し、`--yes` が無ければ確認プロンプト（TTY でなければ自動で yes）。
4. SIGTERM → 3 秒待って SIGKILL。
5. ポートを持たない**偽スタックちゃん**は `ps -Ao pid=,command=` から拾う。
   対象は「node の実行で」「コマンドラインに `mock-device` を含み」「コマンドラインか cwd がこのリポジトリ配下」で、
   さらに `stackchan:mock-device` かパッケージ名 `stackchan-bridge`（コマンドラインまたは cwd）に当たるものだけ。
   文字列を含むだけのシェル（`zsh -c ...`）や他チェックアウトのプロセスは対象外。bridge 本体は 8030 を持つので台帳で拾える。
6. Electron は `pkill -f <repo>/client/desktop/node_modules/electron/dist/Electron.app` で
   **フルパス指定**で止める（ポートを持たない補助プロセスも含めて落とすため）。
7. `--all` を付けたときだけ `pnpm db:stop`（Supabase / Docker）も実行する。

```bash
pnpm down            # 対象を表示して確認プロンプト → 停止（Supabase は残す）
pnpm down --yes      # 確認なし
pnpm down --all      # Supabase も止める
pnpm ports:check     # 止まったか確認する
```

> `pnpm down` は**スクリプトのあるチェックアウト（worktree 含む）のパス**を基準に対象を選ぶ。
> worktree で起動したものは同じ worktree の `pnpm down` で止める。

## よくある失敗と対処

| 症状 | 原因 | 対処 |
|---|---|---|
| `pnpm up` を叩いたら依存の更新が走った | `up` は pnpm 組み込みの `update` | **`pnpm run up`**（または `pnpm start`）と書く |
| `ポート 3000（...）を別のプロセスが掴んでいます` | 別プロジェクトの Next（例: Ghost Companion の旧設定）が 3000 に居る | `pnpm ports:free web` で PID を確認し、そのアプリを自分で止める。このリポジトリのものなら `pnpm down` |
| `3000 の Web は DEVICE_MODE=mock で動いています` | 別プロファイルの Web が残っている | `pnpm down` して起動し直す |
| `client/desktop の依存が未インストールです` | `client/desktop` はルート workspace 外 | `pnpm --dir client/desktop install` |
| `Electron.app が見つかりません` | pnpm が古く electron の install スクリプトが走っていない | `pnpm --dir client/desktop install`（それでも駄目なら [`desktop.md`](desktop.md) の該当行） |
| Supabase が Ready にならない | Docker Desktop が起動していない | Docker Desktop を起動して `pnpm run up` をやり直す |
| `GOOGLE_GENERATIVE_AI_API_KEY が未設定です` の警告 | キー未設定（起動自体は続く） | `client/web/.env.local` に https://aistudio.google.com/apikey のキーを入れて Web を再起動 |
| Electron が Ready にならない | 3100 の Next が落ちている / 8801 が埋まっている | `pnpm ports:check` で 3100・8801 を確認（[`desktop.md`](desktop.md)） |
| スクリーンショットが 403 | macOS の画面収録権限 | システム設定 > プライバシーとセキュリティ > 画面収録 で Electron を ON にして再起動（[`desktop.md`](desktop.md)） |
| `real` で Electron が Ready にならず、ウェルカム画面の Electron が出た | LaunchServices に初めて登録されるときに `open --args` のアプリパスが落ちることがある（初回だけ） | `pnpm down --yes` で止めて `pnpm run up real` をもう一度実行する（2 回目からは起きない） |
| Ctrl+C したのにブラウザのタブが生きている | ブラウザは閉じない仕様 | タブは手で閉じる。プロセスは `pnpm ports:check` で確認 |

## デモ当日の起動順チェックリスト

- [ ] Docker Desktop を起動する（Supabase に必要）
- [ ] `client/web/.env.local` に `GOOGLE_GENERATIVE_AI_API_KEY` と `SUPABASE_SECRET_KEY` が入っている
- [ ] Wi-Fi / ネットワークを確認する（[`network.md`](network.md) の当日チェックリスト）
- [ ] `pnpm install` と `pnpm --dir client/desktop install` が済んでいる
- [ ] `pnpm ports:check` が「衝突なし」になっている（他アプリが 3000 を掴んでいないか）
- [ ] `pnpm run up demo` を実行する
- [ ] サマリー表が全部 **Ready** になったことを確認する
- [ ] Electron のウィンドウが出て、`curl -s http://127.0.0.1:8801/api/v1/desktop/status` が `running` を返す
- [ ] スタックちゃんの電源を入れ、`curl -s http://127.0.0.1:8030/obake/status` が `"connected":true` を返す（機器が bridge に繋いだ合図。実機が無い日は `pnpm run up demo --mock-device` で偽機器を代わりに繋ぐ）
- [ ] `http://localhost:3000/dev` でスタックちゃんのカメラ画像が更新され、首制御（yaw / pitch）が効く
- [ ] ブラウザの `http://localhost:3000` でおばけに話しかけ、返事が返る
- [ ] （必要なら）画面収録・マイクの権限ダイアログに許可を出す（[`desktop.md`](desktop.md)）
- [ ] デモ終了後に `pnpm down --all` で全部止める

## 関連

- ポート割当: [`docs/ports.md`](../ports.md) / 台帳 [`scripts/ports.json`](../../scripts/ports.json)
- Electron / Desktop API: [`desktop.md`](desktop.md)
- 機器 API（レール / スタックちゃん / デスクトップ）: [`devices.md`](devices.md)
- 開発者ダッシュボード `/dev`: [`dev-dashboard.md`](dev-dashboard.md)
- 会場ネットワーク: [`network.md`](network.md)
