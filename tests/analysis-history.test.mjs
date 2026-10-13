import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYSIS_HISTORY_RETENTION_DAYS,
  addAnalysisHistoryEntry,
  parseAnalysisHistory,
} from "../lib/analysis-history.ts";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");
const TIMESTAMP = new Date(NOW - 60_000).toISOString();
const empty = () => ({ version: 1, enabled: true, items: [] });
const input = () => ({ source: "user", status: "success", text: "2+2=5", label: "FAKE", confidence: 0,
  analyzedAt: TIMESTAMP, meta: { engine: "calculation", version: "arithmetic-v1" } });

test("compact history accepts a calculation without storing computed values or changing its timestamp", () => {
  const added = addAnalysisHistoryEntry(empty(), input(), NOW);
  assert.equal(added.ok, true);
  const item = added.value.items[0];
  assert.equal(item.analyzedAt, TIMESTAMP);
  assert.equal(item.confidence, 0);
  assert.equal(item.label, "FAKE");
  assert.deepEqual(item.meta, { engine: "calculation", version: "arithmetic-v1" });
  assert.deepEqual(Object.keys(item).sort(), ["analyzedAt", "confidence", "id", "label", "meta", "text"]);
  assert.equal(Object.hasOwn(item, "calculation"), false);
  const loaded = parseAnalysisHistory(JSON.stringify(added.value), NOW);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.value.items, [item]);
});

test("calculation entries respect disabled-history consent and the existing expiration period", () => {
  const disabled = addAnalysisHistoryEntry({ version: 1, enabled: false, items: [] }, input(), NOW);
  assert.equal(disabled.ok, true);
  assert.deepEqual(disabled.value.items, []);
  const added = addAnalysisHistoryEntry(empty(), input(), NOW);
  assert.equal(added.ok, true);
  const expired = parseAnalysisHistory(JSON.stringify(added.value), NOW + ANALYSIS_HISTORY_RETENTION_DAYS * 86_400_000);
  assert.equal(expired.ok, true);
  assert.deepEqual(expired.value.items, []);
  assert.equal(expired.changed, true);
});

test("stored calculations keep the exact complete equation and deduplicate only under existing normalization", () => {
  const added = addAnalysisHistoryEntry(empty(), { ...input(), text: " (1+2) / 3 = 1 " }, NOW);
  assert.equal(added.ok, true);
  assert.equal(added.value.items[0].text, "(1+2) / 3 = 1");
  const newer = new Date(NOW).toISOString();
  const repeated = addAnalysisHistoryEntry(added.value, { ...input(), text: "(1+2) / 3 = 1", analyzedAt: newer }, NOW);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.value.items.length, 1);
  assert.equal(repeated.value.items[0].id, added.value.items[0].id);
  assert.equal(repeated.value.items[0].analyzedAt, newer);
});

test("unknown engines and extra persisted calculation fields are still rejected", () => {
  assert.equal(addAnalysisHistoryEntry(empty(), { ...input(), meta: { engine: "invented", version: "v1" } }, NOW).ok, false);
  const added = addAnalysisHistoryEntry(empty(), input(), NOW);
  assert.equal(added.ok, true);
  const extra = { ...added.value, items: [{ ...added.value.items[0], calculation: { correct: true } }] };
  assert.equal(parseAnalysisHistory(JSON.stringify(extra), NOW).ok, false);
});
