export function pick<T>(obj: Record<string, unknown> | undefined, ...keys: string[]): T | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key] as T;
  }
  return undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const rec = asRecord(part);
        if (!rec) return "";
        const text = pick<string>(rec, "text", "content");
        return typeof text === "string" ? text : "";
      })
      .join("");
  }
  const rec = asRecord(content);
  if (!rec) return "";
  const text = pick<string>(rec, "text", "content");
  return typeof text === "string" ? text : "";
}
