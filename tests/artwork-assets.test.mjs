import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { HERO_ARTWORK, artworkSrcSet, HIDDEN_ARTWORK_PIXEL } from "../lib/hero-artwork.ts";

test("immutable artwork URLs match their bytes, dimensions and responsive variants", async () => {
  for (const [locale, artwork] of Object.entries(HERO_ARTWORK)) {
    for (const [path, expectedWidth] of [[artwork.src, artwork.width], [artwork.small, 960]]) {
      const match = path.match(/^\/artwork\/(?:russian|uzbek|english)-([a-f0-9]{12})-(?:full|960)\.webp$/);
      assert.ok(match, path);
      const bytes = await readFile(new URL(`../public${path}`, import.meta.url));
      assert.equal(createHash("sha256").update(bytes).digest("hex").slice(0, 12), match[1]);
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, expectedWidth);
      assert.equal(metadata.height, Math.round(artwork.height * expectedWidth / artwork.width));
      assert.ok(bytes.length < 500_000);
    }
    assert.equal(artworkSrcSet(locale), `${artwork.small} 960w, ${artwork.src} ${artwork.width}w`);
  }
  assert.match(HIDDEN_ARTWORK_PIXEL, /^data:image\/gif;base64,/);
});

test("Russian hero derivative reduces transfer bytes without discarding the original", async () => {
  const original = await readFile(new URL("../public/hero-collage.png", import.meta.url));
  const small = await readFile(new URL(`../public${HERO_ARTWORK.ru.small}`, import.meta.url));
  const full = await readFile(new URL(`../public${HERO_ARTWORK.ru.src}`, import.meta.url));
  assert.ok(small.length < original.length * 0.1);
  assert.ok(full.length < original.length * 0.25);
});
