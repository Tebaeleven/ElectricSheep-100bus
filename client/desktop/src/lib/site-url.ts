export const PUBLIC_ORIGIN = "https://petassist.nanashino.website";

export const GITHUB_REPO = "https://github.com/Yu220284/petassist";
export const GITHUB_PR1 = `${GITHUB_REPO}/pull/1`;

export function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_ENV === "production") return PUBLIC_ORIGIN;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  return "http://127.0.0.1:3000";
}
