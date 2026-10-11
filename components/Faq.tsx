"use client";

import { ChevronDown, HelpCircle } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export function Faq() {
  const { copy } = useLanguage();
  return (
    <section
      id="questions"
      aria-labelledby="faq-title"
      className="site-faq content-gutter scroll-mt-20 pb-5 pt-5 sm:pb-10 sm:pt-10"
    >
      <div className="grid gap-4 border-t border-[#d8d4cd] pt-5 sm:gap-7 sm:pt-8 lg:grid-cols-[0.62fr_1.38fr] lg:gap-12">
        <div>
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#e2ebef] text-[#315f78] sm:h-10 sm:w-10 sm:rounded-[12px]">
            <HelpCircle size={18} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <h2
            id="faq-title"
            className="mt-2.5 font-serif text-[1.5625rem] leading-[1.08] font-semibold tracking-[-0.035em] text-ink sm:mt-4 sm:text-[2.125rem]"
          >
            {copy.faq.title}
          </h2>
          <p className="mt-1.5 max-w-[390px] text-[0.65625rem] leading-[1.45] text-[#68778a] sm:mt-3 sm:text-[0.78125rem] sm:leading-[1.6]">
            {copy.faq.intro}
          </p>
        </div>

        <div className="divide-y divide-[#d9d7d1] border-y border-[#d9d7d1]">
          {copy.faq.items.map((item) => (
            <details key={item.question} className="group">
              <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-lg py-2 marker:hidden sm:min-h-[58px] sm:gap-4 sm:py-3">
                <span className="min-w-0 flex-1 text-[0.6875rem] font-extrabold text-[#213e58] sm:text-[0.875rem]">
                  {item.question}
                </span>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#ece9e2] text-[#607181] transition-transform group-open:rotate-180 sm:h-8 sm:w-8 sm:rounded-[9px]">
                  <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
                </span>
              </summary>
              <p className="max-w-[720px] pb-3 pr-8 text-[0.625rem] leading-[1.5] text-[#68778a] sm:pb-4 sm:pr-10 sm:text-[0.78125rem] sm:leading-[1.65]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
