import type { Metadata } from "next";
import { AppProviders } from "@/components/providers";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const title = "Ghost Companion — Petassist desk + Obake";
const description =
  "Petassist desk and TrueForge agent harness, with Obake（お化けちゃん）on the party dock.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: title,
    template: "%s — Ghost Companion",
  },
  description,
  keywords: [
    "Ghost Companion",
    "Obake",
    "Petassist",
    "stickable AI agents",
    "TrueForge",
    "desk",
  ],
  authors: [{ name: "Ghost Companion" }],
  icons: {
    icon: "/ghost/ObakeNormal.webp",
    shortcut: "/ghost/ObakeNormal.webp",
    apple: "/ghost/ObakeNormal.webp",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["ja_JP"],
    title,
    description,
    siteName: "Ghost Companion",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
