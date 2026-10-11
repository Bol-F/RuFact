"use client";

import { ArrowDown, ArrowUpRight, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { chatCopy } from "@/lib/chat-copy";
import { REGIONAL_ARTWORK } from "@/lib/regional-artwork";
import { useLanguage } from "./LanguageProvider";

/** Regional presentation only: checking, sources and state are shared across locales. */
export function RegionalHero() {
  const { locale, copy } = useLanguage();
  if (locale === "ru") return null;
  const uzbek = locale === "uz";
  const artwork = REGIONAL_ARTWORK[locale];

  return (
    <section id="how-it-works" aria-labelledby="hero-heading" data-region={uzbek ? "uzbekistan" : "united-kingdom"} className="regional-hero content-gutter">
      <div className="regional-hero-copy">
        <h1 id="hero-heading" className="font-serif">
          <span className="regional-title-first">{copy.hero.desktopLine1}</span>{" "}
          <span className="regional-title-accent">{copy.hero.desktopLine2}</span>{" "}
          <span className="regional-title-last">{copy.hero.desktopLine3}</span>
        </h1>
        <p className="regional-description">{copy.hero.desktopDescription}</p>
        <div className="regional-hero-actions">
          <Link href="/#analyzer" className="regional-primary focus-ring">{copy.analyzer.submit}<ArrowDown size={17} aria-hidden="true" /></Link>
          <Link href="/chat" aria-label={chatCopy[locale].open} className="regional-secondary focus-ring"><MessageCircle size={17} aria-hidden="true" />{chatCopy[locale].nav}<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
      <div className="regional-artwork" aria-hidden="true">
        <picture>
          {/* Hidden on phones: a tiny local data source avoids downloading decorative artwork. */}
          <source media="(max-width: 767px)" srcSet="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
          <Image src={artwork.src} alt="" fill sizes="(max-width: 1023px) 45vw, 680px" loading="eager" fetchPriority="high" className="regional-collage" />
        </picture>
        <div className="regional-note regional-note-start font-hand">
          {copy.hero.noteLeft.split("\n").map((line) => <span className="block" key={line}>{line}</span>)}
          <svg width="68" height="32" viewBox="0 0 68 32" fill="none" className="regional-note-arrow" aria-hidden="true">
            <path d="M2 25C20 4 39 5 60 18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M53 11L61 18L51 19" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="regional-note regional-note-end font-hand">
          {copy.hero.noteRight.split("\n").map((line) => <span className="block" key={line}>{line}</span>)}
          <span className="regional-note-underline" />
        </div>
      </div>
    </section>
  );
}
