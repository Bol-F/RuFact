"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { DEFAULT_LOCALE, getTranslations, type AppLocale } from "@/lib/i18n";
import { artworkSrcSet, HERO_ARTWORK, HERO_ARTWORK_SIZES, HIDDEN_ARTWORK_PIXEL } from "@/lib/hero-artwork";

const regions = { ru: "russia", uz: "uzbekistan", en: "united-kingdom" } as const;
const retryLabels = { ru: "Повторить загрузку изображения", uz: "Rasmni qayta yuklash", en: "Retry image loading" } as const;
function subscribeViewport(listener: () => void) {
  const media = window.matchMedia("(min-width: 768px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
function desktopSnapshot() { return window.matchMedia("(min-width: 768px)").matches; }
function serverSnapshot() { return false; }

type LoadedArtwork = { image: HTMLImageElement; decoded: Promise<void> };

export function HeroArtwork({ locale, noteLeft, noteRight }: { locale: AppLocale; noteLeft: string; noteRight: string }) {
  const isDesktop = useSyncExternalStore(subscribeViewport, desktopSnapshot, serverSnapshot);
  // At most three public assets per mounted hero; never stores submitted user text.
  const decoded = useRef(new Map<AppLocale, LoadedArtwork>());
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ displayed: AppLocale; requested: AppLocale; attempt: number; hasReady: boolean; status: "loading" | "ready" | "error" }>({
    displayed: DEFAULT_LOCALE, requested: DEFAULT_LOCALE, attempt: 0, hasReady: false, status: "loading",
  });

  useEffect(() => {
    if (!isDesktop) return;
    let active = true;
    let pending = decoded.current.get(locale);
    if (!pending) {
      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = "high";
      image.sizes = HERO_ARTWORK_SIZES;
      image.srcset = artworkSrcSet(locale);
      image.src = HERO_ARTWORK[locale].src;
      pending = { image, decoded: image.decode() };
      decoded.current.set(locale, pending);
    }
    const entry = pending;
    entry.decoded.then(() => {
      if (active) setState({ displayed: locale, requested: locale, attempt, hasReady: true, status: "ready" });
    }).catch(() => {
      // Allow a retry; a late failure/success must not replace a newer selection.
      if (decoded.current.get(locale) === entry) decoded.current.delete(locale);
      if (active) setState(previous => ({ ...previous, requested: locale, attempt, status: "error" }));
    });
    return () => { active = false; };
  }, [locale, isDesktop, attempt]);

  const displayed = isDesktop && state.hasReady ? state.displayed : locale;
  const isRegional = displayed !== "ru";
  const status = !isDesktop ? "hidden" : state.requested === locale && state.attempt === attempt ? state.status : "loading";
  const artwork = HERO_ARTWORK[displayed];

  return (
    <motion.div
      initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      data-region={regions[displayed]} data-artwork-locale={displayed} data-artwork-state={status}
      className={`hero-artwork${isRegional ? " regional-artwork" : ""}`}
    >
      <picture className="hero-picture">
        <source media="(max-width: 767px)" srcSet={HIDDEN_ARTWORK_PIXEL} />
        <source srcSet={artworkSrcSet(displayed)} sizes={HERO_ARTWORK_SIZES} />
        <Image src={artwork.src} alt={isRegional ? "" : getTranslations(displayed).hero.imageAlt} fill
          loading="eager" fetchPriority="high" decoding="async" sizes={HERO_ARTWORK_SIZES}
          className={`hero-collage${isRegional ? " regional-collage" : ""}`} />
      </picture>
      <div className={`hero-note hero-note-start font-hand${isRegional ? " regional-note regional-note-start" : ""}`} aria-hidden="true">
        {noteLeft.split("\n").map(line => <span className="block" key={line}>{line}</span>)}
        <svg width="68" height="32" viewBox="0 0 68 32" fill="none" className="ml-11 mt-0 rotate-[17deg]" aria-hidden="true">
          <path d="M2 25C20 4 39 5 60 18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M53 11L61 18L51 19" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className={`hero-note hero-note-end font-hand${isRegional ? " regional-note regional-note-end" : ""}`} aria-hidden="true">
        {noteRight.split("\n").map(line => <span className="block" key={line}>{line}</span>)}
        <span className="hero-note-underline mt-2 block h-px w-14 -rotate-6" />
      </div>
      {status === "error" ? <button type="button" data-artwork-retry onClick={() => setAttempt(value => value + 1)}
        className="focus-ring absolute bottom-1 right-1 z-10 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cbd8d0] bg-white/90 px-3 text-xs font-semibold text-ink">
        <RefreshCw size={14} aria-hidden="true" />{retryLabels[locale]}
      </button> : null}
    </motion.div>
  );
}
