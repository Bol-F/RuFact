"use client";

import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HistoryItem } from "@/lib/analysis-history";
import { localeTags } from "@/lib/i18n";
import { verdictCopy } from "@/lib/verdict-copy";
import { HISTORY_DIALOG_ID, HISTORY_TRIGGER_ID } from "./HistoryTrigger";
import { useLanguage } from "./LanguageProvider";

const HISTORY_LIMIT = 20;
const HISTORY_RETENTION_DAYS = 30;

type ConfirmationKind = "clear" | "disable";

export interface AnalysisHistoryDialogProps {
  isOpen: boolean;
  enabled: boolean;
  items: HistoryItem[];
  errorMessage: string | null;
  onClose: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onClear: () => void;
  onDelete: (id: HistoryItem["id"]) => void;
  onRestore: (item: HistoryItem) => void;
  dialogId?: string;
  triggerId?: string;
}

function formatAnalyzedAt(value: HistoryItem["analyzedAt"], locale: "uz" | "ru" | "en") {
  const date = new Date(value);
  const fallback = locale === "uz" ? "Sana ko‘rsatilmagan" : locale === "en" ? "Date unavailable" : "Дата не указана";
  return Number.isNaN(date.getTime())
    ? fallback
    : new Intl.DateTimeFormat(localeTags[locale], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatConfidence(value: number) {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(Math.min(100, Math.max(0, normalized)))}%`;
}

function makeExcerpt(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

interface ConfirmationPanelProps {
  kind: ConfirmationKind;
  cancelButtonRef: React.RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmationPanel({
  kind,
  cancelButtonRef,
  onCancel,
  onConfirm,
}: ConfirmationPanelProps) {
  const { locale } = useLanguage();
  const isDisable = kind === "disable";
  const text = locale === "uz"
    ? { disable: "Tarix o‘chirilsinmi?", clear: "Butun tarix tozalansinmi?", description: "Saqlangan tekshiruvlar ushbu qurilmadan o‘chiriladi. Bu amalni bekor qilib bo‘lmaydi.", cancel: "Bekor qilish", disableAction: "O‘chirish va tozalash", clearAction: "Hammasini o‘chirish" }
    : locale === "en"
      ? { disable: "Disable history?", clear: "Clear all history?", description: "Saved checks will be removed from this device. This action cannot be undone.", cancel: "Cancel", disableAction: "Disable and delete", clearAction: "Delete all" }
      : { disable: "Отключить историю?", clear: "Очистить всю историю?", description: "Сохранённые проверки будут удалены с этого устройства. Это действие нельзя отменить.", cancel: "Отмена", disableAction: "Отключить и удалить", clearAction: "Удалить всё" };
  const title = isDisable ? text.disable : text.clear;
  const description = text.description;
  const titleId = `history-${kind}-confirmation-title`;
  const descriptionId = `history-${kind}-confirmation-description`;

  return (
    <section
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="rounded-[15px] border border-[#e5bdb2] bg-[#fff2ee] p-4"
    >
      <p
        id={titleId}
        className="text-[0.8125rem] font-extrabold text-[#963b2f]"
      >
        {title}
      </p>
      <p id={descriptionId} className="mt-1 text-[0.71875rem] leading-[1.5] text-[#765e5b]">
        {description}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          ref={cancelButtonRef}
          type="button"
          onClick={onCancel}
          className="focus-ring min-h-9 rounded-lg border border-[#d8c8c3] bg-white px-3 text-[0.6875rem] font-bold text-[#40556a]"
        >
          {text.cancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="focus-ring min-h-9 rounded-lg bg-[#a63e35] px-3 text-[0.6875rem] font-bold text-white shadow-[0_5px_12px_rgba(166,62,53,0.18)]"
        >
          {isDisable ? text.disableAction : text.clearAction}
        </button>
      </div>
    </section>
  );
}

export function AnalysisHistoryDialog({
  isOpen,
  enabled,
  items,
  errorMessage,
  onClose,
  onEnable,
  onDisable,
  onClear,
  onDelete,
  onRestore,
  dialogId = HISTORY_DIALOG_ID,
  triggerId = HISTORY_TRIGGER_ID,
}: AnalysisHistoryDialogProps) {
  const { locale } = useLanguage();
  const labels = locale === "uz"
    ? { deleted: "Yozuv tarixdan o‘chirildi.", restored: "Matn qayta tekshirish uchun tiklandi.", disabledAnnounce: "Tarix o‘chirildi va saqlangan yozuvlar tozalandi.", clearedAnnounce: "Tekshiruv tarixi tozalandi.", title: "Tekshiruv tarixi", description: "Ushbu qurilmada saqlangan natijalarni boshqaring.", close: "Tarixni yopish", off: "Tarix o‘chirilgan", offDescription: `RuFact oxirgi ${HISTORY_LIMIT} ta tekshiruvni faqat shu brauzerda saqlaydi. Yozuvlar ${HISTORY_RETENTION_DAYS} kundan keyin avtomatik o‘chiriladi.`, enable: "Lokal tarixni yoqish", consent: "Tarix roziligingizsiz yoqilmaydi. Uni istalgan paytda o‘chirib, tozalash mumkin.", sharedDevice: "Umumiy qurilmada matnlarni saqlamaslik ma’qul.", storage: `Faqat shu brauzerda saqlanadi: ${HISTORY_LIMIT} tadan ko‘p emas va ${HISTORY_RETENTION_DAYS} kundan uzoq emas. Tarixdagi matn qayta yuborilmaydi.`, records: "yozuv", clear: "Tozalash", disable: "O‘chirish", savedAria: "Saqlangan tekshiruvlar", missing: "Matn mavjud emas", open: "Ochish", delete: "Yozuvni o‘chirish", empty: "Hozircha bo‘sh", emptyDescription: "Keyingi tahlil natijasi bu yerda avtomatik paydo bo‘ladi.", footer: "Tarix RuFact serveriga yuborilmaydi." }
    : locale === "en"
      ? { deleted: "The entry was removed from history.", restored: "The text was restored for another check.", disabledAnnounce: "History was disabled and saved entries were removed.", clearedAnnounce: "Check history was cleared.", title: "Check history", description: "Manage results saved on this device.", close: "Close history", off: "History is off", offDescription: `RuFact can save up to ${HISTORY_LIMIT} recent checks only in this browser. Entries expire after ${HISTORY_RETENTION_DAYS} days.`, enable: "Enable local history", consent: "History is never enabled without your consent. You can disable and delete it at any time.", sharedDevice: "Avoid saving texts on a shared device.", storage: `Stored only in this browser: no more than ${HISTORY_LIMIT} checks for up to ${HISTORY_RETENTION_DAYS} days. History text is not resent.`, records: "records", clear: "Clear", disable: "Disable", savedAria: "Saved checks", missing: "Text unavailable", open: "Open", delete: "Delete entry", empty: "Nothing here yet", emptyDescription: "The next analysis result will appear here automatically.", footer: "History is not sent to the RuFact server." }
      : { deleted: "Запись удалена из истории.", restored: "Текст восстановлен для повторной проверки.", disabledAnnounce: "История отключена, сохранённые записи удалены.", clearedAnnounce: "История проверок очищена.", title: "История проверок", description: "Управляйте сохранёнными результатами на этом устройстве.", close: "Закрыть историю", off: "История выключена", offDescription: `RuFact сохранит до ${HISTORY_LIMIT} последних проверок только в этом браузере. Записи автоматически удаляются через ${HISTORY_RETENTION_DAYS} дней.`, enable: "Включить локальную историю", consent: "История не включается без вашего согласия. Её можно отключить и удалить в любой момент.", sharedDevice: "На общем устройстве лучше не включать сохранение текстов.", storage: `Хранится только в этом браузере: не более ${HISTORY_LIMIT} проверок и не дольше ${HISTORY_RETENTION_DAYS} дней. Текст из истории не отправляется повторно.`, records: "записей", clear: "Очистить", disable: "Отключить", savedAria: "Сохранённые проверки", missing: "Текст отсутствует", open: "Открыть", delete: "Удалить запись", empty: "Пока пусто", emptyDescription: "Следующий результат анализа появится здесь автоматически.", footer: "История не отправляется на сервер RuFact." };
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const confirmationCancelRef = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationKind | null>(null);
  const [announcement, setAnnouncement] = useState<{ id: number; message: string } | null>(
    null,
  );

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (isOpen && !dialog.open) {
      const trigger = document.getElementById(triggerId);
      returnFocusRef.current =
        trigger instanceof HTMLElement
          ? trigger
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, triggerId]);

  useEffect(() => {
    if (confirmation) confirmationCancelRef.current?.focus();
  }, [confirmation]);

  function announce(message: string) {
    setAnnouncement((current) => ({ id: (current?.id ?? 0) + 1, message }));
  }

  function requestClose() {
    setConfirmation(null);
    onClose();
  }

  function handleNativeClose() {
    setConfirmation(null);
    if (isOpen) onClose();

    window.requestAnimationFrame(() => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    });
  }

  function handleEnable() {
    onEnable();
  }

  function handleDelete(item: HistoryItem) {
    onDelete(item.id);
    announce(labels.deleted);
  }

  function handleRestore(item: HistoryItem) {
    onRestore(item);
    announce(labels.restored);
  }

  function handleConfirm() {
    if (confirmation === "disable") {
      onDisable();
      announce(labels.disabledAnnounce);
    } else if (confirmation === "clear") {
      onClear();
      announce(labels.clearedAnnounce);
    }

    setConfirmation(null);
  }

  const headingId = `${dialogId}-heading`;
  const descriptionId = `${dialogId}-description`;

  return (
    <dialog
      ref={dialogRef}
      id={dialogId}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={handleNativeClose}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className="fixed inset-0 m-0 hidden h-[100dvh] max-h-none w-screen max-w-none items-end justify-end overflow-hidden bg-transparent p-0 text-ink open:flex backdrop:bg-[#10283d]/45 backdrop:backdrop-blur-[2px] sm:items-stretch"
    >
      <section className="mt-auto flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[26px] border border-[#e1ded7] bg-[#fbfaf6] shadow-[0_-18px_50px_rgba(16,35,52,0.16)] sm:mt-0 sm:h-full sm:max-h-none sm:w-[min(32rem,calc(100vw-2rem))] sm:rounded-l-[26px] sm:rounded-r-none sm:border-y-0 sm:border-r-0 sm:shadow-[-20px_0_55px_rgba(16,35,52,0.18)]">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#c9c8c2] sm:hidden" aria-hidden="true" />

        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e1ded7] px-5 pb-5 pt-4 sm:px-7 sm:pb-6 sm:pt-7">
          <div className="flex min-w-0 gap-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#e4edf2] text-[#2c5c7d]">
              <History size={21} strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
              <h2
                id={headingId}
                className="font-serif text-[1.5rem] leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-[1.6875rem]"
              >
                {labels.title}
              </h2>
              <p id={descriptionId} className="mt-1 text-[0.71875rem] leading-[1.45] text-[#718092]">
                {labels.description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#d9d9d3] bg-white/70 text-[#52677a] transition-colors hover:bg-white hover:text-ink"
            aria-label={labels.close}
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
          {errorMessage ? (
            <div
              role="alert"
              className="mb-4 rounded-[13px] border border-[#e7bdb6] bg-[#fff0ed] px-4 py-3 text-[0.71875rem] leading-[1.5] text-[#8a4038]"
            >
              {errorMessage}
            </div>
          ) : null}

          {!enabled ? (
            <div className="flex min-h-[390px] flex-col items-center justify-center py-8 text-center">
              <span className="relative grid h-20 w-20 place-items-center rounded-[24px] bg-[#e8eef0] text-[#315d70] shadow-[inset_0_0_0_1px_rgba(49,93,112,0.06)]">
                <LockKeyhole size={34} strokeWidth={1.65} aria-hidden="true" />
                <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-[10px] bg-[#dfeadf] text-[#35744b] ring-4 ring-[#fbfaf6]">
                  <ShieldCheck size={18} strokeWidth={2} aria-hidden="true" />
                </span>
              </span>
              <h3 className="mt-6 font-serif text-[1.4375rem] font-semibold tracking-[-0.025em] text-ink">
                {labels.off}
              </h3>
              <p className="mt-3 max-w-[350px] text-[0.78125rem] leading-[1.65] text-[#66778a]">
                {labels.offDescription}
              </p>
              <button
                type="button"
                onClick={handleEnable}
                className="focus-ring mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink-deep px-5 text-[0.78125rem] font-bold text-white shadow-[0_9px_22px_rgba(10,41,73,0.18)] transition-transform hover:-translate-y-0.5"
              >
                <CheckCircle2 size={17} strokeWidth={2} aria-hidden="true" />
                {labels.enable}
              </button>
              <p className="mt-4 max-w-[330px] text-[0.65625rem] leading-[1.5] text-[#89939e]">
                {labels.consent}
              </p>
              <p className="mt-2 max-w-[330px] text-[0.65625rem] leading-[1.5] font-semibold text-[#8b6659]">
                {labels.sharedDevice}
              </p>
            </div>
          ) : (
            <>
              <aside className="flex gap-3 rounded-[14px] border border-[#cfdee3] bg-[#eaf2f4] px-4 py-3.5 text-[#3f6376]">
                <ShieldCheck className="mt-0.5 shrink-0" size={19} strokeWidth={2} aria-hidden="true" />
                <p className="text-[0.71875rem] leading-[1.55]">
                  {labels.storage}
                </p>
              </aside>

              <div className="my-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-[#7c8895]">
                  {items.length} / {HISTORY_LIMIT} {labels.records}
                </p>
                <div className="flex items-center gap-3">
                  {items.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setConfirmation("clear")}
                      className="focus-ring rounded-md text-[0.6875rem] font-bold text-[#9a4b3f] underline decoration-[#d4a99f] underline-offset-4 hover:text-[#7e312b]"
                    >
                      {labels.clear}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setConfirmation("disable")}
                    className="focus-ring rounded-md text-[0.6875rem] font-bold text-[#667686] underline decoration-[#bec4c8] underline-offset-4 hover:text-[#344b5f]"
                  >
                    {labels.disable}
                  </button>
                </div>
              </div>

              {confirmation ? (
                <div className="mb-5">
                  <ConfirmationPanel
                    kind={confirmation}
                    cancelButtonRef={confirmationCancelRef}
                    onCancel={() => setConfirmation(null)}
                    onConfirm={handleConfirm}
                  />
                </div>
              ) : null}

              {items.length > 0 ? (
                <ol className="grid gap-3" aria-label={labels.savedAria}>
                  {items.map((item) => {
                    const isFake = item.label === "FAKE";
                    const excerpt = makeExcerpt(item.text);

                    return (
                      <li key={item.id}>
                        <article className="rounded-[16px] border border-[#deded8] bg-white/70 p-4 shadow-[0_8px_22px_rgba(29,44,57,0.045)] transition-colors hover:border-[#c9d2d7] hover:bg-white">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={`rounded-lg px-2.5 py-1 text-[0.625rem] font-extrabold tracking-[0.06em] ${
                                  item.meta.engine === "calculation" || item.label === "UNSURE" ? "bg-[#e7edf2] text-[#53667a]" : isFake
                                    ? "bg-[#f8dddd] text-[#b5363c]"
                                    : "bg-[#dcecdf] text-[#357047]"
                                }`}
                              >
                                {item.meta.engine === "calculation" ? verdictCopy[locale].calculation : item.label === "UNSURE" ? "—" : `ML · ${item.label}`}
                              </span>
                              <span className="text-[0.75rem] font-extrabold tabular-nums text-[#29465f]">
                                {item.meta.engine === "calculation" || item.label === "UNSURE" ? "" : formatConfidence(item.confidence)}
                              </span>
                            </div>
                            <time
                              dateTime={String(item.analyzedAt)}
                              className="inline-flex shrink-0 items-center gap-1.5 text-[0.59375rem] font-semibold text-[#89939d]"
                            >
                              <Clock3 size={12} strokeWidth={2} aria-hidden="true" />
                              {formatAnalyzedAt(item.analyzedAt, locale)}
                            </time>
                          </div>

                          <p className="mt-3 line-clamp-2 text-[0.75rem] leading-[1.55] text-[#53667a]">
                            {excerpt || labels.missing}
                          </p>

                          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#ebe9e3] pt-3">
                            <button
                              type="button"
                              onClick={() => handleRestore(item)}
                              className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#e7eef4] px-3 text-[0.6875rem] font-extrabold text-[#315b7b] transition-colors hover:bg-[#dbe7ef]"
                            >
                              {labels.open}
                              <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-[#9b6d65] transition-colors hover:bg-[#fae8e4] hover:text-[#a13f35]"
                              aria-label={`${labels.delete}: ${excerpt.slice(0, 70) || labels.missing}`}
                            >
                              <Trash2 size={16} strokeWidth={1.9} aria-hidden="true" />
                            </button>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="flex min-h-[250px] flex-col items-center justify-center rounded-[18px] border border-dashed border-[#ced3d4] bg-[#f6f5f1] px-6 py-9 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-[15px] bg-[#e7ebeb] text-[#71818c]">
                    <History size={23} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-[0.875rem] font-extrabold text-[#29455e]">{labels.empty}</h3>
                  <p className="mt-1.5 max-w-[270px] text-[0.71875rem] leading-[1.55] text-[#7a8793]">
                    {labels.emptyDescription}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="shrink-0 border-t border-[#e5e2dc] bg-[#f6f4ef] px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 sm:px-7 sm:pb-3.5">
          <p className="flex items-center gap-2 text-[0.65625rem] leading-[1.4] text-[#788592]">
            <LockKeyhole size={14} strokeWidth={1.9} aria-hidden="true" />
            {labels.footer}
          </p>
        </footer>
      </section>

      <p key={announcement?.id} className="sr-only" role="status" aria-live="polite">
        {announcement?.message ?? ""}
      </p>
    </dialog>
  );
}
