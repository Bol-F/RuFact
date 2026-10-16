"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Brand } from "./Brand";
import { useFeedback } from "./FeedbackProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useLanguage } from "./LanguageProvider";
import { TextSizeControl } from "./TextSizeControl";
import { chatCopy } from "@/lib/chat-copy";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const { openFeedback } = useFeedback();
  const { copy, locale } = useLanguage();
  const pathname = usePathname();
  const navigation = [
    { label: chatCopy[locale].nav, href: "/chat" },
    { label: copy.navigation.how, href: "/#how-it-works" },
    { label: copy.navigation.model, href: "/model" },
    { label: copy.navigation.faq, href: "/#questions" },
    { label: copy.support.nav, href: "/support" },
  ];

  return (
    <header id="top" className="site-header content-gutter relative z-50">
      <div className="flex min-h-[62px] items-center justify-between gap-4 sm:min-h-[88px] lg:min-h-[98px]">
        <Brand />

        <nav aria-label={copy.navigation.main} className="hidden xl:block">
          <ul className="flex items-center gap-4 text-[0.875rem] font-medium text-[#173552]">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  className="focus-ring rounded-md transition-colors hover:text-accent"
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 xl:flex">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => openFeedback({ source: "header" })}
            className="header-feedback focus-ring inline-flex min-h-11 items-center rounded-[13px] bg-ink-deep px-6 text-[0.875rem] font-semibold text-white shadow-[0_7px_18px_rgba(10,41,73,0.16)] transition-transform hover:-translate-y-0.5"
          >
            {copy.navigation.feedback}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2 xl:hidden">
          {pathname !== "/chat" ? <Link href="/chat" aria-label={chatCopy[locale].open} className="header-chat focus-ring inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-[#cfdbd4] bg-[#edf3ee] px-3 text-xs font-bold text-[#376b60]"><MessageCircle size={16} /><span className="hidden min-[380px]:inline">{chatCopy[locale].nav}</span></Link> : null}
        <button
          type="button"
          className="header-menu focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[#d7d8d3] bg-[#fbfaf6] text-ink xl:hidden"
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          aria-label={isOpen ? copy.navigation.closeMenu : copy.navigation.openMenu}
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen ? (
          <motion.nav
            id="mobile-navigation"
            aria-label={copy.navigation.mobile}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute left-[14px] right-[14px] top-full max-h-[75dvh] overflow-y-auto rounded-[14px] border border-[#dedbd4] bg-[#fbf9f4] p-2.5 shadow-[0_18px_38px_rgba(21,38,54,0.14)] xl:hidden"
          >
            <ul className="grid gap-1 text-[0.875rem] font-semibold">
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="focus-ring block rounded-xl px-3 py-2.5 hover:bg-[#f0ece4]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-[#e3dfd7] px-3 pt-3">
              <LanguageSwitcher compact />
            </div>
            <div className="mt-2 border-t border-[#e3dfd7] px-3 pt-3">
              <TextSizeControl />
            </div>
            <div className="mt-2 border-t border-[#e3dfd7] px-3 pt-3">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  openFeedback({ source: "header" });
                }}
                className="focus-ring min-h-9 rounded-lg text-xs font-bold text-accent"
              >
                {copy.navigation.feedback}
              </button>
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
