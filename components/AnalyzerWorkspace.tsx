"use client";

import { useState } from "react";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";
import { analyzeText, getMockAnalysis, type AnalysisResponse } from "@/lib/api";
import type { HistoryItem } from "@/lib/analysis-history";
import { extractDocumentText } from "@/lib/document-upload";
import { localeTags, type AppLocale } from "@/lib/i18n";
import { AnalysisHistoryDialog } from "./AnalysisHistoryDialog";
import { AnalysisResult, type AnalysisStatus } from "./AnalysisResult";
import { type TextExample } from "./ExampleChips";
import { TextAnalyzer } from "./TextAnalyzer";
import { useLanguage } from "./LanguageProvider";

interface AnalyzerWorkspaceProps {
  geminiConfigured: boolean;
}

interface AnalyzerWorkspaceSessionProps extends AnalyzerWorkspaceProps {
  locale: AppLocale;
  copy: ReturnType<typeof useLanguage>["copy"];
}

function formatTimestamp(date: Date, locale: "uz" | "ru" | "en") {
  // Browser ICU builds can format uz-Latn-UZ differently from Node (e.g. "M11").
  // Use stable Uzbek month names, including for the server-rendered demo.
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
  const examples = copy.examples as readonly TextExample[];
  const initialExample = examples.find((example) => example.id === "medical") ?? examples[0];
  const initialResult: AnalysisResponse = locale === "ru"
    ? getMockAnalysis(initialExample.text)
    : {
        label: "FAKE",
        confidence: 0.55,
        explanation: copy.result.fake,
        meta: {
          engine: "demo-heuristic",
          engineVersion: "multilingual-preview-v1",
          externalSourcesChecked: false,
        },
      };
  // An untouched example follows the UI language; user-entered or uploaded text never resets.
  const [text, setText] = useState<string | null>(null);
  const inputText = text ?? initialExample.text;
  const [activeExampleId, setActiveExampleId] = useState<string | null>("medical");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [analyzedText, setAnalyzedText] = useState<string | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>("initial");
  const [analyzedAt, setAnalyzedAt] = useState(() => new Date("2024-11-26T14:37:00"));
  const timestamp = formatTimestamp(analyzedAt, locale);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [useGemini, setUseGemini] = useState(geminiConfigured);
  const [isExtracting, setIsExtracting] = useState(false);
  const [documentMessage, setDocumentMessage] = useState<{
    kind: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  const handleTextChange = (value: string) => {
    setText(value);
    setActiveExampleId(null);
    setDocumentMessage(null);
    if (value.trim()) {
      setValidationMessage(null);
    }
  };

  const handleClear = () => {
    setText("");
    setActiveExampleId(null);
    setValidationMessage(null);
    setDocumentMessage(null);
  };

  const handleExampleSelect = (example: TextExample) => {
    setText(example.text);
    setActiveExampleId(example.id);
    setValidationMessage(null);
    setErrorMessage(null);
    setDocumentMessage(null);
  };

  const handleDocumentSelect = async (file: File) => {
    setIsExtracting(true);
    setDocumentMessage(null);
    setValidationMessage(null);
    setErrorMessage(null);

    try {
      const extractedDocument = await extractDocumentText(file);
      setText(extractedDocument.text);
      setActiveExampleId(null);
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
    const normalizedText = inputText.trim();

    if (!normalizedText) {
      setValidationMessage(copy.analyzer.required);
      document.getElementById("analysis-text")?.focus();
      return;
    }

    setValidationMessage(null);
    setErrorMessage(null);
    // Once checking begins, the submitted sample is a draft too; don't swap it mid-request.
    setText(normalizedText);
    setStatus("loading");

    try {
      const nextResult = await analyzeText(normalizedText, { useGemini, locale });
      const analyzedAt = new Date();
      setResult(nextResult);
      setAnalyzedText(normalizedText);
      setAnalyzedAt(analyzedAt);
      setStatus("success");

      history.add({
        source: "user",
        status: "success",
        text: normalizedText,
        label: nextResult.label,
        confidence: nextResult.confidence,
        analyzedAt,
        meta: {
          engine: nextResult.meta?.engine ?? "external-model",
          version: nextResult.meta?.engineVersion ?? "external-api",
        },
      });
    } catch {
      setErrorMessage(
        copy.analyzer.serviceError,
      );
      setStatus("error");
    }
  };

  const handleHistoryRestore = (item: HistoryItem) => {
    const restoredResult: AnalysisResponse =
      item.meta.engine === "demo-heuristic"
        ? getMockAnalysis(item.text)
        : {
            label: item.label,
            confidence: item.confidence,
            meta: {
              engine: item.meta.engine,
              engineVersion: item.meta.version,
              externalSourcesChecked: false,
            },
          };

    setText(item.text);
    setAnalyzedText(item.text);
    setActiveExampleId(null);
    setResult(restoredResult);
    setAnalyzedAt(new Date(item.analyzedAt));
    setValidationMessage(null);
    setErrorMessage(null);
    setStatus("success");
    setIsHistoryOpen(false);
  };

  return (
    <section
      id="analyzer"
      aria-label={copy.analyzer.region}
      className="tool-gutter relative z-10 pb-4 pt-1 sm:pb-6 sm:pt-[11px]"
    >
      <div className="analyzer-grid grid items-start gap-3 sm:gap-[18px] lg:grid-cols-[minmax(0,1.25fr)_minmax(390px,0.95fr)]">
        <TextAnalyzer
          text={inputText}
          examples={examples}
          activeExampleId={activeExampleId}
          isLoading={status === "loading"}
          isExtracting={isExtracting}
          validationMessage={validationMessage}
          documentMessage={documentMessage}
          historyOpen={isHistoryOpen}
          historyEnabled={history.enabled}
          historyCount={history.items.length}
          geminiConfigured={geminiConfigured}
          useGemini={useGemini}
          onTextChange={handleTextChange}
          onDocumentSelect={handleDocumentSelect}
          onClear={handleClear}
          onExampleSelect={handleExampleSelect}
          onSubmit={handleSubmit}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onUseGeminiChange={setUseGemini}
        />

        <div className="analyzer-result-slot min-w-0">
          <AnalysisResult
            result={result ?? initialResult}
            analyzedText={analyzedText ?? initialExample.text}
            status={status}
            timestamp={timestamp}
            errorMessage={errorMessage}
            onRetry={handleSubmit}
          />
        </div>
      </div>

      <AnalysisHistoryDialog
        isOpen={isHistoryOpen}
        enabled={history.enabled}
        items={history.items}
        errorMessage={history.error?.message ?? null}
        onClose={() => setIsHistoryOpen(false)}
        onEnable={history.enable}
        onDisable={history.disable}
        onClear={history.clear}
        onDelete={history.remove}
        onRestore={handleHistoryRestore}
      />
    </section>
  );
}
