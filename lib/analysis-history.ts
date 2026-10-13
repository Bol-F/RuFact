import type { AnalysisEngine, AnalysisLabel } from "@/lib/api";

export const ANALYSIS_HISTORY_STORAGE_KEY = "rufact:analysis-history:v1";
export const ANALYSIS_HISTORY_SCHEMA_VERSION = 1 as const;
export const ANALYSIS_HISTORY_MAX_ITEMS = 20;
export const ANALYSIS_HISTORY_RETENTION_DAYS = 30;

const MAX_TEXT_LENGTH = 5_000;
const MAX_ENGINE_VERSION_LENGTH = 100;
const MAX_ENTRY_ID_LENGTH = 128;
const MAX_SERIALIZED_HISTORY_LENGTH = 150_000;
const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1_000;
const RETENTION_MS = ANALYSIS_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1_000;

export interface AnalysisHistoryMeta {
  readonly engine: AnalysisEngine;
  readonly version: string;
  readonly language?: "ru" | "en";
}

export interface AnalysisHistoryEntry {
  readonly id: string;
  readonly text: string;
  readonly label: AnalysisLabel;
  readonly confidence: number;
  readonly analyzedAt: string;
  readonly meta: AnalysisHistoryMeta;
}

/** Concise UI-facing alias for a stored analysis. */
export type HistoryItem = AnalysisHistoryEntry;

export interface AnalysisHistoryEnvelope {
  readonly version: typeof ANALYSIS_HISTORY_SCHEMA_VERSION;
  readonly enabled: boolean;
  readonly items: readonly AnalysisHistoryEntry[];
}

/**
 * The literal source and status fields keep initial demo results and failed
 * requests out of history at both the type boundary and runtime boundary.
 */
export interface SuccessfulUserAnalysisHistoryInput {
  readonly source: "user";
  readonly status: "success";
  readonly text: string;
  readonly label: AnalysisLabel;
  readonly confidence: number;
  readonly analyzedAt?: Date | string;
  readonly meta: AnalysisHistoryMeta;
}

export type AnalysisHistoryErrorCode =
  | "invalid-data"
  | "invalid-entry"
  | "storage-unavailable"
  | "write-failed";

export interface AnalysisHistoryError {
  readonly code: AnalysisHistoryErrorCode;
  readonly message: string;
}

export type AnalysisHistoryResult<T> =
  | { readonly ok: true; readonly value: T; readonly changed: boolean }
  | { readonly ok: false; readonly error: AnalysisHistoryError };

const EMPTY_HISTORY_ERROR_MESSAGES = {
  invalidData: "Сохранённая история повреждена и не была загружена.",
  invalidEntry: "Результат анализа не удалось добавить в историю.",
  storageUnavailable: "Локальная история недоступна в этом браузере.",
  writeFailed: "Не удалось сохранить локальную историю.",
} as const;

function error(
  code: AnalysisHistoryErrorCode,
  message: string,
): AnalysisHistoryResult<never> {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(record);

  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function isAnalysisEngine(value: unknown): value is AnalysisEngine {
  return value === "demo-heuristic" || value === "external-model" || value === "unavailable" || value === "calculation";
}

function isCanonicalIsoTimestamp(value: unknown, now: number): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);

  return (
    Number.isFinite(timestamp) &&
    timestamp <= now + FUTURE_TIMESTAMP_TOLERANCE_MS &&
    new Date(timestamp).toISOString() === value
  );
}

function isHistoryMeta(value: unknown): value is AnalysisHistoryMeta {
  if (!isRecord(value) || (
    !hasExactKeys(value, ["engine", "version"]) &&
    !hasExactKeys(value, ["engine", "version", "language"])
  )) {
    return false;
  }

  return (
    isAnalysisEngine(value.engine) &&
    typeof value.version === "string" &&
    value.version.trim() === value.version &&
    value.version.length > 0 &&
    value.version.length <= MAX_ENGINE_VERSION_LENGTH &&
    (value.language === undefined || value.language === "ru" || value.language === "en")
  );
}

function isHistoryEntry(value: unknown, now: number): value is AnalysisHistoryEntry {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "text",
      "label",
      "confidence",
      "analyzedAt",
      "meta",
    ])
  ) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= MAX_ENTRY_ID_LENGTH &&
    typeof value.text === "string" &&
    value.text.trim() === value.text &&
    value.text.length > 0 &&
    value.text.length <= MAX_TEXT_LENGTH &&
    (value.label === "REAL" || value.label === "FAKE" || value.label === "UNSURE") &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    isCanonicalIsoTimestamp(value.analyzedAt, now) &&
    isHistoryMeta(value.meta)
  );
}

function validateEnvelope(
  value: unknown,
  now: number,
): AnalysisHistoryResult<AnalysisHistoryEnvelope> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["version", "enabled", "items"]) ||
    value.version !== ANALYSIS_HISTORY_SCHEMA_VERSION ||
    typeof value.enabled !== "boolean" ||
    !Array.isArray(value.items) ||
    value.items.length > ANALYSIS_HISTORY_MAX_ITEMS ||
    (!value.enabled && value.items.length > 0)
  ) {
    return error("invalid-data", EMPTY_HISTORY_ERROR_MESSAGES.invalidData);
  }

  const ids = new Set<string>();
  const normalizedTexts = new Set<string>();

  for (const item of value.items) {
    if (!isHistoryEntry(item, now)) {
      return error("invalid-data", EMPTY_HISTORY_ERROR_MESSAGES.invalidData);
    }

    const normalizedText = normalizeAnalysisHistoryText(item.text);

    if (ids.has(item.id) || normalizedTexts.has(normalizedText)) {
      return error("invalid-data", EMPTY_HISTORY_ERROR_MESSAGES.invalidData);
    }

    ids.add(item.id);
    normalizedTexts.add(normalizedText);
  }

  const oldestAllowedTimestamp = now - RETENTION_MS;
  const retainedItems = value.items.filter(
    (item) => Date.parse(item.analyzedAt) >= oldestAllowedTimestamp,
  );

  return {
    ok: true,
    value: {
      version: ANALYSIS_HISTORY_SCHEMA_VERSION,
      enabled: value.enabled,
      items: retainedItems,
    },
    changed: retainedItems.length !== value.items.length,
  };
}

function resolveAnalyzedAt(value: Date | string | undefined, now: number) {
  if (value === undefined) {
    return new Date(now).toISOString();
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) &&
      timestamp <= now + FUTURE_TIMESTAMP_TOLERANCE_MS
      ? value.toISOString()
      : null;
  }

  return isCanonicalIsoTimestamp(value, now) ? value : null;
}

function createEntryId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // The fallback below is sufficient for a local, non-security identifier.
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createEmptyAnalysisHistory(): AnalysisHistoryEnvelope {
  return {
    version: ANALYSIS_HISTORY_SCHEMA_VERSION,
    enabled: false,
    items: [],
  };
}

export function normalizeAnalysisHistoryText(text: string) {
  return text
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("ru-RU");
}

export function parseAnalysisHistory(
  serialized: string | null,
  now = Date.now(),
): AnalysisHistoryResult<AnalysisHistoryEnvelope> {
  if (serialized === null) {
    return { ok: true, value: createEmptyAnalysisHistory(), changed: false };
  }

  if (serialized.length > MAX_SERIALIZED_HISTORY_LENGTH) {
    return error("invalid-data", EMPTY_HISTORY_ERROR_MESSAGES.invalidData);
  }

  try {
    const parsed: unknown = JSON.parse(serialized);
    return validateEnvelope(parsed, now);
  } catch {
    return error("invalid-data", EMPTY_HISTORY_ERROR_MESSAGES.invalidData);
  }
}

export function loadAnalysisHistory(
  now = Date.now(),
): AnalysisHistoryResult<AnalysisHistoryEnvelope> {
  if (typeof window === "undefined") {
    return error(
      "storage-unavailable",
      EMPTY_HISTORY_ERROR_MESSAGES.storageUnavailable,
    );
  }

  try {
    return parseAnalysisHistory(
      window.localStorage.getItem(ANALYSIS_HISTORY_STORAGE_KEY),
      now,
    );
  } catch {
    return error(
      "storage-unavailable",
      EMPTY_HISTORY_ERROR_MESSAGES.storageUnavailable,
    );
  }
}

export function saveAnalysisHistory(
  envelope: AnalysisHistoryEnvelope,
  now = Date.now(),
): AnalysisHistoryResult<AnalysisHistoryEnvelope> {
  if (typeof window === "undefined") {
    return error(
      "storage-unavailable",
      EMPTY_HISTORY_ERROR_MESSAGES.storageUnavailable,
    );
  }

  const validated = validateEnvelope(envelope, now);

  if (!validated.ok) {
    return validated;
  }

  try {
    window.localStorage.setItem(
      ANALYSIS_HISTORY_STORAGE_KEY,
      JSON.stringify(validated.value),
    );
    return validated;
  } catch {
    return error("write-failed", EMPTY_HISTORY_ERROR_MESSAGES.writeFailed);
  }
}

export function deleteAnalysisHistory(): AnalysisHistoryResult<AnalysisHistoryEnvelope> {
  if (typeof window === "undefined") {
    return error(
      "storage-unavailable",
      EMPTY_HISTORY_ERROR_MESSAGES.storageUnavailable,
    );
  }

  try {
    window.localStorage.removeItem(ANALYSIS_HISTORY_STORAGE_KEY);
    return { ok: true, value: createEmptyAnalysisHistory(), changed: true };
  } catch {
    return error("write-failed", EMPTY_HISTORY_ERROR_MESSAGES.writeFailed);
  }
}

export function addAnalysisHistoryEntry(
  envelope: AnalysisHistoryEnvelope,
  input: SuccessfulUserAnalysisHistoryInput,
  now = Date.now(),
): AnalysisHistoryResult<AnalysisHistoryEnvelope> {
  const validatedEnvelope = validateEnvelope(envelope, now);

  if (!validatedEnvelope.ok) {
    return validatedEnvelope;
  }

  const currentEnvelope = validatedEnvelope.value;

  if (!currentEnvelope.enabled) {
    return {
      ok: true,
      value: currentEnvelope,
      changed: validatedEnvelope.changed,
    };
  }

  if (!isRecord(input)) {
    return error("invalid-entry", EMPTY_HISTORY_ERROR_MESSAGES.invalidEntry);
  }

  const text = typeof input.text === "string" ? input.text.trim() : "";
  const analyzedAt = resolveAnalyzedAt(input.analyzedAt, now);
  const oldestAllowedTimestamp = now - RETENTION_MS;

  if (
    input.source !== "user" ||
    input.status !== "success" ||
    text.length === 0 ||
    text.length > MAX_TEXT_LENGTH ||
    (input.label !== "REAL" && input.label !== "FAKE" && input.label !== "UNSURE") ||
    typeof input.confidence !== "number" ||
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1 ||
    !analyzedAt ||
    Date.parse(analyzedAt) < oldestAllowedTimestamp ||
    !isHistoryMeta(input.meta)
  ) {
    return error("invalid-entry", EMPTY_HISTORY_ERROR_MESSAGES.invalidEntry);
  }

  const normalizedText = normalizeAnalysisHistoryText(text);
  const existingEntry = currentEnvelope.items.find(
    (item) => normalizeAnalysisHistoryText(item.text) === normalizedText,
  );
  const entry: AnalysisHistoryEntry = {
    id: existingEntry?.id ?? createEntryId(),
    text,
    label: input.label,
    confidence: input.confidence,
    analyzedAt,
    meta: {
      engine: input.meta.engine,
      version: input.meta.version,
      ...(input.meta.language ? { language: input.meta.language } : {}),
    },
  };
  const items = [
    entry,
    ...currentEnvelope.items.filter(
      (item) => normalizeAnalysisHistoryText(item.text) !== normalizedText,
    ),
  ]
    .filter((item) => Date.parse(item.analyzedAt) >= oldestAllowedTimestamp)
    .slice(0, ANALYSIS_HISTORY_MAX_ITEMS);

  return {
    ok: true,
    value: {
      version: ANALYSIS_HISTORY_SCHEMA_VERSION,
      enabled: true,
      items,
    },
    changed: true,
  };
}

export function removeAnalysisHistoryEntry(
  envelope: AnalysisHistoryEnvelope,
  id: string,
): AnalysisHistoryEnvelope {
  const items = envelope.items.filter((item) => item.id !== id);

  return items.length === envelope.items.length
    ? envelope
    : {
        version: ANALYSIS_HISTORY_SCHEMA_VERSION,
        enabled: envelope.enabled,
        items,
      };
}
