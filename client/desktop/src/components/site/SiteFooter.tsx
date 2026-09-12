"use client";

import { GITHUB_REPO } from "@/lib/site-url";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function SiteFooter({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <footer
      className={cn(
        "border-t border-white/15 bg-[#302c55] px-4 py-8 text-sm text-[#c9c4e0]",
        className
      )}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-semibold text-white">{t.brand.title}</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed">
            {t.site.footer.tagline}
          </p>
          <p className="mt-2 text-[11px]">{t.site.footer.credit}</p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
          <Link href="/download" className="hover:text-[#f4c4d0]">
            {t.site.nav.download}
          </Link>
          <Link href="/desk" className="hover:text-[#f4c4d0]">
            {t.site.nav.desk}
          </Link>
          <Link href="/links" className="hover:text-[#f4c4d0]">
            {t.site.nav.links}
          </Link>
          <a
            href={GITHUB_REPO}
            className="hover:text-[#f4c4d0]"
            rel="noreferrer"
            target="_blank"
          >
            {t.site.footer.github}
          </a>
          <Link href="/field-report.html" className="hover:text-[#f4c4d0]">
            {t.site.footer.report}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
