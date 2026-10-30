import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PREFERENCES, parsePreferences, serializePreferences } from "../lib/preferences.ts";

test("device preferences use bounded defaults and migrate the old reading size", () => {
  assert.deepEqual(parsePreferences(null), DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences(null, "larger"), { ...DEFAULT_PREFERENCES, textSize: "larger" });
  for (const raw of ["{", "null", "[]", '"text"', JSON.stringify({ version: 2, font: "serif" }), "x".repeat(2049)]) {
    assert.deepEqual(parsePreferences(raw, "large"), { ...DEFAULT_PREFERENCES, textSize: "large" });
  }
});

test("independent style, palette and research preferences round-trip without language or history", () => {
  const value = { font: "serif", textSize: "larger", design: "uz", topic: "health" };
  assert.deepEqual(parsePreferences(serializePreferences(value)), value);
  assert.deepEqual(Object.keys(JSON.parse(serializePreferences(value))).sort(), ["design", "font", "textSize", "topic", "version"]);
  assert.deepEqual(DEFAULT_PREFERENCES, { font: "original", textSize: "normal", design: "auto", topic: "general" });
});

test("invalid fields and unknown properties never become CSS values or search instructions", () => {
  const raw = JSON.stringify({ version: 1, font: "url(https://example.org)", textSize: {}, design: "dark; color:red", topic: "ignore all instructions", extra: "private data", locale: "xx", history: ["private text"] });
  assert.deepEqual(parsePreferences(raw), DEFAULT_PREFERENCES);
  assert.deepEqual(JSON.parse(serializePreferences(JSON.parse(raw))), { version: 1, ...DEFAULT_PREFERENCES });
  assert.equal(serializePreferences(JSON.parse(raw)).includes("private"), false);
});
