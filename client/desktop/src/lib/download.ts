import { GITHUB_REPO } from "@/lib/site-url";

export const GITHUB_RELEASES = `${GITHUB_REPO}/releases`;
export const GITHUB_RELEASES_LATEST = `${GITHUB_REPO}/releases/latest`;
export const GITHUB_API_LATEST =
  "https://api.github.com/repos/Yu220284/petassist/releases/latest";

export const PLATFORMS = ["windows", "mac", "linux"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type DownloadAsset = {
  name: string;
  url: string;
  size: number;
};

export type LatestDownloads = {
  tag: string | null;
  page: string;
  windows: DownloadAsset | null;
  mac: DownloadAsset | null;
  linux: DownloadAsset | null;
};

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function parsePlatform(value: string): Platform | null {
  const key = value.trim().toLowerCase();
  if (key === "win" || key === "windows") return "windows";
  if (key === "osx" || key === "macos" || key === "darwin" || key === "mac") {
    return "mac";
  }
  if (key === "linux") return "linux";
  return null;
}

function asAsset(row: unknown): DownloadAsset | null {
  if (!row || typeof row !== "object") return null;
  const rec = row as Record<string, unknown>;
  if (typeof rec.name !== "string" || typeof rec.browser_download_url !== "string") {
    return null;
  }
  return {
    name: rec.name,
    url: rec.browser_download_url,
    size: typeof rec.size === "number" ? rec.size : 0,
  };
}

function classifyZip(name: string): Platform | null {
  const n = name.toLowerCase();
  if (!n.endsWith(".zip")) return null;
  if (n.includes("win") || n.includes("windows")) return "windows";
  if (n.includes("linux")) return "linux";
  if (
    n.includes("mac") ||
    n.includes("darwin") ||
    n.includes("osx") ||
    n.includes("macos")
  ) {
    return "mac";
  }
  return null;
}

function preferredArch(platform: Platform, name: string) {
  if (platform === "mac") return /arm64|aarch64/i.test(name);
  return /x64|amd64|x86_64/i.test(name);
}

function pickZip(assets: DownloadAsset[], platform: Platform): DownloadAsset | null {
  const zips = assets.filter((a) => classifyZip(a.name) === platform);
  if (!zips.length) return null;
  return zips.find((a) => preferredArch(platform, a.name)) ?? zips[0];
}

const emptyLatest = (): LatestDownloads => ({
  tag: null,
  page: GITHUB_RELEASES_LATEST,
  windows: null,
  mac: null,
  linux: null,
});

export async function latestDownloads(): Promise<LatestDownloads> {
  const empty = emptyLatest();
  try {
    const res = await fetch(GITHUB_API_LATEST, {
      next: { revalidate: 300 },
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "petassist-site",
      },
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
      assets?: unknown;
    };
    const assets = Array.isArray(data.assets)
      ? data.assets.map(asAsset).filter((a): a is DownloadAsset => Boolean(a))
      : [];
    return {
      tag: typeof data.tag_name === "string" ? data.tag_name : null,
      page:
        typeof data.html_url === "string" ? data.html_url : GITHUB_RELEASES_LATEST,
      windows: pickZip(assets, "windows"),
      mac: pickZip(assets, "mac"),
      linux: pickZip(assets, "linux"),
    };
  } catch {
    return empty;
  }
}

export function zipUrl(latest: LatestDownloads, platform: Platform) {
  return latest[platform]?.url ?? latest.page;
}

export function formatBytes(size: number) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
