import { JsonLd } from "@/components/site/JsonLd";
import { LandingPage } from "@/components/site/LandingPage";
import { SITE_LINKS } from "@/data/site-links";
import { GITHUB_REPO, siteUrl } from "@/lib/site-url";

export default function Home() {
  const origin = siteUrl();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              name: "Ghost Companion",
              alternateName: ["ゴーストコンパニオン", "お化けちゃん", "Petassist desk"],
              url: origin,
              inLanguage: ["en", "ja"],
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: `${origin}/links?q={search_term_string}`,
                },
                "query-input": "required name=search_term_string",
              },
            },
            {
              "@type": "SoftwareApplication",
              name: "Ghost Companion",
              alternateName: "ゴーストコンパニオン",
              applicationCategory: "DeveloperApplication",
              operatingSystem: ["Windows", "macOS", "Linux"],
              description:
                "Petassist desk + TrueForge, with Obake on the party dock.",
              url: origin,
              downloadUrl: `${origin}/download`,
              installUrl: `${origin}/download`,
              codeRepository: GITHUB_REPO,
            },
            {
              "@type": "ItemList",
              name: "Ghost Companion links",
              numberOfItems: SITE_LINKS.length,
              itemListElement: SITE_LINKS.map((link, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: link.title.en,
                url: link.href.startsWith("http")
                  ? link.href
                  : `${origin}${link.href}`,
              })),
            },
          ],
        }}
      />
      <LandingPage />
    </>
  );
}
