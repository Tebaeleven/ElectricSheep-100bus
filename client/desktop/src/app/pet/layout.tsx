import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  icons: {
    icon: "/party/cat/02.webp",
    shortcut: "/party/cat/02.webp",
  },
};

/** Pet strip: fully transparent page chrome for Electron alwaysOnTop */
export default function PetLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="h-full overflow-visible bg-transparent"
      style={{ background: "transparent" }}
    >
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.classList.add("pet-overlay");document.documentElement.style.background="transparent";if(document.body){document.body.style.background="transparent";document.body.style.backgroundColor="transparent";}function hideNextBadge(){document.querySelectorAll("nextjs-portal,[data-next-badge-root]").forEach(function(el){el.remove();});}hideNextBadge();[80,400,1200,3000].forEach(function(ms){setTimeout(hideNextBadge,ms);});function syncPetPause(){document.documentElement.classList.toggle("pet-paused",document.hidden);}document.addEventListener("visibilitychange",syncPetPause);syncPetPause();`,
        }}
      />
      <style>{`
        html, body, #__next, [data-overlay] {
          background: transparent !important;
          background-color: transparent !important;
          overflow: hidden !important;
          height: 100%;
          min-height: 0 !important;
        }
        nextjs-portal,
        [data-next-badge-root],
        [data-nextjs-dev-indicator] {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `}</style>
      {children}
    </div>
  );
}
