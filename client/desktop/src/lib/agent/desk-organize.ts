import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyFile, MAX_LIST } from "./files";
import { executeDeskTool, lexicalInside } from "./sandbox";
import type { PetGrants } from "@/lib/grants";
import type { Locale } from "@/lib/i18n/types";
import { fileNamesIn } from "@/lib/file-names";

export { fileNamesIn };

export function wantsZip(text: string) {
  return /zip|圧縮|アーカイブ|\.zip/i.test(text);
}

export function wantsFolder(text: string) {
  return /新しいフォルダ|1フォルダ|一フォルダ|フォルダにして|フォルダを作成|含めた新しい|フォルダにまとめ/.test(
    text
  );
}

export function wantsTidy(text: string) {
  return /整理|片付|tidy|organize/i.test(text) && !wantsZip(text);
}

export function isDeskFileJob(text: string) {
  if (
    /zip|圧縮|アーカイブ|\.zip|まとめて|新しいフォルダ|1フォルダ|一フォルダ|フォルダにして|フォルダを作成|整理|片付|権限を付与/i.test(
      text
    )
  ) {
    return true;
  }
  return fileNamesIn(text).length > 0;
}

export function searchRoots(grants: PetGrants) {
  const home = os.homedir();
  return [
    ...new Set(
      [
        ...grants.folders,
        path.join(home, "Desktop"),
        path.join(home, "Downloads"),
        path.join(home, "Documents"),
      ].filter(Boolean)
    ),
  ];
}

async function existsFile(p: string) {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

async function walkFind(root: string, base: string, depth: number): Promise<string | null> {
  if (depth < 0) return null;
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const want = base.toLowerCase();
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === want) return full;
  }
  if (depth === 0) return null;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const hit = await walkFind(path.join(root, entry.name), base, depth - 1);
    if (hit) return hit;
  }
  return null;
}

export async function findNamedFiles(names: string[], grants: PetGrants) {
  const roots = searchRoots(grants);
  const found: string[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const base = path.basename(name);
    let hit: string | null = null;
    for (const root of roots) {
      const direct = path.join(root, base);
      if (await existsFile(direct)) {
        hit = direct;
        break;
      }
    }
    if (!hit) {
      for (const root of roots) {
        hit = await walkFind(root, base, root.endsWith("Documents") ? 0 : 2);
        if (hit) break;
      }
    }
    if (hit) found.push(hit);
    else missing.push(base);
  }
  return { found, missing };
}

function grantsForPaths(grants: PetGrants, paths: string[]): PetGrants {
  const folders = [
    ...new Set([...grants.folders, ...paths.map((p) => path.dirname(p))]),
  ];
  if (grants.sandbox === "full_access") return { ...grants, folders };
  return { sandbox: "workspace", folders };
}

async function uniqueDir(parent: string, base: string) {
  for (let n = 0; n < 30; n++) {
    const dest =
      n === 0 ? path.join(parent, base) : path.join(parent, `${base}-${n}`);
    try {
      await fs.access(dest);
    } catch {
      return dest;
    }
  }
  return path.join(parent, `${base}-${Date.now()}`);
}

export function safeDestName(raw: string, kind: "zip" | "folder", locale: Locale) {
  const ja = locale === "ja";
  let name = path.basename(raw.trim()).replace(/[\\/]/g, "");
  if (!name) name = kind === "zip" ? (ja ? "アーカイブ.zip" : "Archive.zip") : ja ? "まとめ" : "Gathered";
  if (kind === "zip" && !name.toLowerCase().endsWith(".zip")) name = `${name}.zip`;
  return name;
}

export function nameChoices(
  files: string[],
  kind: "zip" | "folder",
  locale: Locale
) {
  const ja = locale === "ja";
  const first = path.basename(files[0] ?? "files", path.extname(files[0] ?? ""));
  const stem = first || (ja ? "まとめ" : "Gathered");
  if (kind === "zip") {
    const opts = ja
      ? ["アーカイブ.zip", `${stem}.zip`, "まとめ.zip"]
      : ["Archive.zip", `${stem}.zip`, "Gathered.zip"];
    return [...new Set(opts)].slice(0, 3).map((id) => ({ id, label: id }));
  }
  const opts = ja ? ["まとめ", stem, "新しいフォルダ"] : ["Gathered", stem, "New Folder"];
  return [...new Set(opts)].slice(0, 3).map((id) => ({ id, label: id }));
}

export type OrganizeResult = {
  ok: boolean;
  text: string;
  grants: PetGrants;
};

export async function organizeNamedFiles(opts: {
  names: string[];
  extraPaths?: string[];
  message: string;
  grants: PetGrants;
  locale: Locale;
  intent?: "zip" | "folder";
  destName?: string;
  found?: string[];
}): Promise<OrganizeResult> {
  const { names, message, locale } = opts;
  const ja = locale === "ja";
  const looked = opts.found?.length
    ? { found: opts.found, missing: [] as string[] }
    : await findNamedFiles(names, opts.grants);
  const found = [...new Set([...(opts.extraPaths ?? []), ...looked.found])];
  const missing = looked.missing.filter(
    (name) =>
      !found.some((p) => path.basename(p).toLowerCase() === name.toLowerCase())
  );
  if (!found.length) {
    return {
      ok: false,
      grants: opts.grants,
      text: ja
        ? `デスクトップとダウンロードを見たけど、${names.join("、")} が見つからなかった。フォルダを選んでね。`
        : `Looked on Desktop and Downloads, but didn't find ${names.join(", ")}. Pick the folder.`,
    };
  }

  const zip = wantsZip(message) || (opts.intent === "zip" && !wantsFolder(message));
  const folder =
    wantsFolder(message) ||
    opts.intent === "folder" ||
    (/まとめて/.test(message) && !zip);

  const parent =
    [...new Set(found.map((p) => path.dirname(p)))].length === 1
      ? path.dirname(found[0]!)
      : path.join(os.homedir(), "Desktop");
  let grants = grantsForPaths(opts.grants, [...found, path.join(parent, "x")]);

  const bits: string[] = [];
  if (missing.length) {
    bits.push(
      ja
        ? `${missing.join("、")} は見つからなかった。`
        : `Couldn't find ${missing.join(", ")}.`
    );
  }

  let folderPath = "";
  if (folder) {
    const folderName = safeDestName(
      opts.destName ?? (ja ? "まとめ" : "Gathered"),
      "folder",
      locale
    ).replace(/\.zip$/i, "");
    folderPath = await uniqueDir(parent, folderName);
    await fs.mkdir(folderPath, { recursive: true });
    grants = grantsForPaths(grants, [folderPath]);
    for (const src of found) {
      await copyFile(src, path.join(folderPath, path.basename(src)));
    }
    bits.push(ja ? `フォルダを作ったよ。${folderPath}` : `Made a folder: ${folderPath}`);
  }

  if (zip) {
    const toZip = folderPath ? [folderPath] : found;
    const destZip = path.join(
      parent,
      safeDestName(opts.destName ?? (ja ? "アーカイブ.zip" : "Archive.zip"), "zip", locale)
    );
    grants = grantsForPaths(grants, [...toZip, destZip]);
    const raw = await executeDeskTool(
      "zip_files",
      JSON.stringify({ paths: toZip, dest: destZip }),
      grants,
      locale
    );
    let parsed: { error?: string; path?: string } = {};
    try {
      parsed = JSON.parse(raw) as { error?: string; path?: string };
    } catch {
      parsed = { error: raw };
    }
    if (parsed.error) {
      bits.push(ja ? `ZIP はできなかった: ${parsed.error}` : `Zip failed: ${parsed.error}`);
    } else {
      bits.push(
        ja ? `ZIP も置いたよ。${parsed.path ?? ""}` : `Zip saved: ${parsed.path ?? ""}`
      );
    }
  }

  if (!folder && !zip) {
    folderPath = await uniqueDir(parent, ja ? "まとめ" : "Gathered");
    await fs.mkdir(folderPath, { recursive: true });
    for (const src of found) {
      await copyFile(src, path.join(folderPath, path.basename(src)));
    }
    bits.push(ja ? `フォルダを作ったよ。${folderPath}` : `Made a folder: ${folderPath}`);
  }

  return { ok: true, grants, text: bits.join(" ") };
}

const TIDY_BUCKETS: Array<{ ja: string; en: string; ext: string[] }> = [
  {
    ja: "画像",
    en: "Images",
    ext: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".bmp", ".svg", ".ico"],
  },
  {
    ja: "動画",
    en: "Videos",
    ext: [".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"],
  },
  {
    ja: "音楽",
    en: "Music",
    ext: [".mp3", ".wav", ".aac", ".m4a", ".flac", ".aiff"],
  },
  {
    ja: "書類",
    en: "Documents",
    ext: [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".md", ".rtf", ".csv", ".pages", ".key", ".numbers"],
  },
  {
    ja: "圧縮",
    en: "Archives",
    ext: [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz"],
  },
  {
    ja: "アプリ",
    en: "Apps",
    ext: [".dmg", ".pkg", ".app", ".exe", ".msi"],
  },
];

function bucketName(ext: string, locale: Locale) {
  const row = TIDY_BUCKETS.find((b) => b.ext.includes(ext));
  if (!row) return locale === "ja" ? "その他" : "Other";
  return locale === "ja" ? row.ja : row.en;
}

function reservedTidyNames() {
  return new Set([
    ...TIDY_BUCKETS.flatMap((b) => [b.ja, b.en]),
    "その他",
    "Other",
  ]);
}

async function uniqueFile(dest: string) {
  try {
    await fs.access(dest);
  } catch {
    return dest;
  }
  const dir = path.dirname(dest);
  const ext = path.extname(dest);
  const stem = path.basename(dest, ext);
  for (let n = 1; n < 40; n++) {
    const next = path.join(dir, `${stem}-${n}${ext}`);
    try {
      await fs.access(next);
    } catch {
      return next;
    }
  }
  return path.join(dir, `${stem}-${Date.now()}${ext}`);
}

async function moveFile(source: string, dest: string) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.rename(source, dest);
  } catch {
    await copyFile(source, dest);
    await fs.unlink(source);
  }
}

export async function tidyDirectory(opts: {
  folder: string;
  grants: PetGrants;
  locale: Locale;
}): Promise<OrganizeResult> {
  const ja = opts.locale === "ja";
  const folder = path.resolve(opts.folder);
  const grants = grantsForPaths(opts.grants, [path.join(folder, "x")]);
  if (!lexicalInside(folder, grants.folders) && grants.sandbox !== "full_access") {
    return {
      ok: false,
      grants,
      text: ja
        ? "いまの権限じゃそのフォルダまで入れないよ。見ていいフォルダを選んでね。"
        : "That’s outside the granted folder. Pick a folder I’m allowed to use.",
    };
  }
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch (err) {
    return {
      ok: false,
      grants,
      text: ja
        ? `フォルダを開けなかったよ。${err instanceof Error ? err.message : ""}`
        : `Couldn't open that folder. ${err instanceof Error ? err.message : ""}`,
    };
  }
  const skip = reservedTidyNames();
  const files = entries.filter(
    (entry) =>
      entry.isFile() &&
      !entry.name.startsWith(".") &&
      entry.name !== ".DS_Store"
  );
  if (!files.length) {
    return {
      ok: true,
      grants,
      text: ja
        ? `${folder} のいちばん上には、仕分けるファイルがなかったよ。`
        : `Nothing to sort at the top of ${folder}.`,
    };
  }
  const counts = new Map<string, number>();
  let moved = 0;
  for (const entry of files.slice(0, MAX_LIST)) {
    const src = path.join(folder, entry.name);
    const bucket = bucketName(path.extname(entry.name).toLowerCase(), opts.locale);
    if (skip.has(entry.name)) continue;
    const destDir = path.join(folder, bucket);
    const dest = await uniqueFile(path.join(destDir, entry.name));
    await moveFile(src, dest);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    moved += 1;
  }
  const leftover = files.length - moved;
  const summary = [...counts.entries()]
    .map(([name, n]) => (ja ? `${name} ${n}こ` : `${n} → ${name}`))
    .join(ja ? "、" : ", ");
  const extra =
    leftover > 0
      ? ja
        ? ` ほか ${leftover}こは上限で残したよ。`
        : ` Left ${leftover} files (limit).`
      : "";
  return {
    ok: true,
    grants,
    text: ja
      ? `${folder} を種類ごとに分けたよ。${summary}。${extra}`.trim()
      : `Sorted ${folder} by type: ${summary}.${extra}`,
  };
}
