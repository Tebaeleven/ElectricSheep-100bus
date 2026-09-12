import os from "node:os";
import path from "node:path";
import type { PetGrants } from "@/lib/grants";

const ABS =
  /(?:^|[\s「『"'`(])((?:\/Users\/|\/home\/|\/opt\/|\/tmp\/|\/var\/|\/Volumes\/)[^\s」』"'`)]+)/g;
const HOME = /(?:^|[\s「『"'`(])(~\/[^\s」』"'`)]+)/g;

function cleanPath(raw: string) {
  return raw
    .replace(/(\.\w{1,8})[\u3040-\u9faf].*$/u, "$1")
    .replace(/[をにへでとがはもやの、。！？]+$/u, "")
    .replace(/[.,;:]+$/u, "");
}

export function absolutePathsIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(ABS)) {
    if (match[1]) out.push(path.resolve(cleanPath(match[1])));
  }
  const home = os.homedir();
  for (const match of text.matchAll(HOME)) {
    if (match[1]) out.push(path.resolve(home, cleanPath(match[1]).slice(2)));
  }
  return [...new Set(out)];
}

export function wellKnownFoldersIn(text: string): string[] {
  const home = os.homedir();
  const t = text.trim();
  const out: string[] = [];
  const add = (folder: string) => {
    if (!out.includes(folder)) out.push(folder);
  };
  if (/ダウンロード|downloads/i.test(t)) add(path.join(home, "Downloads"));
  if (/デスクトップ|desktop/i.test(t)) add(path.join(home, "Desktop"));
  if (/書類|ドキュメント|documents/i.test(t)) add(path.join(home, "Documents"));
  return out;
}

export function withMessageFolders(grants: PetGrants, text: string): PetGrants {
  const extra = [
    ...new Set([
      ...absolutePathsIn(text).map((item) => path.dirname(item)),
      ...wellKnownFoldersIn(text),
    ]),
  ];
  if (!extra.length) return grants;
  const folders = [...new Set([...grants.folders, ...extra])];
  if (grants.sandbox === "full_access") return { ...grants, folders };
  return { sandbox: "workspace", folders };
}

/** Desktop / Downloads / Documents already on the grant — safe to auto-tidy. */
export function clutterGrantIn(grants: PetGrants): string | undefined {
  const known = new Set(
    wellKnownFoldersIn(
      "デスクトップ ダウンロード 書類 Documents Desktop Downloads"
    ).map((folder) => path.resolve(folder))
  );
  return grants.folders.find((folder) => known.has(path.resolve(folder)));
}
