"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  SearchCheck,
} from "lucide-react";
import type { AnalysisResponse } from "@/lib/api";
import { ConfidenceRing } from "./ConfidenceRing";
import { GeminiReviewPanel } from "./GeminiReviewPanel";
import { LoadingState } from "./LoadingState";
import { ResultActions } from "./ResultActions";
import { ResultExplanation } from "./ResultExplanation";
import { useLanguage } from "./LanguageProvider";

export type AnalysisStatus = "initial" | "loading" | "success" | "error";

const RESULT_CARD_CLASS = "analysis-result min-w-0 rounded-[16px] border border-white/70 bg-[rgba(255,248,246,0.91)] p-3.5 shadow-[0_12px_28px_rgba(59,40,34,0.09)] sm:rounded-[22px] sm:p-6 sm:pb-8 sm:shadow-[0_20px_42px_rgba(59,40,34,0.11)]";

interface AnalysisResultProps {
  result: AnalysisResponse;
  analyzedText: string;
  status: AnalysisStatus;
  timestamp: string;
  errorMessage: string | null;
  onRetry: () => void;
}

export function AnalysisResult({
  result,
  analyzedText,
  status,
  timestamp,
  errorMessage,
  onRetry,
}: AnalysisResultProps) {
  const { copy, locale } = useLanguage();
  const isFake = result.label === "FAKE";
  const tone = isFake ? "fake" : "real";
  const accent = isFake ? "#c7353c" : "#2f7447";
  const panelClass = isFake
    ? "border-[#f2d9d4] bg-[linear-gradient(110deg,#ffefec,#fae6e2)]"
    : "border-[#d6e7d8] bg-[linear-gradient(110deg,#eef7ef,#e3f0e5)]";
  const isDemo = result.meta?.engine !== "external-model";
  const isLowConfidence = result.confidence < 0.6;

  // Do not present an unrun multilingual preview as a factual verdict.
  if (status === "initial" && locale !== "ru") {
    return (
      <article className={`${RESULT_CARD_CLASS} result-empty`} aria-live="polite">
        <header className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#e2edf6] text-[#285b87] sm:h-9 sm:w-9 sm:rounded-[11px]" aria-hidden="true"><SearchCheck size={18} strokeWidth={2} /></span>
          <h2 className="min-w-0 break-words text-[0.75rem] font-extrabold text-[#112f4d] sm:text-[1rem]">{copy.result.heading}</h2>
        </header>
        <div className="result-empty-body">
          <span className="result-empty-icon" aria-hidden="true"><SearchCheck size={36} strokeWidth={1.6} /></span>
          <h3 className="font-serif">{copy.analyzer.submit}</h3>
          <p>{locale === "uz" ? "Matn kiriting yoki fayl yuklang. Tekshirish natijasi va topilgan manbalar shu yerda ko‘rinadi." : "Enter text or upload a file. Your result and retrieved sources will appear here after checking."}</p>
        </div>
      </article>
    );
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      aria-live="polite"
      aria-busy={status === "loading"}
      className={RESULT_CARD_CLASS}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 flex-1 basis-[12rem] items-center gap-2 sm:gap-3">
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] sm:h-9 sm:w-9 sm:rounded-[11px] ${
              isFake ? "bg-[#ffe6e3] text-[#d63b43]" : "bg-[#e0eee2] text-[#34794b]"
            }`}
          >
            {isFake ? (
              <AlertCircle size={18} strokeWidth={2} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" />
            )}
          </span>
          <h2 className="min-w-0 break-words text-[0.75rem] font-extrabold text-[#112f4d] sm:text-[1rem]">
            {copy.result.heading}
          </h2>
        </div>
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[0.46875rem] font-extrabold uppercase tracking-[0.07em] sm:px-2 sm:py-1 sm:text-[0.5625rem] ${
              isDemo
                ? "bg-[#f3e1d4] text-[#985539]"
                : "bg-[#dcebdd] text-[#316746]"
            }`}
          >
            {isDemo ? copy.result.demo : copy.result.model}
          </span>
          <time className="max-w-[72px] text-right text-[0.5rem] leading-tight font-medium text-[#768398] sm:max-w-none sm:text-[0.6875rem]">
            {timestamp}
          </time>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {status === "loading" ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LoadingState />
          </motion.div>
        ) : status === "error" ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5 rounded-[15px] border border-[#efc9c4] bg-[#fff0ed] p-5"
            role="alert"
          >
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-[#be3f43]" size={21} />
              <div>
                <h3 className="text-[0.9375rem] font-extrabold text-[#a93239]">
                  {copy.result.failed}
                </h3>
                <p className="mt-1 text-[0.78125rem] leading-relaxed text-[#735c62]">
                  {errorMessage ?? copy.result.retryHint}
                </p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="focus-ring mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#a83a3e] px-4 text-[0.75rem] font-bold text-white"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  {copy.result.retry}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`${result.label}-${result.confidence}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.28 }}
          >
            <section
              className={`mt-2.5 flex flex-wrap items-center gap-2 rounded-[12px] border px-3 py-2.5 sm:mt-3 sm:gap-5 sm:rounded-[15px] sm:px-4 sm:py-3.5 ${panelClass}`}
              aria-label={`${copy.result.resultAria}: ${result.label}`}
            >
              <div className="flex min-w-0 flex-1 basis-[9rem] items-center gap-2.5 sm:basis-[12rem] sm:gap-4">
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] sm:h-11 sm:w-11 sm:rounded-[12px] ${
                    isFake ? "bg-[#f5c8c8] text-[#c63840]" : "bg-[#cfe4d2] text-[#347a4d]"
                  }`}
                >
                  {isFake ? (
                    <AlertTriangle size={19} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={20} strokeWidth={2.2} aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className="text-[2.125rem] leading-none font-extrabold tracking-[-0.04em] sm:text-[3rem]"
                    style={{ color: accent }}
                  >
                    {result.label}
                  </p>
                  <p className="mt-1 max-w-[240px] text-[0.5625rem] leading-[1.3] text-[#5e5e68] sm:mt-2 sm:max-w-[300px] sm:text-[0.75rem] sm:leading-[1.4]">
                    {isLowConfidence
                      ? copy.result.lowConfidence
                      : isFake
                      ? copy.result.fake
                      : copy.result.real}
                  </p>
                </div>
              </div>

              <div className="mx-auto shrink-0">
                <ConfidenceRing value={result.confidence} label={copy.result.confidence} tone={tone} />
              </div>
            </section>

            {result.geminiReview ? (
              <GeminiReviewPanel
                review={result.geminiReview}
                primaryLabel={result.label}
              />
            ) : null}

            <ResultExplanation result={result} analyzedText={analyzedText} />

            <aside className="mt-3 flex gap-2 rounded-[11px] bg-[#e7eef9] px-3 py-2.5 text-[#3c608e] sm:mt-4 sm:gap-3 sm:rounded-[13px] sm:px-4 sm:py-3">
              <Info className="mt-0.5 shrink-0" size={16} fill="#5f8ed8" color="white" aria-hidden="true" />
              <p className="text-[0.59375rem] leading-[1.45] sm:text-[0.75rem] sm:leading-[1.55]">
                {copy.result.disclaimer}
              </p>
            </aside>

            <ResultActions
              result={result}
              analyzedText={analyzedText}
              timestamp={timestamp}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
