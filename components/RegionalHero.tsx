"use client";

import { ArrowDown, ArrowUpRight, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { chatCopy } from "@/lib/chat-copy";
import { useLanguage } from "./LanguageProvider";

/** Regional presentation only: checking, sources and state are shared across locales. */
export function RegionalHero() {
  const { locale, copy } = useLanguage();
  if (locale === "ru") return null;
  const uzbek = locale === "uz";

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
          <Image src={uzbek ? "/hero-uzbekistan.webp" : "/hero-united-kingdom.webp"} alt="" fill sizes={uzbek ? "(max-width: 1023px) 45vw, 600px" : "1200px"} loading="eager" fetchPriority="high" className="object-cover" />
        </picture>
      </div>
    </section>
  );
}
