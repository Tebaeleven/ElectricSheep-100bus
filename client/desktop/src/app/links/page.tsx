import { JsonLd } from "@/components/site/JsonLd";
import { LinksPage } from "@/components/site/LinksPage";
import { SITE_LINKS } from "@/data/site-links";
import { siteUrl } from "@/lib/site-url";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Links",
  description:
    "Search Petassist links: GitHub, the desk, the field report, and example uses.",
  keywords: [
    "Petassist",
    "links",
    "GitHub",
    "TrueForge",
    "desk",
  ],
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const origin = siteUrl();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Petassist links",
          url: `${origin}/links`,
          numberOfItems: SITE_LINKS.length,
          itemListElement: SITE_LINKS.map((link, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: link.title.en,
            description: link.blurb.en,
            url: link.href.startsWith("http")
              ? link.href
              : `${origin}${link.href}`,
          })),
        }}
      />
      <LinksPage initialQuery={q} />
    </>
  );
}
