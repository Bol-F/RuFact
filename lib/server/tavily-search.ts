import type { GeminiSource } from "../gemini-review";
import { createAbortScope } from "./abort-scope.ts";
import { readBoundedText } from "./bounded-text.ts";
import type { AppLocale } from "../i18n";
import { safeSourceHref } from "../claim-evidence.ts";
import type { SearchTopic } from "../search-topics";
import { preferredTopicDomains } from "./search-topic-policy.ts";

const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 256_000;
const MAX_QUERY_LENGTH = 700;
const MAX_RESULTS = 6;
const MAX_CONTENT_LENGTH = 1_500;
const MAX_TITLE_LENGTH = 240;
const MAX_URL_LENGTH = 2_048;

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface TavilyEvidenceSource extends GeminiSource {
  content: string;
}

export interface TavilyEvidence {
  query: string;
  sources: TavilyEvidenceSource[];
}

export type TavilyFailureReason =
  | "search-rate-limited"
  | "no-search-results"
  | "search-error";

export type TavilySearchResult =
  | { ok: true; evidence: TavilyEvidence }
  | { ok: false; reason: TavilyFailureReason };

export interface TavilyRequest {
  text: string;
  locale?: AppLocale;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: FetchImplementation;
  signal?: AbortSignal;
  // Server-owned ranking hints; prefer keeps the wider web searchable.
  preferredDomains?: readonly string[];
  topic?: SearchTopic;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildQuery(text: string) {
  const compact = text.replace(/\s+/gu, " ").trim();
  if (compact.length <= 600) return compact;

  const candidate = compact.slice(0, 600);
  const boundary = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf("? "),
    candidate.lastIndexOf(" "),
  );
  return candidate.slice(0, boundary >= 450 ? boundary + 1 : 600).trim();
}

function parseEvidence(value: unknown): TavilyEvidence | null {
  if (!isRecord(value) || !Array.isArray(value.results)) return null;

  const query = typeof value.query === "string" ? value.query.trim() : "";
  if (!query || query.length > MAX_QUERY_LENGTH) return null;

  const sources: TavilyEvidenceSource[] = [];
  const seenUrls = new Set<string>();
  for (const item of value.results) {
    if (!isRecord(item)) continue;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (
      !title ||
      !content ||
      title.length > MAX_TITLE_LENGTH ||
      url.length > MAX_URL_LENGTH ||
      seenUrls.has(url)
    ) {
      continue;
    }
    if (!safeSourceHref({ id: "candidate", title, url })) continue;

    seenUrls.add(url);
    sources.push({
      id: `source-${sources.length + 1}`,
      title,
      url,
      content: content.slice(0, MAX_CONTENT_LENGTH),
    });
    if (sources.length === MAX_RESULTS) break;
  }

  return sources.length ? { query, sources } : null;
}

export async function requestTavilyEvidence({
  text,
  locale = "uz",
  apiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
  signal,
  preferredDomains,
  topic = "general",
}: TavilyRequest): Promise<TavilySearchResult> {
  const abortScope = createAbortScope(signal, timeoutMs);
  const domains = preferredTopicDomains(topic, preferredDomains);

  try {
    const response = await fetchImpl(TAVILY_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: buildQuery(text),
        search_depth: "basic",
        chunks_per_source: 2,
        max_results: MAX_RESULTS,
        topic: "general",
        language: locale,
        filter_by_language: false,
        ...(domains.length ? {
          include_domains: domains,
          include_domains_mode: "prefer",
        } : {}),
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_favicon: false,
        include_usage: false,
        safe_search: true,
      }),
      cache: "no-store",
      signal: abortScope.signal,
    });

    if ([429, 432, 433].includes(response.status)) {
      return { ok: false, reason: "search-rate-limited" };
    }
    if (!response.ok) return { ok: false, reason: "search-error" };

    const rawPayload = await readBoundedText(response, {
      maxBytes: MAX_RESPONSE_BYTES,
      signal: abortScope.signal,
    });

    let payload: unknown;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      return { ok: false, reason: "search-error" };
    }

    const evidence = parseEvidence(payload);
    return evidence
      ? { ok: true, evidence }
      : { ok: false, reason: "no-search-results" };
  } catch {
    return { ok: false, reason: "search-error" };
  } finally {
    abortScope.cleanup();
  }
}
