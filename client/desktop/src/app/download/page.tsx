import { JsonLd } from "@/components/site/JsonLd";
import { DownloadPage } from "@/components/site/DownloadPage";
import { latestDownloads } from "@/lib/download";
import { siteUrl } from "@/lib/site-url";
import type { Metadata } from "next";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download Petassist as a ZIP for Windows, Mac, or Linux. Stickable AI agents on the desk.",
};

export default async function Page() {
  const latest = await latestDownloads();
  const origin = siteUrl();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Petassist",
          applicationCategory: "DeveloperApplication",
          operatingSystem: ["Windows", "macOS", "Linux"],
          url: `${origin}/download`,
          downloadUrl: `${origin}/download`,
        }}
      />
      <DownloadPage latest={latest} />
    </>
  );
}
