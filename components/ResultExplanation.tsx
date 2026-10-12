"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ExternalLink,
  ListChecks,
  Search,
  SearchCheck,
} from "lucide-react";
import { useState } from "react";
import type {
  AnalysisLabel,
  AnalysisResponse,
  AnalysisSignal,
  EvidenceSpan,
} from "@/lib/api";
import { getPublicVerdict } from "@/lib/api";
import { verdictCopy } from "@/lib/verdict-copy";
import { useLanguage } from "./LanguageProvider";

const fallbackContent = {
  FAKE: {
    explanation:
      "Текст содержит типичные признаки недостоверной информации: неподтверждённые заявления, чрезмерные обещания или отсутствие конкретных источников.",
    signals: [
      "Отсутствуют конкретные источники",
      "Слишком категоричные утверждения",
      "Ссылка на неопределённых «учёных»",
      "Утверждения без проверяемых доказательств",
    ],
  },
  REAL: {
    explanation:
      "В тексте не обнаружены выраженные языковые признаки манипуляции: формулировки сдержанные, а источники или контекст описаны конкретнее. Это не подтверждает факты автоматически.",
    signals: [
      "Сдержанные и проверяемые формулировки",
      "Нет обещаний гарантированного результата",
      "Указан источник или контекст",
      "Факты отделены от оценочных суждений",
    ],
  },
  UNSURE: { explanation: "Нет проверенного результата. Повторите проверку по источникам.", signals: [] },
} satisfies Record<AnalysisLabel, { explanation: string; signals: string[] }>;

interface ResultExplanationProps {
  result: AnalysisResponse;
  analyzedText: string;
}

function getFallbackSignals(label: AnalysisLabel): AnalysisSignal[] {
  const tone = label === "FAKE" ? "risk" : "reassuring";

  return fallbackContent[label].signals.map((title, index) => ({
    id: `fallback-${label.toLowerCase()}-${index}`,
    title,
    description:
      label === "FAKE"
        ? "Этот маркер повышает риск недостоверной или манипулятивной подачи."
        : "Этот маркер делает утверждение более проверяемым, но не доказывает его истинность.",
    tone,
    severity: "medium",
    evidenceIds: [],
  }));
}

function buildEvidenceMap(evidence: readonly EvidenceSpan[] | undefined, analyzedText: string) {
  const map = new Map<string, EvidenceSpan>();

  for (const item of evidence ?? []) {
    if (
      item.start >= 0 &&
      item.end > item.start &&
      item.end <= analyzedText.length &&
      analyzedText.slice(item.start, item.end) === item.quote
    ) {
      map.set(item.id, item);
    }
  }

  return map;
}

export function ResultExplanation({ result, analyzedText }: ResultExplanationProps) {
  const { locale, copy } = useLanguage();
  const verdict = getPublicVerdict(result);
  const [isOpen, setIsOpen] = useState(false);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const fallback = locale === "ru"
    ? fallbackContent[result.label]
    : {
        explanation: result.label === "FAKE" ? copy.result.fake : copy.result.real,
        signals: [],
      };
  const isModelResult = result.meta?.engine === "external-model";
  const signals = result.signals?.length
    ? result.signals
    : isModelResult || result.meta?.engine === "unavailable"
      ? []
      : locale === "ru"
        ? getFallbackSignals(result.label)
        : [];
  const evidenceById = buildEvidenceMap(result.evidence, analyzedText);
  const sourceReview = result.meta?.externalSourcesChecked
    ? undefined
    : result.sourceReview;

  return (
    <div>
      <section
        id="result-explanation"
        aria-labelledby="explanation-title"
        className="mt-2.5 flex scroll-mt-24 gap-2.5 sm:mt-3 sm:gap-3"
      >
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#dcecdf] text-[#2f7950] sm:h-8 sm:w-8 sm:rounded-[9px]">
          <SearchCheck size={16} strokeWidth={2} aria-hidden="true" />
        </span>
        <div>
          <h3 id="explanation-title" className="text-[0.8125rem] font-extrabold text-[#173451] sm:text-[0.9375rem]">
            {copy.result.why}
          </h3>
          <p className="mt-1 text-[0.65625rem] leading-[1.45] text-[#69778c] sm:mt-2 sm:text-[0.8125rem] sm:leading-[1.55]">
            {verdict.basis === "unavailable" ? verdictCopy[locale].unavailable : verdict.explanation ??
              (isModelResult
                ? copy.result.noSavedExplanation
                : fallback.explanation)}
          </p>
        </div>
      </section>

      {signals.length ? (
        <div className="mt-2.5 overflow-hidden rounded-[10px] border border-[#ead5ce] bg-white/25 sm:mt-3 sm:rounded-[12px]">
        <button
          type="button"
          className="focus-ring flex min-h-10 w-full items-center gap-2 rounded-[9px] px-2.5 text-left text-[0.6875rem] font-semibold text-[#243b55] transition-colors hover:bg-white/35 sm:min-h-11 sm:gap-3 sm:rounded-[11px] sm:px-3 sm:text-[0.8125rem]"
          aria-expanded={isOpen}
          aria-controls="result-signals"
          onClick={() => setIsOpen((value) => !value)}
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-[#fae0d6] text-[#d45c39] sm:h-7 sm:w-7 sm:rounded-lg">
            <ListChecks size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="flex-1">
            {isModelResult ? copy.result.modelSignals : copy.result.textSignals}
          </span>
          <span className="rounded-md bg-[#f1e4de] px-2 py-0.5 text-[0.625rem] font-bold tabular-nums text-[#8f5a48]">
            {signals.length}
          </span>
          <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={17} aria-hidden="true" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              id="result-signals"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <ul className="grid gap-3 border-t border-[#eadbd5] px-4 py-3">
                {signals.map((signal) => {
                  const signalEvidence = signal.evidenceIds
                    .map((id) => evidenceById.get(id))
                    .filter((item): item is EvidenceSpan => Boolean(item));

                  return (
                    <li key={signal.id} className="flex gap-2.5">
                      <span
                        className={`mt-[0.42rem] h-2 w-2 shrink-0 rounded-full ${
                          signal.tone === "risk" ? "bg-[#d66749]" : "bg-[#4c8a60]"
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-[0.75rem] leading-[1.4] font-bold text-[#445269]">
                          {signal.title}
                        </p>
                        <p className="mt-0.5 text-[0.6875rem] leading-[1.45] text-[#758094]">
                          {signal.description}
                        </p>
                        {signalEvidence.map((item) => (
                          <blockquote
                            key={item.id}
                            className={`mt-2 rounded-r-lg border-l-2 px-2.5 py-1.5 text-[0.65625rem] leading-[1.45] italic ${
                              item.tone === "risk"
                                ? "border-[#dc765b] bg-[#fff1ec] text-[#865b51]"
                                : "border-[#65a077] bg-[#edf6ef] text-[#55715d]"
                            }`}
                          >
                            «{item.quote}»
                          </blockquote>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
        </div>
      ) : result.meta?.engine !== "unavailable" ? (
        <p data-statistical-placeholder className="mt-3 rounded-[12px] border border-[#d8dfe4] bg-white/35 px-4 py-3 text-[0.6875rem] leading-[1.5] text-[#6d7886]">
          {copy.result.signalsUnavailable}
        </p>
      ) : null}

      {sourceReview ? (
        <section
          className="mt-2.5 overflow-hidden rounded-[10px] border border-[#d8dfe4] bg-[#f3f5f3]/65 sm:mt-3 sm:rounded-[12px]"
          aria-labelledby="source-check-heading"
        >
          <button
            type="button"
            className="focus-ring flex min-h-10 w-full items-center gap-2 rounded-[9px] px-2.5 text-left transition-colors hover:bg-white/35 sm:min-h-11 sm:gap-3 sm:rounded-[11px] sm:px-3"
            aria-expanded={isSourceOpen}
            aria-controls="source-check-content"
            onClick={() => setIsSourceOpen((value) => !value)}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#e1e8ec] text-[#385f7a]">
              <Search size={15} strokeWidth={2} aria-hidden="true" />
            </span>
            <h3 id="source-check-heading" className="min-w-0 flex-1 text-[0.65625rem] font-extrabold text-[#23425d] sm:text-[0.78125rem]">
              {copy.result.sourceHow}
            </h3>
            <span className="rounded-md bg-[#f0ddcf] px-2 py-0.5 text-[0.53125rem] font-extrabold uppercase tracking-[0.07em] text-[#93553c]">
              {copy.result.notChecked}
            </span>
            <motion.span animate={{ rotate: isSourceOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={16} aria-hidden="true" />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {isSourceOpen ? (
              <motion.div
                id="source-check-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="border-t border-[#d8dfe4] px-4 py-3"
              >
                <p className="text-[0.6875rem] leading-[1.5] text-[#6d7886]">
                  {sourceReview.message}
                </p>

                {sourceReview.actions.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {sourceReview.actions.map((action) => (
                      <a
                        key={action.id}
                        href={`https://yandex.ru/search/?text=${encodeURIComponent(action.query)}`}
                        target="_blank"
                        rel="noreferrer"
                        title={action.rationale}
                        className="focus-ring inline-flex min-h-9 items-center justify-between gap-2 rounded-[10px] border border-[#d9e0e2] bg-white/70 px-3 text-[0.65625rem] font-bold text-[#31536e] transition-colors hover:bg-white"
                      >
                        {action.label}
                        <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
      ) : null}
    </div>
  );
}
