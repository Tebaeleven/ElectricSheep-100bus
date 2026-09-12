import { DEFAULT_PARTY_ORDER, isLiveAgent, type PartyMember, type PermissionTier } from "@/data/party";
import { fileNamesIn } from "@/lib/file-names";
import { DEFAULT_GRANTS, type PetGrants } from "@/lib/grants";
import { defaultConfigFor, type PetConfig } from "@/lib/pet-config";

type GrantsMap = Record<string, PetGrants>;
type ConfigMap = Record<string, PetConfig>;

function grantsOf(map: GrantsMap, id: string) {
  return map[id] ?? DEFAULT_GRANTS;
}

function configOf(map: ConfigMap, id: string) {
  return map[id] ?? defaultConfigFor(id);
}

export type TaskNeed =
  | "generic"
  | "research"
  | "read"
  | "zip"
  | "tidy"
  | "draft"
  | "write"
  | "send"
  | "shell";

const TIER_RANK: Record<PermissionTier, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

const NEED_TIER: Record<TaskNeed, PermissionTier> = {
  generic: "L0",
  research: "L0",
  read: "L0",
  zip: "L3",
  tidy: "L3",
  draft: "L2",
  write: "L3",
  send: "L3",
  shell: "L3",
};

export function classifyTask(text: string): TaskNeed {
  const t = text.trim();
  if (!t) return "generic";
  if (/twitter|ツイート|x\.com|slack|投稿|ポスト|notify|通知|送って|外へ|外部/i.test(t)) return "send";
  if (/zip|圧縮|アーカイブ|\.zip/i.test(t)) return "zip";
  if (
    /まとめて|新しいフォルダ|1フォルダ|一フォルダ|フォルダにして|フォルダを作成|含めた新しい|フォルダにまとめ/.test(
      t
    )
  ) {
    return "zip";
  }
  if (/整理|片付|tidy|organize|仕分/i.test(t)) return "tidy";
  if (/コマンド|シェル|terminal|ターミナル|run_command|npm |npx |pip /i.test(t)) return "shell";
  if (
    /サイトを作|アプリを作|ホームページ|ランディング|ツール作成|ツールを作|サイト作成|アプリ作成|webページ|ウェブページ|小さなサイト|小さなアプリ|コーディング|コードを書|実装して|プログラムを|vite|react|next\.?js|typescript|htmlを作|ページを作/i.test(
      t
    ) ||
    (/\.(html?|css|jsx?|tsx?|py|go|rs)\b/i.test(t) && /作|書|つく|作成|build|make/i.test(t))
  ) {
    return "write";
  }
  if (/下書き|文案|返信.*書|draft|polish|言い回し/i.test(t)) return "draft";
  if (
    /画像生成|イラストを|絵を描|イメージを作|generate image|draw me|スプレッドシート|表を作|xlsx|エクセル|spreadsheet|make a sheet/i.test(
      t
    )
  ) {
    return "write";
  }
  if (/pdf|pptx|ppt|スライド|csvを|jsonを書|保存して|変換|画像加工/i.test(t)) {
    return "write";
  }
  if (/未読|メール見て|inbox|新着メール|メールを読/i.test(t)) return "draft";
  if (fileNamesIn(t).length > 0) return "zip";
  if (
    /重複|duplicate|同じファイル|PC全体|マック全体|このMac|ディスク全体|ホーム全体|全部のファイル|スキャンして/.test(
      t
    )
  ) {
    return "read";
  }
  if (/調べ|検索|リサーチ|ソース|信用|sandbox|隔離|web/i.test(t)) return "research";
  if (/読ん|フォルダ|list|glob|ファイルを見|ファイルを探|中身/i.test(t)) return "read";
  return "generic";
}

/** “Make an app” with no kind or features — ask first, don’t dump a sample. */
export function isVagueBuildAsk(text: string) {
  const t = text.trim();
  if (!t) return false;
  if (classifyTask(t) !== "write") return false;
  if (/pdf|pptx|ppt|スライド|csvを|jsonを書|画像加工|保存して/i.test(t)) return false;
  if (
    /タイマー|電卓|todo|to-?do|メモ|ゲーム|チャット|カウンター|カレンダー|天気|ブログ|クイズ|時計|家計|買い物|ポートフォリオ|ランディング|じゃんけん|おみくじ|ポモドーロ|pomodoro|timer|calculator|game|chat|counter|dashboard|フォーム|予約|在庫|日記|習慣|リスト|管理|診断|ボード|描画|ペイント|音楽プレイヤー|地図|ログイン|sns/i.test(
      t
    )
  ) {
    return false;
  }
  if (/\.(html?|css|jsx?|tsx?)\b/i.test(t) && /作|書|つく|作成|build|make/i.test(t)) {
    return !/サンプル|sample|index\.html/i.test(t);
  }
  return /アプリ|サイト|ホームページ|ツール作成|ページを作|コーディング|実装して/i.test(t);
}

export function wantsTwitter(text: string) {
  return /twitter|ツイート|x\.com|ｘ（|x（twitter）|(?:^|[^\w])Xで|(?:^|[^\w])Xに|(?:^|[^\w])Xを/i.test(
    text
  );
}

export function wantsMacApp(text: string) {
  return (
    wantsTwitter(text) ||
    /アプリを開|サイトを開|safari|chrome|を開いて送|open_app/i.test(text)
  );
}

export function parseAllowSpeech(text: string): "allow" | "deny" | null {
  const t = text.trim();
  if (
    /^(いいよ|よいよ|うん|はい|ok|okay|許可する|みとめる|allow|yes|どうぞ|やって|送信|送って|送信して)$/i.test(
      t
    )
  ) {
    return "allow";
  }
  if (/^(やめて|だめ|嫌|いいえ|no|deny|拒否|許可しない)$/i.test(t)) {
    return "deny";
  }
  if (/もう一度試|もう一回試|retry/i.test(t)) return "allow";
  return null;
}

export function toolsForNeed(need: TaskNeed): string[] {
  switch (need) {
    case "research":
      return ["web_search"];
    case "draft":
      return ["save_draft"];
    case "send":
      return ["slack_post"];
    case "zip":
      return ["zip_files"];
    case "tidy":
      return ["move_file"];
    case "write":
      return ["write_file"];
    case "read":
      return ["read_file"];
    case "shell":
      return ["run_command"];
    default:
      return [];
  }
}

function speciesHasTool(_petId: string, _tool: string) {
  return true;
}

export function speciesCanNeed(petId: string, need: TaskNeed) {
  if (!isLiveAgent(petId)) return false;
  if (need === "generic") return true;
  return toolsForNeed(need).every((tool) => speciesHasTool(petId, tool));
}

const NEED_OWNER: Record<TaskNeed, string> = {
  generic: "",
  research: "ghost",
  read: "ghost",
  draft: "ghost",
  zip: "ghost",
  tidy: "ghost",
  write: "ghost",
  send: "ghost",
  shell: "ghost",
};

/** Direct talk: keep them unless they turned the needed tools off. */
export function rerouteDirectTalk(
  petId: string,
  text: string,
  config?: PetConfig
): { petId: string; need: TaskNeed; handed: boolean } {
  const need = classifyTask(text);
  const cfg = config ?? defaultConfigFor(petId);
  const blocked = toolsForNeed(need).some((tool) =>
    cfg.disabledTools.includes(tool)
  );
  if (!blocked && isLiveAgent(petId)) return { petId, need, handed: false };
  const owner = NEED_OWNER[need];
  if (!owner || owner === petId) return { petId, need, handed: false };
  return { petId: owner, need, handed: true };
}

export function hasFolderAccess(grants: PetGrants) {
  if (grants.sandbox === "full_access") return true;
  return grants.sandbox === "workspace" && grants.folders.length > 0;
}

export function needsDisk(need: TaskNeed) {
  return (
    need === "zip" ||
    need === "tidy" ||
    need === "read" ||
    need === "write" ||
    need === "shell"
  );
}

/** File work on this Mac, even when the primary job is send/draft. */
export function wantsLocalFiles(text: string) {
  if (needsDisk(classifyTask(text))) return true;
  if (fileNamesIn(text).length > 0) return true;
  return /フォルダ|folder|読み込|ファイルを読|ファイルを探|コードを読|list_dir|glob_files|read_file|zip|圧縮|重複|duplicate|PC全体|このMac|ディスク|ホーム全体|整理|片付|コーディング|実装/i.test(
    text
  );
}

export function asksForFolderGrant(text: string) {
  return /グラント|グランド|フォルダを渡|フォルダ.{0,16}許可|権限が必要|権限が足り|今の権限じゃ|アクセス権|見ていいフォルダ|フォルダを選|許可してくれたら|システム設定|System Settings|grant (a |the )?folder|granted folder|フォルダをちゃんと読み込|pick a folder|can’t see that far|can't see that far/i.test(
    text
  );
}

export function petMeetsNeed(
  petId: string,
  need: TaskNeed,
  grants: PetGrants,
  config: PetConfig,
  opts?: { ignoreStopped?: boolean; status?: string }
) {
  if (!isLiveAgent(petId)) return false;
  if (config.hidden) return false;
  if (!opts?.ignoreStopped && (opts?.status === "stopped" || opts?.status === "empty")) {
    return false;
  }
  if (need === "generic") return true;
  for (const tool of toolsForNeed(need)) {
    if (!speciesHasTool(petId, tool)) return false;
    if (config.disabledTools.includes(tool)) return false;
  }
  if (needsDisk(need) && !hasFolderAccess(grants)) return false;
  return true;
}

function orderIndex(id: string) {
  const i = (DEFAULT_PARTY_ORDER as readonly string[]).indexOf(id);
  return i < 0 ? 99 : i;
}

function closeness(
  pet: PartyMember,
  need: TaskNeed,
  grants: PetGrants,
  config: PetConfig
) {
  let score = Math.abs(TIER_RANK[pet.tier] - TIER_RANK[NEED_TIER[need]]);
  const tools = toolsForNeed(need);
  const native = tools.every((tool) => speciesHasTool(pet.id, tool));
  if (native) score -= 2;
  else score += 8;
  if (tools.some((tool) => config.disabledTools.includes(tool))) score += 3;
  if (needsDisk(need) && !hasFolderAccess(grants)) score += 4;
  if (pet.status === "stopped" || pet.status === "empty") score += 5;
  if (config.hidden) score += 6;
  return score;
}

export type RouteResult =
  | { ok: true; petId: string; need: TaskNeed }
  | { ok: false; petId: string; need: TaskNeed };

export function routeTask(
  text: string,
  party: PartyMember[],
  grantsMap: GrantsMap,
  configMap: ConfigMap
): RouteResult {
  const need = classifyTask(text);
  const able = party.filter((pet) =>
    petMeetsNeed(pet.id, need, grantsOf(grantsMap, pet.id), configOf(configMap, pet.id), {
      status: pet.status,
    })
  );
  if (able.length) {
    able.sort(
      (a, b) =>
        TIER_RANK[a.tier] - TIER_RANK[b.tier] || orderIndex(a.id) - orderIndex(b.id)
    );
    return { ok: true, petId: able[0]!.id, need };
  }

  const live = party.filter(
    (pet) => isLiveAgent(pet.id) && !configOf(configMap, pet.id).hidden
  );
  const ranked = live.length ? live : party.filter((pet) => isLiveAgent(pet.id));
  ranked.sort((a, b) => {
    const sa = closeness(
      a,
      need,
      grantsOf(grantsMap, a.id),
      configOf(configMap, a.id)
    );
    const sb = closeness(
      b,
      need,
      grantsOf(grantsMap, b.id),
      configOf(configMap, b.id)
    );
    return sa - sb || orderIndex(a.id) - orderIndex(b.id);
  });
  return { ok: false, petId: ranked[0]?.id ?? "ghost", need };
}

export function withNeedToolsEnabled(config: PetConfig, need: TaskNeed): PetConfig {
  const required = new Set(toolsForNeed(need));
  return {
    ...config,
    hidden: false,
    disabledTools: config.disabledTools.filter((name) => !required.has(name)),
  };
}
