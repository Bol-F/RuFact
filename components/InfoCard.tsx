"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { HERO_ARTWORK, HIDDEN_ARTWORK_PIXEL } from "@/lib/hero-artwork";

export type InfoCardVariant = "language" | "model" | "responsibility";

type InfoCardAction = {
  href: string;
  label: string;
};

type InfoCardProps = {
  variant: InfoCardVariant;
  icon: LucideIcon;
  title: string;
  description: string;
  annotation: string;
  action?: InfoCardAction;
  className?: string;
};

const variantStyles: Record<
  InfoCardVariant,
  { card: string; icon: string; title: string; body: string; annotation: string }
> = {
  language: {
    card: "border-[#d4e0e7] bg-[linear-gradient(128deg,#eaf4fb_0%,#f4f5f0_72%,#f7f2e9_100%)]",
    icon: "bg-[#d5e9f7] text-[#24598a] shadow-[0_7px_18px_rgba(42,89,133,0.10)]",
    title: "font-serif font-semibold",
    body: "max-w-[18rem] text-[#66758c] lg:max-w-[15.5rem]",
    annotation: "right-5 top-5 max-w-[8rem] -rotate-6 text-[#7b8ca1]",
  },
  model: {
    card: "border-[#eaded2] bg-[linear-gradient(135deg,#fffaf4_0%,#fbefe4_100%)]",
    icon: "bg-[#f7dfcc] text-[#b84a22] shadow-[0_7px_18px_rgba(184,74,34,0.10)]",
    title: "font-sans font-extrabold tracking-[-0.025em]",
    body: "max-w-[18rem] text-[#66758c] lg:max-w-[16rem]",
    annotation: "right-4 top-4 max-w-[7.5rem] -rotate-5 text-[#9a8e87]",
  },
  responsibility: {
    card: "border-[#d5dfcf] bg-[linear-gradient(130deg,#f5f8f0_0%,#eaf1e4_100%)]",
    icon: "bg-[#dbe9d4] text-[#2b6941] shadow-[0_7px_18px_rgba(43,105,65,0.10)]",
    title: "font-sans font-extrabold tracking-[-0.025em]",
    body: "max-w-[19rem] text-[#667266] lg:max-w-[15.75rem]",
    annotation: "right-5 top-4 max-w-[7.75rem] -rotate-6 text-[#7e8e7d]",
  },
};

function CardDecoration({ variant }: { variant: InfoCardVariant }) {
  if (variant === "language") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-10 -top-16 h-40 w-56 rounded-[47%_53%_57%_43%/44%_42%_58%_56%] bg-white/35" />
        <div className="absolute -bottom-8 left-[24%] h-[8.5rem] w-[82%] opacity-80 [mask-image:linear-gradient(to_top,black_58%,transparent_100%)]">
          <picture className="relative block h-full w-full">
          <source media="(max-width: 767px)" srcSet={HIDDEN_ARTWORK_PIXEL} />
          <Image
            src={HERO_ARTWORK.ru.small}
            alt=""
            fill
            loading="lazy"
            sizes="(max-width: 1024px) 80vw, 32vw"
            className="object-contain object-right-bottom"
          />
          </picture>
        </div>
      </div>
    );
  }

  if (variant === "model") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-12 -top-12 h-32 w-44 rotate-12 bg-[#f4e8da]/70 [clip-path:polygon(13%_0,100%_4%,86%_82%,39%_100%,0_46%)]" />
        <div className="absolute -bottom-20 right-2 h-40 w-64 rounded-t-[100%] bg-[#e8a070]/75" />
        <div className="absolute -bottom-24 right-20 h-40 w-60 rounded-t-[100%] bg-[#efc39e]/90" />
        <div className="absolute -bottom-24 -right-16 h-44 w-60 rounded-t-[100%] bg-[#315c83]/88" />
        <span className="absolute bottom-[3.1rem] right-[7.5rem] h-px w-10 -rotate-[20deg] bg-[#d66535]" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -right-12 -top-14 h-40 w-56 rounded-[56%_44%_47%_53%/39%_57%_43%_61%] bg-white/38" />
      <div className="absolute -bottom-10 -right-7 h-[12.5rem] w-[58%] min-w-52 opacity-95">
        <picture className="relative block h-full w-full">
        <source media="(max-width: 767px)" srcSet={HIDDEN_ARTWORK_PIXEL} />
        <Image
          src="/botanical-leaves.png"
          alt=""
          fill
          sizes="(max-width: 1024px) 48vw, 24vw"
          className="object-contain object-right-bottom"
        />
        </picture>
      </div>
    </div>
  );
}

export function InfoCard({
  variant,
  icon: Icon,
  title,
  description,
  annotation,
  action,
  className = "",
}: InfoCardProps) {
  const reduceMotion = useReducedMotion();
  const styles = variantStyles[variant];

  return (
    <motion.article
      whileHover={reduceMotion ? undefined : { y: -4 }}
      transition={{ type: "spring", stiffness: 320, damping: 25 }}
      className={`relative isolate min-h-[205px] overflow-hidden rounded-[19px] border px-5 py-[17px] shadow-[0_10px_26px_rgba(31,47,58,0.045)] lg:min-h-[188px] ${styles.card} ${className}`}
    >
      <CardDecoration variant={variant} />

      <div className="relative z-10 flex h-full max-w-[72%] flex-col sm:max-w-[68%] lg:max-w-[70%]">
        {variant === "language" ? (
          <div className="mb-2.5">
            <span
              className={`inline-flex h-11 w-11 items-center justify-center rounded-[13px] ${styles.icon}`}
              aria-hidden="true"
            >
              <Icon size={24} strokeWidth={1.9} />
            </span>
            <h3 className={`mt-2.5 text-[1.125rem] leading-[1.12] text-ink sm:text-[1.1875rem] ${styles.title}`}>
              {title}
            </h3>
          </div>
        ) : (
          <div className="mb-2 flex items-start gap-3.5">
            <span
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] ${styles.icon}`}
              aria-hidden="true"
            >
              <Icon size={24} strokeWidth={1.9} />
            </span>
            <h3 className={`pt-1 text-[1.125rem] leading-[1.12] text-ink sm:text-[1.1875rem] ${styles.title}`}>
              {title}
            </h3>
          </div>
        )}

        <p className={`text-[0.78125rem] leading-[1.45] sm:text-[0.8125rem] ${styles.body}`}>{description}</p>

        {action ? (
          <Link
            href={action.href}
            className="focus-ring mt-2 inline-flex w-fit items-center gap-2 rounded-xl bg-[#fffdf9]/90 px-3.5 py-2 text-[0.75rem] font-bold text-ink shadow-[0_5px_14px_rgba(33,44,52,0.06)] transition-colors hover:bg-white"
          >
            {action.label}
            <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <p
        className={`font-hand absolute z-10 hidden text-[1rem] leading-[1.02] sm:block ${styles.annotation}`}
        aria-hidden="true"
      >
        {annotation}
      </p>
    </motion.article>
  );
}
