"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  FileText,
  LoaderCircle,
  Upload,
  Sparkles,
  Trash2,
} from "lucide-react";
import { DOCUMENT_ACCEPT } from "@/lib/document-upload";
import { detectTextLanguage } from "@/lib/text-language";
import { ExampleChips, type TextExample } from "./ExampleChips";
import { HistoryTrigger } from "./HistoryTrigger";
import { useLanguage } from "./LanguageProvider";

interface TextAnalyzerProps {
  text: string;
  canClear: boolean;
  examples: readonly TextExample[];
  activeExampleId: string | null;
  isLoading: boolean;
  isExtracting: boolean;
  validationMessage: string | null;
  documentMessage: { kind: "success" | "warning" | "error"; text: string } | null;
  historyOpen: boolean;
  historyEnabled: boolean;
  historyCount: number;
  geminiConfigured: boolean;
  useGemini: boolean;
  onTextChange: (value: string) => void;
  onDocumentSelect: (file: File) => void;
  onClear: () => void;
  onExampleSelect: (example: TextExample) => void;
  onSubmit: () => void;
  onOpenHistory: () => void;
  onUseGeminiChange: (enabled: boolean) => void;
}

const MAX_LENGTH = 5000;
const uzbekRoutingCopy = {
  uz: {
    on: "O‘zbekcha matn bevosita Tavily → Gemini orqali tekshiriladi. Rus yoki ingliz ML modeli ishlatilmaydi.",
    off: "O‘zbekcha matn uchun manbalar tekshiruvini yoqing. U o‘chirilgan bo‘lsa, natija tekshirilmagan bo‘lib qoladi.",
    unavailable: "O‘zbekcha tekshiruv uchun serverda Tavily va Gemini sozlangan bo‘lishi kerak. Statistik ML modeli talab qilinmaydi.",
  },
  ru: {
    on: "Узбекский текст проверяется напрямую через Tavily → Gemini, без русской или английской ML-модели.",
    off: "Для узбекского текста включите проверку источников. Пока она выключена, результат останется непроверенным.",
    unavailable: "Для узбекской проверки нужны настроенные на сервере Tavily и Gemini. Статистическая ML-модель не требуется.",
  },
  en: {
    on: "Uzbek text is checked directly through Tavily → Gemini, without the Russian or English ML models.",
    off: "Enable source checking for Uzbek text. With it switched off, the result remains unverified.",
    unavailable: "Uzbek checks need Tavily and Gemini configured on the server. A statistical ML model is not required.",
  },
} as const;

export function TextAnalyzer({
  text,
  canClear,
  examples,
  activeExampleId,
  isLoading,
  isExtracting,
  validationMessage,
  documentMessage,
  historyOpen,
  historyEnabled,
  historyCount,
  geminiConfigured,
  useGemini,
  onTextChange,
  onDocumentSelect,
  onClear,
  onExampleSelect,
  onSubmit,
  onOpenHistory,
  onUseGeminiChange,
}: TextAnalyzerProps) {
  const isBusy = isLoading || isExtracting;
  const { locale, copy } = useLanguage();
  const isUzbekText = detectTextLanguage(text) === "uz";

  return (
    <article
      className="text-analyzer rounded-[16px] border border-white/70 bg-[rgba(252,250,247,0.94)] p-3.5 shadow-[0_10px_26px_rgba(24,41,55,0.07)] sm:rounded-[21px] sm:p-5 sm:shadow-[0_14px_34px_rgba(24,41,55,0.075)]"
    >
      <div className="analyzer-heading-row mb-2.5 flex items-center justify-between gap-3 sm:mb-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#e6f0fa] text-[#3574ba] sm:h-9 sm:w-9 sm:rounded-[10px]">
            <FileText size={17} strokeWidth={2} aria-hidden="true" />
          </span>
          <h2 className="text-[0.9375rem] leading-snug font-extrabold tracking-[-0.02em] text-[#102a49] sm:text-[1rem]">
            {copy.analyzer.heading}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <HistoryTrigger
            disabled={isBusy}
            isOpen={historyOpen}
            enabled={historyEnabled}
            itemCount={historyCount}
            onOpen={onOpenHistory}
          />
          <button
            type="button"
            onClick={onClear}
            disabled={isBusy || !canClear}
            aria-label={copy.analyzer.clearAria}
            className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[0.75rem] font-medium text-[#78869a] transition-colors hover:bg-[#f1eeea] hover:text-[#4d5c72] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
            <span className="hidden sm:inline">{copy.analyzer.clear}</span>
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="analysis-text" className="sr-only">
          {copy.analyzer.inputLabel}
        </label>
        <textarea
          id="analysis-text"
          value={text}
          maxLength={MAX_LENGTH}
          disabled={isBusy}
          aria-describedby="text-counter text-helper"
          aria-invalid={Boolean(validationMessage)}
          aria-errormessage={validationMessage ? "text-validation" : undefined}
          onChange={(event) => onTextChange(event.target.value)}
          className={`focus-ring block min-h-[152px] w-full resize-none rounded-[12px] border bg-[rgba(255,255,255,0.42)] px-3 py-2.5 text-[0.78125rem] leading-[1.42] text-[#303b4d] shadow-inner shadow-[#16324a]/[0.015] transition-colors placeholder:text-[#8993a0] disabled:cursor-wait disabled:opacity-75 sm:min-h-[184px] sm:rounded-[14px] sm:px-4 sm:py-3 sm:text-[1rem] sm:leading-[1.48] ${
            validationMessage
              ? "border-[#d98383]"
              : "border-[#d7d9dc] hover:border-[#c6cbd0]"
          }`}
          placeholder={copy.analyzer.placeholder}
        />
        <div className="mt-1 flex justify-end pr-1">
          <span
            id="text-counter"
            className="text-[0.59375rem] font-medium tabular-nums text-[#78859a] sm:text-[0.6875rem]"
          >
            {text.length} / {MAX_LENGTH}
          </span>
        </div>
      </div>

      {validationMessage ? (
        <p
          id="text-validation"
          aria-live="polite"
          className="pt-2 text-[0.75rem] font-semibold text-[#b73c42]"
        >
          {validationMessage}
        </p>
      ) : null}

      <div className="mt-2.5 rounded-[11px] border border-dashed border-[#b9c9d8] bg-[#f5f8fa]/80 px-2.5 py-2 sm:mt-3 sm:rounded-[12px] sm:px-3 sm:py-2.5">
        <div className="grid grid-cols-[auto_1fr] items-center gap-2 sm:flex sm:flex-row sm:justify-between">
          <label
            className={`focus-within:ring-2 focus-within:ring-[#7ea4c7] focus-within:ring-offset-2 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[9px] border border-[#c8d4df] bg-white px-2.5 text-[0.65625rem] font-extrabold text-[#214b70] shadow-sm transition-colors hover:bg-[#eef5fa] sm:min-h-10 sm:gap-2 sm:rounded-[10px] sm:px-3.5 sm:text-[0.75rem] ${
              isBusy ? "cursor-wait opacity-60" : "cursor-pointer"
            }`}
          >
            {isExtracting ? (
              <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
            ) : (
              <Upload size={16} aria-hidden="true" />
            )}
            {isExtracting ? copy.analyzer.uploading : copy.analyzer.upload}
            <input
              type="file"
              accept={DOCUMENT_ACCEPT}
              disabled={isBusy}
              aria-label={copy.analyzer.uploadAria}
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onDocumentSelect(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <p className="text-[0.53125rem] leading-[1.35] text-[#697b8e] sm:text-right sm:text-[0.65625rem] sm:leading-[1.45]">
            {copy.analyzer.fileTypes}
            <br />{copy.analyzer.filePrivacy}
          </p>
        </div>
        {documentMessage ? (
          <p
            role={documentMessage.kind === "error" ? "alert" : "status"}
            className={`mt-2 text-[0.6875rem] font-semibold leading-[1.45] ${
              documentMessage.kind === "error"
                ? "text-[#b33b42]"
                : documentMessage.kind === "warning"
                  ? "text-[#9a5b24]"
                  : "text-[#2f6a52]"
            }`}
          >
            {documentMessage.text}
          </p>
        ) : null}
      </div>

      <ExampleChips
        examples={examples}
        activeId={activeExampleId}
        disabled={isBusy}
        onSelect={onExampleSelect}
      />

      <section
        aria-labelledby="gemini-option-heading"
        className="mt-3 rounded-[11px] border border-[#cfdae6] bg-[#eef4f8]/75 px-3 py-2.5 sm:mt-4 sm:rounded-[13px] sm:px-3.5"
      >
        <label
          htmlFor="use-gemini"
          className={`flex items-start gap-2.5 sm:gap-3 ${
            geminiConfigured ? "cursor-pointer" : "cursor-not-allowed"
          }`}
        >
          <input
            id="use-gemini"
            type="checkbox"
            role="switch"
            checked={useGemini}
            disabled={isBusy || !geminiConfigured}
            aria-describedby="gemini-option-description gemini-privacy-note"
            onChange={(event) => onUseGeminiChange(event.target.checked)}
            className="focus-ring mt-0.5 h-4 w-4 shrink-0 accent-[#285b87] disabled:cursor-not-allowed"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span
                id="gemini-option-heading"
                className="text-[0.71875rem] font-extrabold text-[#163957] sm:text-[0.78125rem]"
              >
                {copy.analyzer.internetTitle}
              </span>
              <span className="rounded bg-[#d9e6f1] px-1.5 py-0.5 text-[0.5rem] font-extrabold uppercase tracking-[0.08em] text-[#496b88]">
                Tavily + Gemini
              </span>
            </span>
            <span
              id="gemini-option-description"
              className="mt-0.5 block text-[0.59375rem] leading-[1.4] text-[#60768a] sm:text-[0.65625rem] sm:leading-[1.45]"
            >
              <span className="sm:hidden">
                {geminiConfigured
                  ? useGemini
                    ? copy.analyzer.internetOn
                    : copy.analyzer.internetOff
                  : copy.analyzer.internetUnavailable}
              </span>
              <span className="hidden sm:inline">
                {geminiConfigured
                  ? useGemini
                    ? copy.analyzer.internetOn
                    : copy.analyzer.internetOff
                  : copy.analyzer.internetUnavailable}
              </span>
            </span>
          </span>
        </label>
        <p
          id="gemini-privacy-note"
          className="mt-1.5 pl-6.5 text-[0.53125rem] leading-[1.35] text-[#718092] sm:pl-7 sm:text-[0.59375rem] sm:leading-[1.45]"
        >
          {geminiConfigured ? (
            <>
              <span className="sm:hidden">{copy.analyzer.privacyShort} </span>
              <span className="hidden sm:inline">{copy.analyzer.privacyLong} </span>
              <a
                href="https://ai.google.dev/gemini-api/terms"
                target="_blank"
                rel="noreferrer"
                className="focus-ring rounded-sm font-bold text-[#315f87] underline decoration-[#8aa5bd] underline-offset-2"
              >
                {copy.analyzer.terms}
              </a>
            </>
          ) : (
            copy.analyzer.internetUnavailable
          )}
        </p>
      </section>

      {isUzbekText || locale !== "ru" ? (
        <p data-uzbek-routing={isUzbekText ? "source-only" : undefined} className="mt-2 rounded-[10px] border border-[#ead8b7] bg-[#fff8e9] px-3 py-2 text-[0.5625rem] leading-[1.4] text-[#7d6236] sm:text-[0.65625rem]">
          {isUzbekText ? uzbekRoutingCopy[locale][!geminiConfigured ? "unavailable" : useGemini ? "on" : "off"] : copy.analyzer.languageNotice}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col items-stretch gap-2 sm:mt-6 sm:flex-row sm:items-center sm:gap-7">
        <motion.button
          type="button"
          whileHover={isBusy ? undefined : { y: -1 }}
          whileTap={isBusy ? undefined : { scale: 0.99 }}
          disabled={isBusy}
          onClick={onSubmit}
          className="analyzer-submit focus-ring group inline-flex min-h-12 flex-1 items-center justify-center gap-3 rounded-[12px] bg-[linear-gradient(100deg,#0b2a4a,#244f78)] px-5 text-[0.875rem] font-bold text-white shadow-[0_10px_20px_rgba(13,47,79,0.15)] disabled:cursor-wait disabled:opacity-85 sm:min-h-[58px] sm:max-w-[345px] sm:gap-4 sm:rounded-[14px] sm:px-7 sm:text-[1rem]"
        >
          {isLoading ? (
            <>
              <LoaderCircle className="animate-spin" size={20} aria-hidden="true" />
              {copy.analyzer.submitting}
            </>
          ) : (
            <>
              <Sparkles size={20} aria-hidden="true" />
              {copy.analyzer.submit}
              <ArrowRight
                size={20}
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </>
          )}
        </motion.button>

        <p id="text-helper" className="text-center text-[0.59375rem] leading-[1.35] text-[#77859a] sm:max-w-[230px] sm:text-left sm:text-[0.75rem] sm:leading-[1.45]">
          {copy.analyzer.helper}
          <span className="hidden sm:inline"><br />{copy.analyzer.helperDesktop}</span>
        </p>
      </div>
    </article>
  );
}
