"use client";

import { DemoConsole } from "@/components/demo/DemoConsole";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteSearch } from "@/components/site/SiteSearch";
import { Button } from "@/components/ui/button";
import { INITIAL_PARTY } from "@/data/party";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

const TEAM_IDS = ["ghost"] as const;

export function LandingPage() {
  const { t } = useI18n();

  useEffect(() => {
    if (window.petassist) window.location.replace("/desk");
  }, []);

  const team = TEAM_IDS.map(
    (id) => INITIAL_PARTY.find((p) => p.id === id) ?? INITIAL_PARTY[0]!
  );
  const heroPet = INITIAL_PARTY[0]!;

  return (
    <div className="site-page min-h-screen">
      <SiteHeader />
      <main>
        <section className="site-hero relative overflow-hidden px-4 pb-16 pt-12 sm:pt-16">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <motion.p
                className="site-eyebrow"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {t.site.hero.badge}
              </motion.p>
              <motion.h1
                className="site-display mt-3"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 }}
              >
                {t.site.hero.title}
              </motion.h1>
              <motion.p
                className="mt-5 max-w-xl text-sm leading-[1.75] text-[#5a6478] sm:text-[0.95rem] sm:leading-[1.8]"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
              >
                {t.site.hero.lead}
              </motion.p>
              <motion.div
                className="mt-7 flex flex-wrap items-center gap-4"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
              >
                <Button asChild size="lg" className="site-cta">
                  <Link href="/download">{t.site.hero.ctaDownload}</Link>
                </Button>
                <a href="#desk" className="site-text-link">
                  {t.site.hero.ctaDesk}
                </a>
                <Link href="#problems" className="site-text-link">
                  {t.site.hero.whyPets} ↓
                </Link>
              </motion.div>
              <motion.p
                className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold leading-none text-[#6d7a93]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.34 }}
              >
                <span className="text-[#e56b8c]">●</span>
                {t.site.hero.trustScope}
                <span className="text-[#c9d0dc]">·</span>
                <span className="text-[#e56b8c]">●</span>
                {t.site.hero.trustAllow}
              </motion.p>
            </div>

            <motion.div
              id="desk"
              className="site-live-desk scroll-mt-24"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.65 }}
            >
              <p className="site-tape">{t.site.hero.permitHint}</p>
              <div className="site-real-window">
                <DemoConsole embedded />
              </div>
            </motion.div>
          </div>
        </section>

        <section id="problems" className="border-y border-[#302c55]/10 px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <p className="site-eyebrow">{t.site.problem.label}</p>
              <h2 className="site-display-md">{t.site.problem.title}</h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {t.site.problem.items.map((item, i) => (
                <article
                  key={item.title}
                  className={cn("site-fear", `site-fear-${i + 1}`)}
                >
                  <span>0{i + 1}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
            <p className="mt-16 ml-auto max-w-xl text-sm leading-[1.75] text-[#5a6478] sm:text-[0.95rem]">
              {t.site.features.desc}
            </p>
          </div>
        </section>

        <section className="site-rule" aria-label={t.site.rule.note}>
          <p>{t.site.rule.line}</p>
          <span>{t.site.rule.note}</span>
        </section>

        <section id="party" className="px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <div>
                <p className="site-eyebrow">{t.site.party.label}</p>
                <h2 className="site-display-md mt-2">{t.site.party.title}</h2>
              </div>
              <p className="max-w-md text-sm leading-[1.75] text-[#5a6478]">
                {t.site.party.hint}
              </p>
            </div>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {team.map((pet, i) => {
                const copy = t.pets[pet.id];
                const use = t.site.uses.items[i];
                return (
                  <article key={pet.id} className={cn("site-note", `site-note-${pet.id}`)}>
                    <div className="flex items-center gap-3">
                      <Image
                        src={pet.icon}
                        alt=""
                        width={64}
                        height={64}
                        className="object-contain"
                      />
                      <div>
                        <p className="site-eyebrow !mb-0">
                          0{i + 1} / {copy?.name ?? pet.nameJa}
                        </p>
                        <h3 className="mt-1 text-[1.05rem] font-bold leading-snug tracking-tight text-[#302c55] [text-wrap:balance]">
                          {use.title}
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-[#5a6478]">
                      {use.text}
                    </p>
                    <span className="site-stamp">{use.stamp}</span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how" className="site-how px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="site-tape relative left-0 top-0 mb-10 rotate-[-2deg]">
              {t.site.steps.label}
            </p>
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="site-eyebrow">{t.site.steps.label}</p>
                <h2 className="site-display-md mt-2">{t.site.steps.title}</h2>
              </div>
              <ol className="divide-y divide-[#302c55]/20 border-y border-[#302c55]/20">
                {t.site.steps.items.map((item, i) => (
                  <li
                    key={item.title}
                    className="grid grid-cols-[48px_1fr] gap-4 py-6"
                  >
                    <span className="font-mono text-[11px] font-semibold text-[#e56b8c]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-[1.05rem] font-bold leading-snug tracking-tight text-[#302c55] [text-wrap:balance]">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm leading-[1.7] text-[#5a6478]">
                        {item.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="features" className="px-4 py-20">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="site-eyebrow">{t.site.features.label}</p>
              <h2 className="site-display-md mt-2">{t.site.features.title}</h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-[#5a6478]">
                {t.site.pipe.foot}
              </p>
            </div>
            <div className="site-pipe">
              <p className="site-eyebrow mb-5">{t.site.pipe.label}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["pocket", "pocketHint"],
                    ["desk", "deskHint"],
                    ["forge", "forgeHint"],
                    ["model", "modelHint"],
                  ] as const
                ).map(([name, hint]) => (
                  <div key={name} className="site-pipe-node">
                    <small>{t.site.pipe[name]}</small>
                    <strong>{t.site.pipe[name]}</strong>
                    <span>{t.site.pipe[hint]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="site-closing">
          <div className="site-closing-visual">
            <p className="site-tape">{t.site.closing.tape}</p>
            <div className="site-closing-card">
              <Image
                src={heroPet.icon}
                alt=""
                width={72}
                height={72}
                className="object-contain"
              />
              <div>
                <small>{t.pets.ghost?.name ?? heroPet.nameJa}</small>
                <strong>{t.talk.ask}</strong>
                <span>{t.site.closing.wait}</span>
              </div>
            </div>
          </div>
          <div className="site-closing-copy">
            <p className="site-eyebrow !text-[#f4c4d0]">{t.brand.kicker}</p>
            <h2 className="site-display-md !text-white">{t.site.closing.title}</h2>
            <p>{t.site.closing.lead}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild size="lg" className="site-cta site-cta-on-ink">
                <Link href="/download">{t.site.hero.ctaDownload}</Link>
              </Button>
              <Link
                href="/desk"
                className="site-text-link !text-white !border-white/70"
              >
                {t.site.hero.ctaDesk}
              </Link>
            </div>
          </div>
        </section>

        <section id="links" className="border-y border-[#302c55]/10 px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <p className="site-eyebrow">{t.site.links.label}</p>
            <h2 className="site-display-md mt-2">{t.site.links.title}</h2>
            <p className="mt-3 max-w-2xl text-sm text-[#5a6478]">
              {t.site.links.hint}
            </p>
            <div className="mt-8">
              <SiteSearch variant="section" />
            </div>
          </div>
        </section>

        <section id="faq" className="px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <p className="site-eyebrow">{t.site.faq.label}</p>
            <h2 className="site-display-md mt-2">{t.site.faq.title}</h2>
            <div className="mt-8 space-y-2">
              {t.site.faq.items.map((item) => (
                <details
                  key={item.q}
                  className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm open:pb-4"
                >
                  <summary className="cursor-pointer list-none text-sm font-semibold leading-snug text-[#302c55] [text-wrap:pretty] [&::-webkit-details-marker]:hidden">
                    {item.q}
                  </summary>
                  <p className="mt-2 text-sm leading-[1.75] text-[#5a6478]">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
