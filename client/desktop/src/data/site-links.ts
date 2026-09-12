import type { Locale } from "@/lib/i18n/types";
import { GITHUB_PR1, GITHUB_REPO } from "@/lib/site-url";

export type SiteLinkCategory = "product" | "party" | "docs" | "source";

export type SiteLink = {
  id: string;
  href: string;
  external?: boolean;
  category: SiteLinkCategory;
  title: Record<Locale, string>;
  blurb: Record<Locale, string>;
  keywords: string[];
};

export const SITE_LINK_CATEGORIES: SiteLinkCategory[] = [
  "product",
  "party",
  "docs",
  "source",
];

export const SITE_LINKS: SiteLink[] = [
  {
    id: "home",
    href: "/",
    category: "product",
    title: { ja: "トップ", en: "Home" },
    blurb: {
      ja: "仕事はデスクに置いて管理する。調べるだけ、下書きだけ、このフォルダだけ。",
      en: "Put the work on the desk and manage it. Research only, drafts only, this folder only.",
    },
    keywords: [
      "home",
      "top",
      "トップ",
      "公式",
      "petassist",
      "ぺたしすと",
      "貼れる",
      "デスク",
      "必要な分",
      "任せる",
    ],
  },
  {
    id: "download",
    href: "/download",
    category: "product",
    title: { ja: "ダウンロード", en: "Download" },
    blurb: {
      ja: "Windows / Mac / Linux の ZIP を入れる。デスクに貼って、足りる分だけ任せる。",
      en: "Get the Windows, Mac, or Linux ZIP. Stick it on the desk. Hand over only what’s needed.",
    },
    keywords: [
      "download",
      "windows",
      "mac",
      "linux",
      "zip",
      "app",
      "ダウンロード",
      "入れる",
      "インストール",
    ],
  },
  {
    id: "desk",
    href: "/desk",
    category: "product",
    title: { ja: "デスク", en: "Desk" },
    blurb: {
      ja: "必要な分だけ任せる作業画面。いちばん小さい権限で足りる子が出る。",
      en: "The desk for handing over just enough. The smallest license that can do it goes.",
    },
    keywords: ["desk", "demo", "デスク", "デモ", "ポケット", "任せる", "権限"],
  },
  {
    id: "links",
    href: "/links",
    category: "product",
    title: { ja: "リンク検索", en: "Search links" },
    blurb: {
      ja: "GitHub・デスク・フィールドレポート・使い方へのリンクを検索する。",
      en: "Search GitHub, the desk, the field report, and example uses.",
    },
    keywords: ["search", "検索", "links", "リンク", "sitemap"],
  },
  {
    id: "field-report",
    href: "/field-report.html",
    category: "docs",
    title: { ja: "フィールドレポート", en: "Field report" },
    blurb: {
      ja: "提出用ブログの追記専用ログ。過去の節は書き換えない。",
      en: "Append-only hackathon blog log. Past entries stay as written.",
    },
    keywords: ["blog", "report", "フィールド", "ブログ", "提出", "hackathon"],
  },
  {
    id: "github",
    href: GITHUB_REPO,
    external: true,
    category: "source",
    title: { ja: "GitHub", en: "GitHub" },
    blurb: {
      ja: "ソースコード。Next.js と Electron と TrueForge の配線。",
      en: "Source: Next.js, Electron, and the TrueForge wiring.",
    },
    keywords: ["github", "source", "repo", "コード", "リポジトリ", "petassist"],
  },
  {
    id: "pr-qodo",
    href: GITHUB_PR1,
    external: true,
    category: "source",
    title: { ja: "Qodo レビュー PR", en: "Qodo review PR" },
    blurb: {
      ja: "審査提出の公開 PR。Qodo のレビュー証拠。",
      en: "The public PR used as Qodo review evidence.",
    },
    keywords: ["qodo", "pr", "review", "レビュー", "審査", "pull request"],
  },
  {
    id: "trueforge",
    href: "https://trueforge.dev/introduction",
    external: true,
    category: "docs",
    title: { ja: "TrueForge", en: "TrueForge" },
    blurb: {
      ja: "仕事を回す配管。ループ・MCP・サンドボックス・承認。",
      en: "The harness: loop, MCP, sandbox, and approvals.",
    },
    keywords: ["trueforge", "harness", "mcp", "sandbox", "ハーネス", "配管"],
  },
  {
    id: "trueforge-github",
    href: "https://github.com/truefoundry/trueforge",
    external: true,
    category: "source",
    title: { ja: "TrueForge GitHub", en: "TrueForge GitHub" },
    blurb: {
      ja: "ハーネス本体のリポジトリ。",
      en: "Upstream repository for the harness.",
    },
    keywords: ["trueforge", "truefoundry", "github", "harness"],
  },
  {
    id: "use-research",
    href: "/#uses",
    category: "product",
    title: { ja: "調べるだけ", en: "Research only" },
    blurb: {
      ja: "渡した範囲の外には出さずに、文面やファイルを開く。使い方の一例です。",
      en: "Open mail or files without sending outside the range you granted. One example use.",
    },
    keywords: ["research", "調べる", "みるだけ", "sandbox", "使い方"],
  },
  {
    id: "use-draft",
    href: "/#uses",
    category: "product",
    title: { ja: "下書きだけ", en: "Drafts only" },
    blurb: {
      ja: "返信や告知の文案を作る。この段階では送らない。",
      en: "Write a reply or announcement. Don’t send it yet.",
    },
    keywords: ["draft", "下書き", "そうあん", "文案", "使い方"],
  },
  {
    id: "use-folder",
    href: "/#uses",
    category: "product",
    title: { ja: "このフォルダだけ", en: "This folder only" },
    blurb: {
      ja: "渡したフォルダの中だけで動く。頼んでいない場所には入らない。",
      en: "They stay inside the folder you granted. They don’t enter places you didn’t ask for.",
    },
    keywords: ["folder", "フォルダ", "範囲", "grant", "使い方"],
  },
  {
    id: "party",
    href: "/#party",
    category: "party",
    title: { ja: "デスクに貼れる子", en: "Pets on the desk" },
    blurb: {
      ja: "権限は子ごとに変えられます。見た目は一例です。",
      en: "Permissions are per pet, and you can change them. The look is one example.",
    },
    keywords: ["party", "パーティ", "貼る", "ペット"],
  },
];

export function searchSiteLinks(query: string): SiteLink[] {
  const q = query.trim().toLowerCase();
  if (!q) return SITE_LINKS;
  const tokens = q.split(/\s+/).filter(Boolean);
  return SITE_LINKS.filter((link) => {
    const hay = [
      link.id,
      link.href,
      link.title.ja,
      link.title.en,
      link.blurb.ja,
      link.blurb.en,
      link.category,
      ...link.keywords,
    ]
      .join("\n")
      .toLowerCase();
    return tokens.every((token) => hay.includes(token));
  });
}

export function linkLabel(link: SiteLink, locale: Locale) {
  return link.title[locale];
}

export function linkBlurb(link: SiteLink, locale: Locale) {
  return link.blurb[locale];
}
