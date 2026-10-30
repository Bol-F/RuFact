"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, MessageCircle, Sparkles, UserRound, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { Brand } from "./Brand";
import { useFeedback } from "./FeedbackProvider";
import { useLanguage } from "./LanguageProvider";
import { chatCopy } from "@/lib/chat-copy";

const ProfileDialog = dynamic(() => import("./ProfileDialog").then(module => module.ProfileDialog), { ssr: false });
const profileLabels = { uz: "Profil va sozlamalar", ru: "Профиль и настройки", en: "Profile and settings" };
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

interface ChatNavigationLinkProps {
  label: string;
  accessibleLabel: string;
  active: boolean;
  compact?: boolean;
  onClick?: () => void;
}

function ChatNavigationLink({
  label,
  accessibleLabel,
  active,
  compact = false,
  onClick,
}: ChatNavigationLinkProps) {
  return (
    <Link
      href="/chat"
      aria-label={accessibleLabel}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`header-chat focus-ring${compact ? " header-chat--compact" : ""}`}
    >
      <span className="header-chat-mark" aria-hidden="true">
        <MessageCircle size={18} strokeWidth={1.8} />
        <span className="header-chat-spark"><Sparkles size={11} strokeWidth={2} /></span>
      </span>
      <span className="header-chat-label">{label}</span>
      <ArrowUpRight className="header-chat-arrow" size={14} aria-hidden="true" />
    </Link>
  );
}

export function Header() {
  const profileReady = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { openFeedback } = useFeedback();
  const { copy, locale } = useLanguage();
  const pathname = usePathname();
  const profileReturnFocus = useRef<HTMLElement | null>(null);
  function closeProfile() {
    setIsProfileOpen(false);
    requestAnimationFrame(() => profileReturnFocus.current?.focus({ preventScroll: true }));
  }
  function openProfile(event: { currentTarget: HTMLButtonElement }) {
    setIsOpen(false);
    if (pathname === "/profile") {
      document.getElementById("profile-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    profileReturnFocus.current = event.currentTarget;
    setIsProfileOpen(true);
  }
  const navigation = [
    { label: copy.navigation.model, href: "/model" },
    { label: copy.support.nav, href: "/support" },
  ];

  return (
    <header id="top" className="site-header content-gutter relative z-50">
      <div className="flex min-h-[62px] items-center justify-between gap-4 sm:min-h-[88px] lg:min-h-[98px]">
        <Brand />

        <nav aria-label={copy.navigation.main} className="hidden xl:block">
          <ul className="flex items-center gap-4 text-[0.875rem] font-medium text-[#173552]">
            <li>
              <ChatNavigationLink
                label={chatCopy[locale].nav}
                accessibleLabel={chatCopy[locale].open}
                active={pathname === "/chat"}
              />
            </li>
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
          <button type="button" data-profile-trigger disabled={!profileReady} aria-label={profileLabels[locale]} aria-haspopup={pathname === "/profile" ? undefined : "dialog"} aria-current={pathname === "/profile" ? "page" : undefined} onClick={openProfile}
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-[var(--region-border,#d7d8d3)] bg-white/70 px-4 text-sm font-semibold">
            <UserRound size={17} aria-hidden="true" />{profileLabels[locale]}
          </button>
          <button
            type="button"
            onClick={() => openFeedback({ source: "header" })}
            className="header-feedback focus-ring inline-flex min-h-11 items-center rounded-[13px] bg-ink-deep px-6 text-[0.875rem] font-semibold text-white shadow-[0_7px_18px_rgba(10,41,73,0.16)] transition-transform hover:-translate-y-0.5"
          >
            {copy.navigation.feedback}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2 xl:hidden">
          {pathname !== "/chat" ? (
            <ChatNavigationLink
              label={chatCopy[locale].nav}
              accessibleLabel={chatCopy[locale].open}
              active={false}
              compact
            />
          ) : null}
          <button type="button" data-profile-trigger disabled={!profileReady} aria-label={profileLabels[locale]} aria-haspopup={pathname === "/profile" ? undefined : "dialog"} aria-current={pathname === "/profile" ? "page" : undefined} onClick={openProfile}
            className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--region-border,#d7d8d3)] bg-white/70">
            <UserRound size={18} aria-hidden="true" />
          </button>
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
              <li>
                <ChatNavigationLink
                  label={chatCopy[locale].nav}
                  accessibleLabel={chatCopy[locale].open}
                  active={pathname === "/chat"}
                  onClick={() => setIsOpen(false)}
                />
              </li>
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className="focus-ring block rounded-xl px-3 py-2.5 hover:bg-[#f0ece4]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
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
      {isProfileOpen ? <ProfileDialog onClose={closeProfile} /> : null}
    </header>
  );
}
