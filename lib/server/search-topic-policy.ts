import { normalizeSearchTopic, type SearchTopic } from "../search-topics.ts";

// Ranking hints only: Tavily's prefer mode still searches outside these sites.
// Do not rewrite a claim, add a geographic restriction or assume a site is true.
const TOPIC_DOMAINS: Record<SearchTopic, readonly string[]> = {
  general: [],
  news: ["reuters.com", "apnews.com", "bbc.com"],
  sport: ["olympics.com", "fifa.com", "uefa.com"],
  health: ["who.int", "pubmed.ncbi.nlm.nih.gov", "cochranelibrary.com"],
  science: ["nature.com", "science.org", "pubmed.ncbi.nlm.nih.gov"],
  politics: ["gov.uz", "president.uz", "lex.uz", "un.org"],
};

const TOPIC_GUIDANCE: Record<SearchTopic, string> = {
  general: "",
  news: "Prefer original reporting and corroboration; distinguish the publication date from the event date and check whether updates supersede older reports.",
  sport: "Prefer the relevant federation, league or competition's official results and records. Check the competition, season, event date and time zone; do not infer one sport from an ambiguous question.",
  health: "Prefer relevant public-health guidance, systematic reviews and the actual studies. Distinguish association from causation and preliminary findings from established evidence. Do not diagnose or prescribe treatment.",
  science: "Prefer relevant research papers and scientific institutions. Distinguish peer-reviewed findings from preprints, hypotheses and a press release's interpretation; note material uncertainty.",
  politics: "Prefer relevant primary documents, legislation and dated records, and compare independent reporting. Distinguish an official position or allegation from independently established fact.",
};

export function preferredTopicDomains(topic: SearchTopic = "general", existing: readonly string[] = []) {
  const domains = TOPIC_DOMAINS[normalizeSearchTopic(topic)];
  return domains.length ? [...new Set([...existing, ...domains])] : existing;
}

export function searchTopicInstruction(topic: SearchTopic = "general") {
  const safeTopic = normalizeSearchTopic(topic);
  if (safeTopic === "general") return "";
  return `Optional research preference: ${safeTopic}. This is a source-selection hint, not a claim, fact or restriction. If the actual question concerns another subject, ignore the preference and answer that question. Never omit contradicting evidence, change a claim's meaning or force a verdict to fit the preference. ${TOPIC_GUIDANCE[safeTopic]}`;
}
