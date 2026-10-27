import { requestTavilyEvidence, type TavilyRequest } from "./tavily-search.ts";

// Official government/ministry pages and local news. These are retrieval
// preferences, never a truth allowlist. Do not add all of t.me: channel names
// alone do not establish official ownership.
const UZBEK_CHAT_DOMAINS = [
  "president.uz",
  "gov.uz",
  "lex.uz",
  "kun.uz",
  "daryo.uz",
] as const;

export function requestChatEvidence(request: Omit<TavilyRequest, "preferredDomains">) {
  return requestTavilyEvidence({
    ...request,
    // Chat locale is shared by the website and Telegram's /uz mode. Both
    // Latin and Cyrillic use the same policy; RU/EN and the analyzer keep
    // their existing unrestricted search.
    preferredDomains: (request.locale ?? "uz") === "uz" ? UZBEK_CHAT_DOMAINS : undefined,
  });
}
