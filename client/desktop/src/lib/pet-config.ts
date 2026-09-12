import { LIVE_IDS, isLiveAgent } from "@/data/party";

export const PET_MODEL_IDS = [
  "auto",
  "openai:gpt-4o-mini",
  "openai:gpt-4o",
  "gemini:gemini-2.0-flash",
  "gemini:gemini-2.5-flash",
] as const;

export type PetModelId = (typeof PET_MODEL_IDS)[number];

export const PET_IMAGE_MODEL_IDS = [
  "auto",
  "openai:dall-e-3",
  "openai:dall-e-2",
  "openai:gpt-image-1",
  "gemini:imagen-3.0-generate-002",
  "gemini:gemini-2.0-flash-preview-image-generation",
] as const;

export type PetImageModelId = (typeof PET_IMAGE_MODEL_IDS)[number];

export const DESK_APP_IDS = [
  "finder",
  "calendar",
  "mail",
  "notes",
  "slack",
  "safari",
  "chrome",
  "terminal",
  "x",
] as const;

export type DeskAppId = (typeof DESK_APP_IDS)[number];

export type GatePanel = "policy" | "model" | "tools" | "grants" | "apps";

export const WORK_MODE_IDS = ["agent", "plan", "ask", "image"] as const;
export type WorkMode = (typeof WORK_MODE_IDS)[number];

export type PetConfig = {
  policy: string;
  model: PetModelId;
  imageModel: PetImageModelId;
  workMode: WorkMode;
  disabledTools: string[];
  apps: DeskAppId[];
  hidden: boolean;
};

export const DEFAULT_PET_CONFIG: PetConfig = {
  policy: "",
  model: "auto",
  imageModel: "auto",
  workMode: "agent",
  disabledTools: [],
  apps: [],
  hidden: false,
};

export function defaultConfigFor(_petId: string): PetConfig {
  return { ...DEFAULT_PET_CONFIG };
}

export const MODEL_CATALOG: Array<{
  id: PetModelId;
  provider: "auto" | "openai" | "gemini";
  label: string;
}> = [
  { id: "auto", provider: "auto", label: "Auto" },
  { id: "openai:gpt-4o-mini", provider: "openai", label: "OpenAI · gpt-4o-mini" },
  { id: "openai:gpt-4o", provider: "openai", label: "OpenAI · gpt-4o" },
  { id: "gemini:gemini-2.0-flash", provider: "gemini", label: "Gemini · 2.0 Flash" },
  { id: "gemini:gemini-2.5-flash", provider: "gemini", label: "Gemini · 2.5 Flash" },
];

export const IMAGE_MODEL_CATALOG: Array<{
  id: PetImageModelId;
  provider: "auto" | "openai" | "gemini";
  label: string;
}> = [
  { id: "auto", provider: "auto", label: "Auto" },
  { id: "openai:dall-e-3", provider: "openai", label: "OpenAI · DALL·E 3" },
  { id: "openai:dall-e-2", provider: "openai", label: "OpenAI · DALL·E 2" },
  { id: "openai:gpt-image-1", provider: "openai", label: "OpenAI · gpt-image-1" },
  {
    id: "gemini:imagen-3.0-generate-002",
    provider: "gemini",
    label: "Gemini · Imagen 3",
  },
  {
    id: "gemini:gemini-2.0-flash-preview-image-generation",
    provider: "gemini",
    label: "Gemini · Flash image",
  },
];

export const APP_CATALOG: Array<{
  id: DeskAppId;
  bundle: string;
  ja: string;
  en: string;
}> = [
  { id: "finder", bundle: "Finder", ja: "Finder", en: "Finder" },
  { id: "calendar", bundle: "Calendar", ja: "カレンダー", en: "Calendar" },
  { id: "mail", bundle: "Mail", ja: "メール", en: "Mail" },
  { id: "notes", bundle: "Notes", ja: "メモ", en: "Notes" },
  { id: "slack", bundle: "Slack", ja: "Slack", en: "Slack" },
  { id: "safari", bundle: "Safari", ja: "Safari", en: "Safari" },
  { id: "chrome", bundle: "Google Chrome", ja: "Chrome", en: "Chrome" },
  { id: "terminal", bundle: "Terminal", ja: "ターミナル", en: "Terminal" },
  { id: "x", bundle: "X", ja: "X（Twitter）", en: "X (Twitter)" },
];

export const TOOL_CATALOG: Array<{
  name: string;
  ja: string;
  en: string;
}> = [
  { name: "inspect_untrusted", ja: "怪しい文面を調べる", en: "Inspect a message" },
  { name: "web_search", ja: "ウェブ検索", en: "Web search" },
  { name: "save_draft", ja: "下書きを残す", en: "Save draft" },
  { name: "slack_post", ja: "Slack 投稿", en: "Slack post" },
  { name: "x_post", ja: "X 投稿", en: "X post" },
  { name: "generate_image", ja: "画像を作る", en: "Generate image" },
  { name: "make_sheet", ja: "表を作る", en: "Make a sheet" },
  { name: "mail_list", ja: "未読メール一覧", en: "List unread mail" },
  { name: "mail_read", ja: "メールを読む", en: "Read mail" },
  { name: "mail_draft", ja: "メール返信の下書き", en: "Draft a mail reply" },
  { name: "mail_send", ja: "メール送信（ボタンまで待つ）", en: "Send mail (wait for button)" },
  { name: "list_dir", ja: "フォルダ一覧", en: "List folder" },
  { name: "glob_files", ja: "ファイル検索", en: "Find files" },
  { name: "read_file", ja: "ファイルを読む", en: "Read file" },
  { name: "write_file", ja: "サイトやファイルを書く", en: "Write site or file" },
  { name: "append_file", ja: "ログ追記", en: "Append log" },
  { name: "write_json", ja: "JSON", en: "JSON" },
  { name: "write_csv", ja: "CSV", en: "CSV" },
  { name: "write_pdf", ja: "PDF", en: "PDF" },
  { name: "write_pptx", ja: "PPTX", en: "PPTX" },
  { name: "process_image", ja: "画像加工", en: "Process image" },
  { name: "copy_file", ja: "コピー", en: "Copy file" },
  { name: "mkdir", ja: "フォルダを作る", en: "Make folder" },
  { name: "move_file", ja: "移動・リネーム", en: "Move or rename" },
  { name: "edit_file", ja: "ファイルを直す", en: "Edit file" },
  { name: "zip_files", ja: "ZIP を作る", en: "Make ZIP" },
  { name: "run_command", ja: "コマンド", en: "Shell" },
  { name: "open_app", ja: "アプリを開く", en: "Open app" },
  { name: "open_url", ja: "リンクを開く", en: "Open URL" },
  { name: "take_screenshot", ja: "画面を撮る", en: "Screenshot" },
];

export function isPetModelId(value: unknown): value is PetModelId {
  return (PET_MODEL_IDS as readonly string[]).includes(String(value));
}

export function isPetImageModelId(value: unknown): value is PetImageModelId {
  return (PET_IMAGE_MODEL_IDS as readonly string[]).includes(String(value));
}

export function isDeskAppId(value: unknown): value is DeskAppId {
  return (DESK_APP_IDS as readonly string[]).includes(String(value));
}

export function isWorkMode(value: unknown): value is WorkMode {
  return (WORK_MODE_IDS as readonly string[]).includes(String(value));
}

/** Tools the model may call in Plan / Ask. Agent keeps the full catalog. */
export function toolsAllowedInWorkMode(mode: WorkMode): Set<string> | null {
  if (mode === "plan") {
    return new Set([
      "inspect_untrusted",
      "web_search",
      "list_dir",
      "glob_files",
      "read_file",
      "mail_list",
      "mail_read",
    ]);
  }
  if (mode === "ask") {
    return new Set([
      "web_search",
      "inspect_untrusted",
      "list_dir",
      "glob_files",
      "read_file",
    ]);
  }
  if (mode === "image") return new Set(["generate_image"]);
  return null;
}

export function parsePetConfig(raw: unknown): PetConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PET_CONFIG };
  const rec = raw as Record<string, unknown>;
  const apps = Array.isArray(rec.apps)
    ? rec.apps.filter(isDeskAppId)
    : [];
  const disabledTools = Array.isArray(rec.disabledTools)
    ? rec.disabledTools.filter((n): n is string => typeof n === "string")
    : [];
  return {
    policy: typeof rec.policy === "string" ? rec.policy : "",
    model: isPetModelId(rec.model) ? rec.model : "auto",
    imageModel: isPetImageModelId(rec.imageModel) ? rec.imageModel : "auto",
    workMode: isWorkMode(rec.workMode) ? rec.workMode : "agent",
    disabledTools: [...new Set(disabledTools)],
    apps: [...new Set(apps)],
    hidden: rec.hidden === true,
  };
}

export function usesLlmGateway(config: PetConfig) {
  return config.model !== "auto";
}

export function appBundle(id: DeskAppId) {
  return APP_CATALOG.find((a) => a.id === id)?.bundle ?? id;
}

export function toolsForPetCatalog(petId: string) {
  if (!isLiveAgent(petId)) return [];
  return TOOL_CATALOG;
}
