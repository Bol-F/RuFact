"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, MessageCircle } from "lucide-react";
import { chatCopy } from "@/lib/chat-copy";
import { REGIONAL_ARTWORK } from "@/lib/regional-artwork";

import { MODEL_QUALITY } from "@/lib/model-quality";
import { useLanguage } from "./LanguageProvider";

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

      <motion.div
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        data-region={region}
        className={`hero-artwork${artwork ? " regional-artwork" : ""}`}
      >
        <picture className="hero-picture">
          <source media="(max-width: 767px)" srcSet="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
          <Image
            src={artwork?.src ?? "/hero-collage.png"}
            alt={artwork ? "" : copy.hero.imageAlt}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(max-width: 1023px) 92vw, 640px"
            className={`hero-collage${artwork ? " regional-collage" : ""}`}
          />
        </picture>

        <div className={`hero-note hero-note-start font-hand${artwork ? " regional-note regional-note-start" : ""}`} aria-hidden="true">
          {copy.hero.noteLeft.split("\n").map((line) => <span className="block" key={line}>{line}</span>)}
          <svg
            width="68"
            height="32"
            viewBox="0 0 68 32"
            fill="none"
            className="ml-11 mt-0 rotate-[17deg]"
            aria-hidden="true"
          >
            <path d="M2 25C20 4 39 5 60 18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M53 11L61 18L51 19" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className={`hero-note hero-note-end font-hand${artwork ? " regional-note regional-note-end" : ""}`} aria-hidden="true">
          {copy.hero.noteRight.split("\n").map((line) => <span className="block" key={line}>{line}</span>)}
          <span className="hero-note-underline mt-2 block h-px w-14 -rotate-6" />
        </div>
      </motion.div>
    </section>
  );
}
