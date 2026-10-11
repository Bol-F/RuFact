"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import { chatCopy } from "@/lib/chat-copy";
import { REGIONAL_ARTWORK } from "@/lib/regional-artwork";

import { Brand } from "./Brand";
import { useFeedback } from "./FeedbackProvider";
import { useLanguage } from "./LanguageProvider";
import { TextSizeControl } from "./TextSizeControl";

export function Footer() {
  const { openFeedback } = useFeedback();
  const { locale, copy } = useLanguage();
  const artwork = locale === "ru" ? null : REGIONAL_ARTWORK[locale];

  return (
    <footer className="site-footer content-gutter pb-3 pt-1 sm:pb-6 sm:pt-2">
      <div className="mb-3 rounded-[14px] border border-[#d7d8d3] bg-white/50 px-4 py-3">
        <TextSizeControl />
      </div>
      <div className="flex flex-col gap-3 rounded-[14px] bg-[#102f50] px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:rounded-[18px] sm:px-7 sm:py-5">
        <div className="[&_span]:text-white">
          <Brand />
          <p className="mt-2 text-[0.65625rem] leading-[1.5] text-[#b9c8d4]">
            {copy.footer.tagline}
          </p>
          <a
            href="https://t.me/RuFact_bot"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${chatCopy[locale].telegram}: @RuFact_bot`}
            className="focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-[0.75rem] font-semibold text-white transition-colors hover:bg-white/20"
          >
            <Send size={15} aria-hidden="true" />
            Telegram · @RuFact_bot
          </a>
          {artwork ? (
            <p className="regional-artwork-credit mt-2 max-w-[420px] text-[0.65625rem] leading-[1.5] text-[#b9c8d4]">
              {artwork.credit}: <a className="focus-ring rounded underline underline-offset-2" href={artwork.source} target="_blank" rel="noopener noreferrer">{artwork.author}</a>
              {" · "}<a className="focus-ring rounded underline underline-offset-2" href={artwork.licenseUrl} target="_blank" rel="noopener noreferrer">{artwork.license}</a>
              <br />{artwork.adaptation}
            </p>
          ) : null}
        </div>
        <nav aria-label={copy.footer.navigation}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[0.65625rem] font-bold text-[#dbe4eb]">
            <li>
              <Link className="focus-ring rounded hover:text-white" href="/#analyzer">
                {copy.footer.check}
              </Link>
            </li>
            <li>
              <Link className="focus-ring rounded hover:text-white" href="/model">
                {copy.navigation.model}
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={() => openFeedback({ source: "footer" })}
                className="focus-ring rounded hover:text-white"
              >
                {copy.navigation.feedback}
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
