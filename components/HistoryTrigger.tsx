"use client";

import { History } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export const HISTORY_DIALOG_ID = "analysis-history-dialog";
export const HISTORY_TRIGGER_ID = "analysis-history-trigger";

export interface HistoryTriggerProps {
  disabled?: boolean;
  isOpen: boolean;
  enabled: boolean;
  itemCount: number;
  onOpen: () => void;
  dialogId?: string;
  id?: string;
  className?: string;
}

export function HistoryTrigger({
  disabled = false,
  isOpen,
  enabled,
  itemCount,
  onOpen,
  dialogId = HISTORY_DIALOG_ID,
  id = HISTORY_TRIGGER_ID,
  className = "",
}: HistoryTriggerProps) {
  const { locale } = useLanguage();
  const count = Math.max(0, itemCount);
  const labels = locale === "uz"
    ? { history: "Tarix", enabled: "yoqilgan", disabled: "o‘chirilgan", records: "yozuvlar" }
    : locale === "en"
      ? { history: "History", enabled: "enabled", disabled: "disabled", records: "records" }
      : { history: "История", enabled: "включена", disabled: "выключена", records: "записей" };
  const countLabel = enabled && count > 0 ? `, ${labels.records}: ${count}` : "";
  const statusLabel = enabled ? labels.enabled : labels.disabled;

  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-controls={dialogId}
      aria-expanded={isOpen}
      aria-label={`${labels.history}: ${statusLabel}${countLabel}`}
      onClick={onOpen}
      className={`focus-ring relative inline-flex min-h-9 items-center gap-2 rounded-[10px] border border-[#d8d8d2] bg-[#fbfaf6]/90 px-1.5 text-[0.75rem] font-bold text-[#28445f] shadow-[0_6px_18px_rgba(31,48,63,0.06)] transition hover:-translate-y-0.5 hover:border-[#bdc8cf] hover:bg-white disabled:cursor-wait disabled:opacity-50 disabled:hover:translate-y-0 sm:min-h-10 sm:rounded-xl sm:px-3.5 ${className}`}
    >
      <span className="relative grid h-6 w-6 place-items-center rounded-[7px] bg-[#e7edf2] text-[#315d7f] sm:h-7 sm:w-7 sm:rounded-lg">
        <History size={14} strokeWidth={2} aria-hidden="true" />
        <span
          className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[#fbfaf6] ${
            enabled ? "bg-[#3b8a54]" : "bg-[#a9afb4]"
          }`}
          aria-hidden="true"
        />
      </span>
      <span className="hidden sm:inline">{labels.history}</span>
      {enabled && count > 0 ? (
        <span
          className="absolute -right-1 -top-1 min-w-5 rounded-md bg-[#dfe8ee] px-1.5 py-0.5 text-center text-[0.625rem] font-extrabold tabular-nums text-[#31536d] ring-2 ring-[#fbfaf6] sm:static sm:ring-0"
          aria-hidden="true"
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
