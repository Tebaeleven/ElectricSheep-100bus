"use client";

import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import type { LatestDownloads, Platform } from "@/lib/download";
import {
  GITHUB_RELEASES,
  PLATFORMS,
  formatBytes,
} from "@/lib/download";
import { GITHUB_REPO } from "@/lib/site-url";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

function guessPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  const plat = navigator.platform || "";
  if (/Win/i.test(plat) || /Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(plat) || (/Linux/i.test(ua) && !/Android/i.test(ua))) {
    return "linux";
  }
  if (/Mac/i.test(plat) || /Mac OS|Macintosh/i.test(ua)) return "mac";
  return null;
}

export function DownloadPage({ latest }: { latest: LatestDownloads }) {
  const { t } = useI18n();
  const copy = t.site.download;
  const [here, setHere] = useState<Platform | null>(null);

  useEffect(() => {
    setHere(guessPlatform());
  }, []);

  return (
    <div className="site-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="site-eyebrow">{copy.kicker}</p>
        <h1 className="site-display-md mt-3">{copy.title}</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#5a6478] sm:text-base">
          {copy.lead}
        </p>

        <div className="mt-10 grid gap-4">
          {PLATFORMS.map((platform) => {
            const zip = latest[platform];
            const selected = here === platform;
            const title = {
              windows: copy.windows,
              mac: copy.mac,
              linux: copy.linux,
            }[platform];
            const hint = {
              windows: copy.windowsHint,
              mac: copy.macHint,
              linux: copy.linuxHint,
            }[platform];
            return (
              <article
                key={platform}
                className={cn(
                  "rounded-3xl bg-white/90 p-6 shadow-sm",
                  selected && "ring-2 ring-[#302c55]/20"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#302c55]">{title}</p>
                  {selected ? (
                    <span className="rounded-full bg-[#302c55]/8 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#302c55]">
                      {copy.thisDevice}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] text-slate-500">{hint}</p>
                {zip ? (
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button asChild size="lg" className="site-cta">
                      <a href={`/download/${platform}`}>
                        {copy.cta}
                      </a>
                    </Button>
                    <p className="text-[11px] text-slate-400">
                      {zip.name}
                      {formatBytes(zip.size) ? ` · ${formatBytes(zip.size)}` : ""}
                      {latest.tag ? ` · ${latest.tag}` : ""}
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button asChild size="lg" className="site-cta">
                      <a href={latest.page}>{copy.releases}</a>
                    </Button>
                    <p className="text-[12px] text-slate-500">{copy.soon}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <p className="mt-6 text-[12px] leading-relaxed text-slate-400">
          {copy.note}
        </p>

        <p className="mt-8 text-sm text-[#5a6478]">
          {copy.source}{" "}
          <a
            href={GITHUB_REPO}
            className="site-text-link"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          {" · "}
          <a
            href={GITHUB_RELEASES}
            className="site-text-link"
            target="_blank"
            rel="noreferrer"
          >
            {copy.releases} ↗
          </a>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
