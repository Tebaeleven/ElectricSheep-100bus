"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import {
  SITE_LINK_CATEGORIES,
  linkBlurb,
  linkLabel,
  searchSiteLinks,
  type SiteLink,
  type SiteLinkCategory,
} from "@/data/site-links";

type SiteSearchProps = {
  initialQuery?: string;
  variant?: "page" | "section";
};

export function SiteSearch({
  initialQuery = "",
  variant = "page",
}: SiteSearchProps) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<SiteLinkCategory | "all">("all");

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const results = useMemo(() => {
    const found = searchSiteLinks(query);
    if (category === "all") return found;
    return found.filter((link) => link.category === category);
  }, [query, category]);

  return (
    <div className={cn(variant === "page" && "space-y-5")}>
      <form
        action="/links"
        method="get"
        role="search"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          if (variant === "section") return;
          const params = new URLSearchParams();
          const q = query.trim();
          if (q) params.set("q", q);
          const next = params.toString();
          const url = next ? `/links?${next}` : "/links";
          if (url !== `${window.location.pathname}${window.location.search}`) {
            e.preventDefault();
            window.history.replaceState(null, "", url);
          } else {
            e.preventDefault();
          }
        }}
      >
        <label className="sr-only" htmlFor="site-link-search">
          {t.site.search.label}
        </label>
        <div className="flex gap-2">
          <input
            id="site-link-search"
            name="q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.site.search.placeholder}
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-[#302c55] outline-none ring-[hsl(var(--ring))] placeholder:text-slate-400 focus:ring-2"
          />
          <button
            type="submit"
            className="h-12 shrink-0 rounded-2xl bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-white card-button"
          >
            {t.site.search.submit}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CategoryChip
            active={category === "all"}
            onClick={() => setCategory("all")}
          >
            {t.site.search.all}
          </CategoryChip>
          {SITE_LINK_CATEGORIES.map((id) => (
            <CategoryChip
              key={id}
              active={category === id}
              onClick={() => setCategory(id)}
            >
              {t.site.category[id]}
            </CategoryChip>
          ))}
        </div>
      </form>

      <p className="text-xs text-slate-500">{t.site.search.count(results.length)}</p>

      {results.length === 0 ? (
        <p className="rounded-2xl bg-white/90 px-4 py-8 text-center text-sm text-slate-500">
          {t.site.search.empty}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {results.map((link) => (
            <li key={link.id}>
              <LinkCard link={link} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-[11px] font-semibold",
        active
          ? "bg-[#302c55] text-white"
          : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-[#302c55]"
      )}
    >
      {children}
    </button>
  );
}

function LinkCard({
  link,
  locale,
}: {
  link: SiteLink;
  locale: "ja" | "en";
}) {
  const { t } = useI18n();
  const Comp = link.external ? "a" : Link;
  const extra = link.external
    ? { target: "_blank", rel: "noreferrer" }
    : {};
  return (
    <Comp
      href={link.href}
      {...extra}
      className="block h-full rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-transparent transition hover:ring-slate-200"
    >
      <p className="text-[10px] font-semibold tracking-wide text-[hsl(var(--primary))]">
        {t.site.category[link.category]}
      </p>
      <p className="mt-1 font-semibold text-[#302c55]">
        {linkLabel(link, locale)}
        {link.external ? (
          <span className="ml-1 text-xs font-normal text-slate-400" aria-hidden>
            ↗
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {linkBlurb(link, locale)}
      </p>
    </Comp>
  );
}
