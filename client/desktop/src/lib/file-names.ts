const FILE_NAME =
  /(?:^|[\s「『"'`(])([\w][\w.-]*\.[A-Za-z][A-Za-z0-9]{1,7})(?=[\s」』"'`)、。,，]|$)/g;

export function fileNamesIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(FILE_NAME)) {
    const name = match[1];
    if (!name) continue;
    const lower = name.toLowerCase();
    if (lower === "archive.zip" || lower === "まとめ.zip") continue;
    out.push(name);
  }
  return [...new Set(out)];
}
