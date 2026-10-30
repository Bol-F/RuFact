"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, Check, History, Languages, Palette, RotateCcw, Search, Send, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";
import { ANALYSIS_HISTORY_MAX_ITEMS, type AnalysisHistoryEntry } from "@/lib/analysis-history";
import { localeTags } from "@/lib/i18n";
import { profileCopy } from "@/lib/profile-copy";
import { useLanguage } from "./LanguageProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { usePreferences } from "./PreferencesProvider";

const fontChoices = ["original", "sans", "serif"] as const;
const sizeChoices = ["normal", "large", "larger"] as const;
const designChoices = ["auto", "uz", "ru", "en"] as const;
const topicChoices = ["general", "news", "sport", "health", "science", "politics"] as const;
const fontStyles: Record<(typeof fontChoices)[number], CSSProperties> = {
  original: { fontFamily: "var(--font-manrope), sans-serif" },
  sans: { fontFamily: "var(--font-manrope), Arial, sans-serif" },
  serif: { fontFamily: "var(--font-lora), Georgia, serif" },
};
const swatches = { auto: ["#173d46", "#e47b40", "#078c91"], uz: ["#173d46", "#078c91", "#dcecea"], ru: ["#102f50", "#da4925", "#f0e9df"], en: ["#192e49", "#ad653f", "#eee8df"] } as const;

function SettingCard({ title, description, icon, children, id }: { title: string; description: string; icon: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="min-w-0 rounded-[20px] border border-[#d9dfdc] bg-white/80 p-4 shadow-[0_5px_24px_rgba(16,47,80,0.025)] sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/5 text-ink">{icon}</span>
        <div className="min-w-0"><h2 className="text-base font-bold text-ink sm:text-lg">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted">{description}</p></div>
      </div>
      {children}
    </section>
  );
}

function HistoryRestoreControl({ item, label, disabled, disabledReason, onRestore }: { item: AnalysisHistoryEntry; label: string; disabled: boolean; disabledReason: string; onRestore?: (item: AnalysisHistoryEntry) => void }) {
  const className = "focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-bold text-ink disabled:cursor-wait disabled:opacity-50";
  const content = <>{label}<ArrowUpRight size={14} aria-hidden="true" /></>;
  if (disabled) return <button type="button" disabled title={disabledReason} className={className}>{content}</button>;
  if (onRestore) return <button type="button" onClick={() => onRestore(item)} className={className}>{content}</button>;
  return <Link href={`/?history=${encodeURIComponent(item.id)}#analyzer`} className={className}>{content}</Link>;
}

export function ProfileSettings({ onClose, onRestore, restoreDisabled = false }: { onClose?: () => void; onRestore?: (item: AnalysisHistoryEntry) => void; restoreDisabled?: boolean }) {
  const { locale } = useLanguage();
  const { preferences, setPreference, resetPreferences, persistent, ready } = usePreferences();
  const copy = profileCopy[locale];
  const history = useAnalysisHistory();
  const [confirmation, setConfirmation] = useState<"clear" | "disable" | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function confirmHistoryChange() {
    if (confirmation === "disable") history.disable();
    else history.clear();
    setConfirmation(null);
  }

  const backClass = "focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-muted hover:text-ink";

  return (
    <div className="content-gutter pb-6 pt-2 sm:pb-10 sm:pt-4" data-testid="profile-settings">
      <div className="mx-auto max-w-5xl">
        {onClose ? <button type="button" onClick={onClose} className={`${backClass} sticky top-0 z-20 rounded-xl bg-paper/95 px-3 shadow-sm`}><ArrowLeft size={16} aria-hidden="true" />{copy.close}</button> : <Link href="/#analyzer" className={backClass}><ArrowLeft size={16} aria-hidden="true" />{copy.back}</Link>}
        <div className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
          <div className="max-w-2xl"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-accent">{copy.eyebrow}</p><h1 id="profile-heading" className="mt-2 font-serif text-[2rem] font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[2.75rem]">{copy.title}</h1><p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{copy.intro}</p></div>
          <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#d8e1dc] bg-white/70 px-3 text-xs font-semibold text-ink"><UserRound size={15} aria-hidden="true" />{copy.local}</span>
        </div>
        <p role="status" className={`mb-5 flex items-start gap-2 text-xs leading-relaxed ${persistent ? "text-muted" : "text-[#9c6534]"}`}><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{!ready ? copy.loading : persistent ? copy.saved : copy.sessionOnly}</p>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <SettingCard title={copy.interface} description={copy.interfaceText} icon={<BookOpen size={20} />}>
            <fieldset disabled={!ready} data-testid="profile-language">
              <legend className="mb-2 flex items-center gap-2 text-sm font-bold"><Languages size={15} aria-hidden="true" />{copy.language}</legend>
              <LanguageSwitcher compact />
            </fieldset>
            <fieldset disabled={!ready} className="mt-5" data-testid="profile-font"><legend className="mb-2 text-sm font-bold">{copy.font}</legend><div className="grid gap-2 sm:grid-cols-3">{fontChoices.map(value => <label key={value} className="min-w-0 cursor-pointer"><input type="radio" name="profile-font" value={value} checked={preferences.font === value} onChange={() => setPreference("font", value)} className="peer sr-only" /><span className={`flex min-h-[82px] flex-col rounded-xl border px-3 py-3 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${preferences.font === value ? "border-ink bg-ink/5" : "border-[#d7dedc] bg-white"}`}><span className="flex items-center justify-between gap-2 text-sm font-bold" style={fontStyles[value]}>{copy.fonts[value]}{preferences.font === value ? <Check size={14} aria-hidden="true" /> : null}</span><span className="mt-1 text-xs leading-relaxed text-muted">{copy.fontNotes[value]}</span></span></label>)}</div></fieldset>
            <fieldset disabled={!ready} className="mt-5" data-testid="profile-text-size"><legend className="mb-2 text-sm font-bold">{copy.size}</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{sizeChoices.map((value, index) => <label key={value} className="min-w-0 cursor-pointer"><input type="radio" name="profile-text-size" value={value} checked={preferences.textSize === value} onChange={() => setPreference("textSize", value)} className="peer sr-only" /><span className={`flex min-h-12 items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${preferences.textSize === value ? "border-ink bg-ink/5" : "border-[#d7dedc] bg-white"}`}><span className="mr-2 hidden font-bold sm:inline" aria-hidden="true" style={{ fontSize: `${14 + index * 3}px` }}>A</span>{copy.sizes[value]}</span></label>)}</div></fieldset>
            <p className="mt-4 rounded-xl bg-[#f3f5f2] px-4 py-3 text-sm leading-relaxed text-ink" aria-label={copy.preview}>{copy.preview}</p>
          </SettingCard>

          <div className="grid min-w-0 gap-4">
            <SettingCard title={copy.design} description={copy.designText} icon={<Palette size={20} />}>
              <fieldset disabled={!ready} data-testid="profile-design"><legend className="sr-only">{copy.design}</legend><div className="grid grid-cols-2 gap-2">{designChoices.map(value => <label key={value} className="min-w-0 cursor-pointer"><input type="radio" name="profile-design" value={value} checked={preferences.design === value} onChange={() => setPreference("design", value)} className="peer sr-only" /><span className={`flex min-h-[104px] flex-col rounded-xl border p-3 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${preferences.design === value ? "border-ink bg-ink/5" : "border-[#d7dedc] bg-white"}`}><span className="mb-2 flex items-center justify-between gap-2"><span className="flex -space-x-1" aria-hidden="true">{swatches[value].map(colour => <span key={colour} style={{ background: colour }} className="h-5 w-5 rounded-full border-2 border-white" />)}</span>{preferences.design === value ? <Check size={14} aria-hidden="true" /> : null}</span><span className="text-sm font-bold">{copy.designs[value]}</span><span className="mt-0.5 text-xs leading-relaxed text-muted">{copy.designNotes[value]}</span></span></label>)}</div></fieldset>
            </SettingCard>
            <SettingCard title={copy.topic} description={copy.topicText} icon={<Search size={20} />}>
              <fieldset disabled={!ready} data-testid="profile-topic"><legend className="sr-only">{copy.topic}</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{topicChoices.map(value => <label key={value} className="min-w-0 cursor-pointer"><input type="radio" name="profile-topic" value={value} checked={preferences.topic === value} onChange={() => setPreference("topic", value)} className="peer sr-only" /><span className={`flex min-h-11 items-center justify-between gap-1.5 rounded-xl border px-3 text-sm font-semibold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${preferences.topic === value ? "border-ink bg-ink text-white" : "border-[#d7dedc] bg-white"}`}>{copy.topics[value]}{preferences.topic === value ? <Check size={14} className="shrink-0" aria-hidden="true" /> : null}</span></label>)}</div></fieldset><p className="mt-3 text-xs leading-relaxed text-muted">{copy.topicCaution}</p>
            </SettingCard>
          </div>

          <div className="min-w-0 lg:col-span-2">
            <SettingCard id="profile-history" title={copy.history} description={copy.historyText} icon={<History size={20} />}>
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#dce1de] bg-[#f6f7f3] p-3"><span><span className="block text-sm font-bold">{copy.historyEnable}</span><span className="mt-1 block text-xs text-muted">{history.enabled ? copy.historyOn : copy.historyOff}</span></span><input type="checkbox" data-testid="profile-history-enabled" checked={history.enabled} disabled={!history.isHydrated} onChange={() => { setConfirmation(null); if (history.enabled) setConfirmation("disable"); else history.enable(); }} className="focus-ring h-5 w-5 shrink-0 accent-[#257b77]" /></label>
              {history.error ? <p role="alert" className="mt-3 rounded-xl bg-[#fff0e6] p-3 text-sm leading-relaxed text-[#93603d]">{copy.error}</p> : null}
              {confirmation ? <div data-testid="profile-history-confirmation" role="alert" className="mt-4 rounded-xl border border-[#e2beb0] bg-[#fff3eb] p-4"><p className="text-sm font-bold text-ink">{confirmation === "disable" ? copy.confirmDisable : copy.confirmClear}</p><p className="mt-1 text-xs leading-relaxed text-muted">{copy.confirmDetail}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" data-testid="profile-history-confirm" onClick={confirmHistoryChange} className="focus-ring min-h-11 rounded-xl bg-[#a94432] px-4 text-sm font-bold text-white">{copy.confirm}</button><button type="button" data-testid="profile-history-cancel" onClick={() => setConfirmation(null)} className="focus-ring min-h-11 rounded-xl border border-[#d7d8d3] bg-white px-4 text-sm font-bold">{copy.cancel}</button></div></div> : null}
              {history.items.length ? <><div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-muted">{history.items.length} / {ANALYSIS_HISTORY_MAX_ITEMS} {copy.historyCount}</p><button type="button" data-testid="profile-history-clear" onClick={() => setConfirmation("clear")} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-bold text-[#9c5043]"><Trash2 size={14} aria-hidden="true" />{copy.clear}</button></div>{restoreDisabled ? <p role="status" className="mb-3 text-xs leading-relaxed text-muted">{copy.restorePending}</p> : null}<ol data-testid="profile-history-list" className="grid gap-3 sm:grid-cols-2">{history.items.map(item => <li key={item.id} data-testid="profile-history-item" className="flex min-w-0 flex-col rounded-xl border border-[#dce1de] bg-white p-4"><time dateTime={item.analyzedAt} className="text-xs text-muted">{new Intl.DateTimeFormat(localeTags[locale], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.analyzedAt))}</time><p className="mt-2 line-clamp-3 break-words text-sm leading-relaxed text-ink">{item.text}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#e9ede8] pt-2"><HistoryRestoreControl item={item} label={copy.restore} disabled={restoreDisabled} disabledReason={copy.restorePending} onRestore={onRestore} /><button type="button" onClick={() => history.remove(item.id)} aria-label={`${copy.delete}: ${item.text.slice(0, 70)}`} className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#9c5043]"><Trash2 size={14} aria-hidden="true" />{copy.delete}</button></div></li>)}</ol></> : <div className="py-7 text-center"><p className="text-sm font-bold text-ink">{copy.empty}</p><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{history.enabled ? copy.emptyText : copy.disabledText}</p></div>}
            </SettingCard>
          </div>

          <section className="min-w-0 rounded-[20px] border border-[#cadedd] bg-[#edf5f2] p-4 sm:p-6"><div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-ink"><Send size={20} /></span><h2 className="text-base font-bold text-ink">{copy.telegram}</h2></div><p className="mt-3 text-sm leading-relaxed text-muted">{copy.telegramText}</p><a href="https://t.me/RuFact_bot" target="_blank" rel="noopener noreferrer" className="focus-ring mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white" aria-label={`${copy.telegramOpen}: @RuFact_bot`}>@RuFact_bot<ArrowUpRight size={15} aria-hidden="true" /></a></section>
          <section className="min-w-0 rounded-[20px] border border-[#d9dfdc] bg-white/55 p-4 sm:p-6"><h2 className="text-base font-bold text-ink">{copy.reset}</h2><p className="mt-2 text-sm leading-relaxed text-muted">{copy.resetText}</p><button type="button" disabled={!ready} onClick={() => { resetPreferences(); setAnnouncement(copy.resetDone); }} className="focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d7d8d3] bg-white px-4 text-sm font-semibold text-ink"><RotateCcw size={15} aria-hidden="true" />{copy.reset}</button></section>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      </div>
    </div>
  );
}
