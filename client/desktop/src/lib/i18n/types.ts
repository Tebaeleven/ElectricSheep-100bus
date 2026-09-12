export type Locale = "ja" | "en";

export const LOCALES: Locale[] = ["ja", "en"];

export function isLocale(value: unknown): value is Locale {
  return value === "ja" || value === "en";
}
