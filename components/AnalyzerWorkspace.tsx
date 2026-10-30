"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";
import { analyzeText, getCalculationAnalysis, getMockAnalysis, type AnalysisResponse } from "@/lib/api";
import type { HistoryItem } from "@/lib/analysis-history";
import { extractDocumentText } from "@/lib/document-upload";
import { localeTags, type AppLocale } from "@/lib/i18n";
import { detectTextLanguage } from "@/lib/text-language";
import { AnalysisResult, type AnalysisStatus } from "./AnalysisResult";
import { TextAnalyzer } from "./TextAnalyzer";
import { useLanguage } from "./LanguageProvider";
import { usePreferences } from "./PreferencesProvider";
import type { SearchTopic } from "@/lib/search-topics";

interface AnalyzerWorkspaceProps {
  geminiConfigured: boolean;
}

interface AnalyzerWorkspaceSessionProps extends AnalyzerWorkspaceProps {
  locale: AppLocale;
  copy: ReturnType<typeof useLanguage>["copy"];
}

function formatTimestamp(date: Date, locale: "uz" | "ru" | "en") {
  // Browser ICU builds can format uz-Latn-UZ differently from Node (e.g. "M11").
  // Use stable Uzbek month names for submitted and restored results.
  if (locale === "uz") {
    const months = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${date.getDate()}-${months[date.getMonth()]}, ${date.getFullYear()}, ${hours}:${minutes}`;
  }
  return new Intl.DateTimeFormat(localeTags[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(" г.", "");
}

export function AnalyzerWorkspace({ geminiConfigured }: AnalyzerWorkspaceProps) {
  const { locale, copy } = useLanguage();
  return (
    <AnalyzerWorkspaceSession
      locale={locale}
      copy={copy}
      geminiConfigured={geminiConfigured}
    />
  );
}

function AnalyzerWorkspaceSession({
  geminiConfigured,
  locale,
  copy,
}: AnalyzerWorkspaceSessionProps) {
  const history = useAnalysisHistory();
  const { preferences } = usePreferences();
  const [topicOverride, setTopicOverride] = useState<{ base: SearchTopic; value: SearchTopic } | null>(null);
  const topic = topicOverride?.base === preferences.topic ? topicOverride.value : preferences.topic;
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [analyzedText, setAnalyzedText] = useState<string | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>("initial");
  const [analyzedAt, setAnalyzedAt] = useState<Date | null>(null);
  const timestamp = analyzedAt ? formatTimestamp(analyzedAt, locale) : "";
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [documentMessage, setDocumentMessage] = useState<{
    kind: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const isBusy = status === "loading" || isExtracting;
  const submissionInFlight = useRef(false);

  const handleTextChange = (value: string) => {
    setText(value);
    setDocumentMessage(null);
    if (value.trim()) {
      setValidationMessage(null);
    }
  };

  const handleClear = () => {
    if (isBusy) return;
    setText("");
    setValidationMessage(null);
    setDocumentMessage(null);
    setResult(null);
    setAnalyzedText(null);
    setAnalyzedAt(null);
    setStatus("initial");
    setErrorMessage(null);
  };

  const handleDocumentSelect = async (file: File) => {
    setIsExtracting(true);
    setDocumentMessage(null);
    setValidationMessage(null);
    setErrorMessage(null);

    try {
      const extractedDocument = await extractDocumentText(file);
      setText(extractedDocument.text);
      setDocumentMessage({
        kind: extractedDocument.truncated ? "warning" : "success",
        text: extractedDocument.truncated
          ? `${extractedDocument.fileName}: ${extractedDocument.originalCharacters.toLocaleString(localeTags[locale])} ${copy.analyzer.extractedTruncated}`
          : `${extractedDocument.fileName}: ${copy.analyzer.extracted}${extractedDocument.pages ? ` (${extractedDocument.pages})` : ""}. ${copy.analyzer.extractedEditable}`,
      });
      window.requestAnimationFrame(() =>
        document.getElementById("analysis-text")?.focus(),
      );
    } catch (error) {
      setDocumentMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : copy.analyzer.readError,
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async () => {
    // The ref closes the gap before React commits the loading/disabled state.
    // Keyboard and pointer submission share the same in-flight request guard.
    if (isBusy || submissionInFlight.current) return;
    const normalizedText = text.trim();

    if (!normalizedText) {
      setValidationMessage(copy.analyzer.required);
      document.getElementById("analysis-text")?.focus();
      return;
    }

    submissionInFlight.current = true;
    setValidationMessage(null);
    setErrorMessage(null);
    setText(normalizedText);
    setStatus("loading");

    try {
      const nextResult = await analyzeText(normalizedText, {
        useGemini: detectTextLanguage(normalizedText) === "uz" || geminiConfigured,
        locale,
        ...(topic !== "general" ? { topic } : {}),
      });
      const analyzedAt = new Date();
      setResult(nextResult);
      setAnalyzedText(normalizedText);
      setAnalyzedAt(analyzedAt);
      setStatus("success");

      history.add({
        source: "user",
        status: "success",
        text: normalizedText,
        // Source conclusions and their evidence are not retained by compact local history.
        // Do not later turn a source contradiction into the underlying ML REAL score.
        label: nextResult.geminiReview?.status === "complete" ? "UNSURE" : nextResult.label,
        confidence: nextResult.geminiReview?.status === "complete" ? 0 : nextResult.confidence,
        analyzedAt,
        meta: {
          engine: nextResult.geminiReview?.status === "complete" ? "unavailable" : nextResult.meta?.engine ?? "external-model",
          version: nextResult.geminiReview?.status === "complete" ? "source-review-not-retained" : nextResult.meta?.engineVersion ?? "external-api",
          ...(nextResult.meta?.language ? { language: nextResult.meta.language } : {}),
        },
      });
    } catch {
      setErrorMessage(
        copy.analyzer.serviceError,
      );
      setStatus("error");
    } finally {
      submissionInFlight.current = false;
    }
  };

  const handleHistoryRestore = useCallback((item: HistoryItem) => {
    if (isBusy) return;
    const restoredResult: AnalysisResponse =
      // Compact history deliberately stores no calculation result. Recompute
      // from the complete text rather than trusting a stored label or score.
      item.meta.engine === "calculation"
        ? getCalculationAnalysis(item.text, locale) ?? {
            label: "UNSURE",
            confidence: 0,
            meta: {
              engine: "unavailable",
              engineVersion: "arithmetic-history-invalid",
              externalSourcesChecked: false,
            },
          }
        : item.meta.engine === "demo-heuristic"
        ? getMockAnalysis(item.text)
        : {
            label: item.meta.language ? item.label : "UNSURE",
            confidence: item.meta.language ? item.confidence : 0,
            meta: {
              engine: item.meta.language ? item.meta.engine : "unavailable",
              engineVersion: item.meta.version,
              externalSourcesChecked: false,
              ...(item.meta.language ? { language: item.meta.language } : {}),
            },
          };

    setText(item.text);
    setAnalyzedText(item.text);
    setResult(restoredResult);
    setAnalyzedAt(new Date(item.analyzedAt));
    setValidationMessage(null);
    setErrorMessage(null);
    setStatus("success");
  }, [isBusy, locale]);

  const restoredHistoryId = useRef<string | null>(null);
  useEffect(() => {
    if (!history.isHydrated) return;
    const restoreId = (id: unknown) => {
      if (isBusy || typeof id !== "string") return false;
      const item = history.items.find(entry => entry.id === id);
      if (!item) return false;
      handleHistoryRestore(item);
      requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("analysis-text")?.focus()));
      return true;
    };
    const restore = (event: Event) => { if (!restoreId((event as CustomEvent<unknown>).detail)) event.preventDefault(); };
    window.addEventListener("rufact-history-restore", restore);
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("history");
    if (requested && restoredHistoryId.current !== requested && restoreId(requested)) {
      restoredHistoryId.current = requested;
      url.searchParams.delete("history");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return () => window.removeEventListener("rufact-history-restore", restore);
  }, [history.isHydrated, history.items, isBusy, handleHistoryRestore]);

  return (
    <section
      id="analyzer"
      aria-busy={isBusy}
      aria-label={copy.analyzer.region}
      className="tool-gutter relative z-10 pb-4 pt-1 sm:pb-6 sm:pt-[11px]"
    >
      <div className="analyzer-grid grid items-start gap-3 sm:gap-[18px] lg:grid-cols-[minmax(0,1.25fr)_minmax(390px,0.95fr)]">
        <TextAnalyzer
          text={text}
          canClear={text.length > 0 || result !== null || status === "error"}
          isLoading={status === "loading"}
          isExtracting={isExtracting}
          validationMessage={validationMessage}
          documentMessage={documentMessage}
          topic={topic}
          onTopicChange={value => setTopicOverride({ base: preferences.topic, value })}
          geminiConfigured={geminiConfigured}
          onTextChange={handleTextChange}
          onDocumentSelect={handleDocumentSelect}
          onClear={handleClear}
          onSubmit={handleSubmit}
        />

        <div className="analyzer-result-slot min-w-0">
          <AnalysisResult
            result={result}
            analyzedText={analyzedText ?? ""}
            status={status}
            timestamp={timestamp}
            errorMessage={errorMessage}
            onRetry={handleSubmit}
          />
        </div>
      </div>

    </section>
  );
}
