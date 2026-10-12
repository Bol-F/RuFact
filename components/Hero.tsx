"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, MessageCircle } from "lucide-react";
import { chatCopy } from "@/lib/chat-copy";
import { REGIONAL_ARTWORK } from "@/lib/regional-artwork";

import { MODEL_QUALITY } from "@/lib/model-quality";
import { useLanguage } from "./LanguageProvider";
import { HeroArtwork } from "./HeroArtwork";

const enter = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export function Hero() {
  const accuracy = MODEL_QUALITY.metrics.find((metric) => metric.key === "accuracy")?.value;
  const { locale, copy } = useLanguage();

  const artwork = locale === "ru" ? null : REGIONAL_ARTWORK[locale];
  const region = locale === "ru" ? "russia" : locale === "uz" ? "uzbekistan" : "united-kingdom";

  return (
    <section
      id="how-it-works"
      aria-labelledby="hero-heading"
      data-region={region}
      className={`site-hero content-gutter${artwork ? " regional-hero" : ""}`}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        transition={{ staggerChildren: 0.08, delayChildren: 0.05 }}
        className="hero-copy relative z-10 min-w-0"
      >
        <motion.p
          variants={enter}
          transition={{ duration: 0.45 }}
          className="mb-1.5 text-[0.5625rem] font-bold uppercase tracking-[0.23em] text-[#718097] sm:mb-2 sm:text-xs sm:tracking-[0.28em]"
        >
          {copy.hero.eyebrow}
        </motion.p>

        <motion.h1
          id="hero-heading"
          variants={enter}
          transition={{ duration: 0.5 }}
          className="hero-heading font-serif font-semibold text-ink"
        >
          <span className="md:hidden">
            {copy.hero.mobileTitleStart}
            <br />
            <span className="hero-title-accent">{copy.hero.mobileTitleAccent}</span>
          </span>
          <span className="hidden md:inline">
            <span className="block">{copy.hero.desktopLine1}</span>
            <span className="hero-title-accent block">{copy.hero.desktopLine2}</span>
            <span className="hero-title-accent block">{copy.hero.desktopLine3}</span>
          </span>
        </motion.h1>

        <motion.p
          variants={enter}
          transition={{ duration: 0.5 }}
          className="mt-2 max-w-[615px] text-[0.75rem] leading-[1.45] text-[#607087] sm:mt-3 sm:text-[1rem] sm:leading-[1.52]"
        >
          <span className="md:hidden">
            {copy.hero.mobileDescription}
          </span>
          <span className="hidden md:inline">
            {copy.hero.desktopDescription}{locale === "ru" ? ` Русская ML-модель показала ${Math.round((accuracy ?? 0) * 100)}% accuracy на отдельной внешней выборке.` : ""}
          </span>
        </motion.p>
        <div className="relative mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
          <Link href="/#analyzer" className="hero-primary focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white">{chatCopy[locale].check}<ArrowDown size={16} aria-hidden="true" /></Link>
          <Link href="/chat" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#cbd8d0] bg-white/70 px-4 text-sm font-semibold"><MessageCircle size={17} aria-hidden="true" />{chatCopy[locale].open}<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
      </motion.div>

      <HeroArtwork locale={locale} noteLeft={copy.hero.noteLeft} noteRight={copy.hero.noteRight} />
    </section>
  );
}
