"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { languageNames, localeTags, SUPPORTED_LOCALES } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, copy } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const triggerId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const openingFocus = useRef(0);
  const leavingWithTab = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    options.current[openingFocus.current]?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [isOpen]);

  function openMenu(index: number) {
    openingFocus.current = index;
    leavingWithTab.current = false;
    setIsOpen(true);
  }

  function closeAndRestoreFocus() {
    setIsOpen(false);
    trigger.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = options.current.findIndex((option) => option === document.activeElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (current + 1) % SUPPORTED_LOCALES.length;
    else if (event.key === "ArrowUp") next = (current - 1 + SUPPORTED_LOCALES.length) % SUPPORTED_LOCALES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = SUPPORTED_LOCALES.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
      return;
    } else if (event.key === "Tab") {
      leavingWithTab.current = true;
    } else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey && event.key !== " ") {
      const match = SUPPORTED_LOCALES.findIndex((item) =>
        languageNames[item].toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()) || item.startsWith(event.key.toLowerCase()),
      );
      if (match >= 0) next = match;
    }
    if (next !== undefined) {
      event.preventDefault();
      options.current[next]?.focus();
    }
  }

  return (
    <div
      ref={wrapper}
      className={`language-switcher-wrap${compact ? " language-switcher-compact" : ""}`}
      onBlur={(event) => {
        if (leavingWithTab.current || !event.currentTarget.contains(event.relatedTarget)) {
          leavingWithTab.current = false;
          setIsOpen(false);
        }
      }}
    >
      <button
        ref={trigger}
        id={triggerId}
        data-language-trigger
        type="button"
        className="language-switcher language-menu-trigger focus-ring"
        aria-label={`${copy.navigation.language}: ${languageNames[locale]}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => isOpen ? setIsOpen(false) : openMenu(SUPPORTED_LOCALES.indexOf(locale))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowDown" ? 0 : SUPPORTED_LOCALES.length - 1);
          }
        }}
      >
        <Languages className="language-trigger-icon" size={16} strokeWidth={1.9} aria-hidden="true" />
        <span lang={localeTags[locale]}>{languageNames[locale]}</span>
        <ChevronDown className="language-trigger-chevron" size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div id={menuId} role="menu" aria-labelledby={triggerId} className="language-menu" onKeyDown={handleMenuKeyDown}>
          {SUPPORTED_LOCALES.map((item, index) => (
            <button
              key={item}
              ref={(element) => { options.current[index] = element; }}
              type="button"
              role="menuitemradio"
              lang={localeTags[item]}
              aria-checked={item === locale}
              aria-label={languageNames[item]}
              tabIndex={-1}
              className="language-menu-option"
              onClick={() => {
                setLocale(item);
                closeAndRestoreFocus();
              }}
            >
              <span className="language-option-code" aria-hidden="true">{item.toUpperCase()}</span>
              <span className="language-option-name">{languageNames[item]}</span>
              {item === locale ? <Check className="language-option-check" size={17} strokeWidth={2.2} aria-hidden="true" /> : <span className="language-option-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
