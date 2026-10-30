export const SEARCH_TOPICS = ["general", "news", "sport", "health", "science", "politics"] as const;

export type SearchTopic = (typeof SEARCH_TOPICS)[number];

export function isSearchTopic(value: unknown): value is SearchTopic {
  return typeof value === "string" && SEARCH_TOPICS.includes(value as SearchTopic);
}

export function normalizeSearchTopic(value: unknown): SearchTopic {
  return isSearchTopic(value) ? value : "general";
}
