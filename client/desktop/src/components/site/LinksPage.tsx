"use client";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteSearch } from "@/components/site/SiteSearch";
import { useI18n } from "@/lib/i18n/locale";

export function LinksPage({ initialQuery }: { initialQuery: string }) {
  const { t } = useI18n();
  return (
    <div className="site-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <p className="text-xs font-semibold tracking-[0.22em] text-[hsl(var(--primary))]">
          {t.site.links.label}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[#302c55]">
          {t.site.links.pageTitle}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
          {t.site.links.pageLead}
        </p>
        <div className="mt-8">
          <SiteSearch initialQuery={initialQuery} variant="page" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
