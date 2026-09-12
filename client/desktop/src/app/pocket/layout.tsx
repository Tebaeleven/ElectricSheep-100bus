import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Pocket",
  description: "Pets jump in from the PC on the same Wi-Fi.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Petassist Pocket",
    statusBarStyle: "default",
  },
  icons: { apple: "/party/cat/02.webp" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#eef3f9",
};

export default function PocketLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-[#eef3f9]">
      <style>{`
        html, body {
          overflow: hidden !important;
          overscroll-behavior: none;
          height: 100%;
          min-height: 100%;
          touch-action: manipulation;
        }
      `}</style>
      {children}
    </div>
  );
}
