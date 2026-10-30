"use client";

import Link from "next/link";
import { profileCopy } from "@/lib/profile-copy";
import { REGIONAL_ARTWORK } from "@/lib/regional-artwork";

import { Brand } from "./Brand";
import { useFeedback } from "./FeedbackProvider";
import { useLanguage } from "./LanguageProvider";

export function Footer() {
  const { openFeedback } = useFeedback();
  const { locale, copy } = useLanguage();
  const artwork = locale === "ru" ? null : REGIONAL_ARTWORK[locale];

  return (
    <footer className="site-footer content-gutter pb-3 pt-1 sm:pb-6 sm:pt-2">
      <div className="flex flex-col gap-3 rounded-[14px] bg-[#102f50] px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:rounded-[18px] sm:px-7 sm:py-5">
        <div className="[&_span]:text-white">
          <Brand />
          <p className="mt-2 text-[0.65625rem] leading-[1.5] text-[#b9c8d4]">
            {copy.footer.tagline}
          </p>
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
            <li><Link className="focus-ring rounded hover:text-white" href="/profile">{profileCopy[locale].nav}</Link></li>
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
              <Link className="focus-ring rounded hover:text-white" href="/support">
                {copy.support.nav}
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
