"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { chatCopy } from "@/lib/chat-copy";

import { MODEL_QUALITY } from "@/lib/model-quality";
import { useLanguage } from "./LanguageProvider";
import { RegionalHero } from "./RegionalHero";

const enter = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export function Hero() {
  const accuracy = MODEL_QUALITY.metrics.find((metric) => metric.key === "accuracy")?.value;
  const { locale, copy } = useLanguage();

  if (locale !== "ru") return <RegionalHero />;

  return (
    <section
      id="how-it-works"
      aria-labelledby="hero-heading"
      className="content-gutter relative grid gap-1 pb-3 pt-1 sm:min-h-[310px] sm:gap-5 sm:pb-9 sm:pt-3 lg:min-h-[286px] lg:grid-cols-[minmax(620px,1fr)_minmax(0,1fr)] lg:gap-0 lg:pb-0 lg:pt-0"
    >
      <motion.div
        initial="hidden"
        animate="visible"
        transition={{ staggerChildren: 0.08, delayChildren: 0.05 }}
        className="relative z-10 max-w-[655px]"
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
          className="max-w-[680px] font-serif text-[1.875rem] leading-[1.01] font-semibold tracking-[-0.045em] text-ink sm:text-[3rem] sm:leading-[1.03] lg:text-[3.1875rem] lg:leading-[0.96]"
        >
          <span className="sm:hidden">
            {copy.hero.mobileTitleStart}
            <br />
            <span className="text-[#c9421e]">{copy.hero.mobileTitleAccent}</span>
          </span>
          <span className="hidden sm:inline">
            {copy.hero.desktopLine1}
            <br />
            <span className="whitespace-nowrap">
              <span className="text-[#c9421e]">{copy.hero.desktopLine2}</span>
            </span>
            <br />
            <span className="text-[#c9421e]">{copy.hero.desktopLine3}</span>
          </span>
        </motion.h1>

        <motion.p
          variants={enter}
          transition={{ duration: 0.5 }}
          className="mt-2 max-w-[615px] text-[0.75rem] leading-[1.45] text-[#607087] sm:mt-3 sm:text-[1rem] sm:leading-[1.52]"
        >
          <span className="sm:hidden">
            {copy.hero.mobileDescription}
          </span>
          <span className="hidden sm:inline">
            {copy.hero.desktopDescription}{locale === "ru" ? ` Русская ML-модель показала ${Math.round((accuracy ?? 0) * 100)}% accuracy на отдельной внешней выборке.` : ""}
          </span>
        </motion.p>
        <div className="relative mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
          <Link href="/#analyzer" className="focus-ring inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-white">{chatCopy[locale].check} ↓</Link>
          <Link href="/chat" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#cbd8d0] bg-white/70 px-4 text-sm font-semibold"><MessageCircle size={17} />{chatCopy[locale].open} ↗</Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="relative -mx-4 hidden min-h-[280px] sm:block lg:-mr-[46px] lg:-ml-24 lg:min-h-[286px]"
      >
        <div className="absolute inset-x-0 bottom-[-2px] top-[-38px] sm:bottom-[-6px] sm:top-[-110px]">
          <Image
            src="/hero-collage.png"
            alt={copy.hero.imageAlt}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(max-width: 1024px) 100vw, 58vw"
            className="object-contain object-right-bottom"
          />
        </div>

        <div className="font-hand absolute left-[11%] top-[-2%] hidden -rotate-6 text-[1.1875rem] leading-[0.95] text-[#7b879a] xl:block">
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

        <div className="font-hand absolute right-[5%] top-[1%] hidden rotate-[-4deg] text-[1.125rem] leading-[1.04] text-[#66758c] xl:block">
          {copy.hero.noteRight.split("\n").map((line) => <span className="block" key={line}>{line}</span>)}
          <span className="mt-2 block h-px w-14 -rotate-6 bg-[#d6693a]" />
        </div>
      </motion.div>
    </section>
  );
}
