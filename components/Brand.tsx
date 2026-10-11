"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";

export function Brand() {
  const { locale } = useLanguage();
  const homeLabel = { uz: "RuFact — bosh sahifa", ru: "RuFact — на главную", en: "RuFact — home" }[locale];
  return (
    <Link
      href="/"
      aria-label={homeLabel}
      className="brand focus-ring inline-flex items-center gap-2 rounded-lg text-ink no-underline sm:gap-3"
    >
      <span className="relative block h-7 w-7 sm:h-9 sm:w-9" aria-hidden="true">
        <span className="absolute left-0 top-1 h-[22px] w-3 rotate-[13deg] rounded-[70%_35%_68%_32%] bg-[#113656] sm:h-7 sm:w-4" />
        <span className="absolute bottom-0 right-0 h-[22px] w-3 rotate-[32deg] rounded-[35%_70%_32%_68%] bg-[#e27a42] sm:h-7 sm:w-4" />
      </span>
      <span className="font-serif text-[1.5625rem] font-bold tracking-[-0.045em] sm:text-[2rem]">
        RuFact
      </span>
    </Link>
  );
}
