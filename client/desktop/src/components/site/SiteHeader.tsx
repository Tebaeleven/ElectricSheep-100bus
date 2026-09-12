"use client";

import { LocaleToggle } from "@/components/i18n/LocaleToggle";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const NAV = [
  { href: "/#features", key: "features" as const },
  { href: "/#uses", key: "uses" as const },
  { href: "/#party", key: "party" as const },
  { href: "/download", key: "download" as const },
  { href: "/links", key: "links" as const },
  { href: "/#faq", key: "faq" as const },
];

export function SiteHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const next = q.trim();
    router.push(next ? `/links?q=${encodeURIComponent(next)}` : "/links");
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#302c55]/10 bg-[#eef3f9]/92 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3">
        <Link href="/" className="min-w-0 shrink-0" onClick={() => setOpen(false)}>
          <p className="whitespace-nowrap text-[10px] font-semibold tracking-[0.18em] text-[#e56b8c]">
            {t.brand.kicker}
          </p>
          <p className="whitespace-nowrap text-base font-bold leading-tight text-[#302c55]">
            {t.brand.title}
          </p>
        </Link>

        <nav className="ml-2 hidden min-w-0 items-center lg:ml-4 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-2 py-1.5 text-[12px] font-medium text-[#6d7a93] hover:bg-white/80 hover:text-[#302c55] xl:px-3",
                pathname === item.href && "bg-white text-[#302c55]"
              )}
            >
              {t.site.nav[item.key]}
            </Link>
          ))}
        </nav>

        <form
          action="/links"
          method="get"
          role="search"
          onSubmit={onSearch}
          className="ml-auto hidden min-w-0 max-w-[13rem] flex-1 xl:block"
        >
          <label className="sr-only" htmlFor="header-link-search">
            {t.site.search.label}
          </label>
          <input
            id="header-link-search"
            name="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.site.search.placeholder}
            className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 px-3 text-xs text-[#302c55] outline-none ring-[hsl(var(--ring))] placeholder:text-slate-400 focus:bg-white focus:ring-2"
          />
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          <LocaleToggle />
          <Link
            href="/download"
            className="hidden whitespace-nowrap rounded-full bg-[#302c55] px-3 py-1.5 text-[12px] font-semibold text-white shadow-[3px_3px_0_#e56b8c] sm:inline-flex"
          >
            {t.site.nav.download}
          </Link>
          <Link
            href="/desk"
            className="hidden whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#302c55] hover:bg-white/80 sm:inline-flex"
          >
            {t.site.nav.desk}
          </Link>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#302c55] hover:bg-slate-100 lg:hidden"
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{t.menu.hamburger}</span>
            <span className="flex flex-col gap-1.5">
              <span
                className={cn(
                  "h-0.5 w-4 rounded-full bg-current transition",
                  open && "translate-y-2 rotate-45"
                )}
              />
              <span
                className={cn(
                  "h-0.5 w-4 rounded-full bg-current transition",
                  open && "opacity-0"
                )}
              />
              <span
                className={cn(
                  "h-0.5 w-4 rounded-full bg-current transition",
                  open && "-translate-y-2 -rotate-45"
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="site-mobile-nav"
          className="border-t border-[#302c55]/10 bg-[#eef3f9] px-4 py-3 lg:hidden"
        >
          <form action="/links" method="get" role="search" onSubmit={onSearch}>
            <input
              name="q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.site.search.placeholder}
              className="mb-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </form>
          <div className="grid gap-1">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-xl px-3 py-2 text-sm text-[#302c55] hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                {t.site.nav[item.key]}
              </Link>
            ))}
            <Link
              href="/download"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-[hsl(var(--primary))]"
              onClick={() => setOpen(false)}
            >
              {t.site.nav.download}
            </Link>
            <Link
              href="/desk"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-[hsl(var(--primary))]"
              onClick={() => setOpen(false)}
            >
              {t.site.nav.desk}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
