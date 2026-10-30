"use client";

import { useId } from "react";
import { SEARCH_TOPICS, type SearchTopic } from "@/lib/search-topics";
import { topicCopy } from "@/lib/topic-copy";
import { useLanguage } from "./LanguageProvider";

export function TopicControl({ value, onChange, disabled = false }: { value: SearchTopic; onChange: (topic: SearchTopic) => void; disabled?: boolean }) {
  const id = useId();
  const { locale } = useLanguage();
  const copy = topicCopy[locale];
  return <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
    <label htmlFor={id} className="shrink-0 font-semibold">{copy.label}</label>
    <select id={id} data-topic-control value={value} onChange={event => onChange(event.target.value as SearchTopic)} disabled={disabled} title={copy.hint}
      className="focus-ring min-h-11 min-w-0 max-w-full rounded-xl border border-[var(--region-border,#d9d7d1)] bg-white/80 px-3 py-2 text-sm text-ink disabled:opacity-50">
      {SEARCH_TOPICS.map(topic => <option key={topic} value={topic}>{copy[topic]}</option>)}
    </select>
  </div>;
}
