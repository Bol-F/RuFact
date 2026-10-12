// Mechanical encoding only: preserve the existing compositions and alpha channel.
// Generated, content-addressed files are safe to cache immutably. Never overwrites originals.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const inputs = {
  ru: ["russian", "hero-collage.png"],
  uz: ["uzbek", "hero-uzbekistan-collage.webp"],
  en: ["english", "hero-united-kingdom-collage.webp"],
};
const output = new URL("../public/artwork/", import.meta.url);
await mkdir(output, { recursive: true });
for (const [locale, [name, original]] of Object.entries(inputs)) {
  const input = await readFile(new URL(`../public/${original}`, import.meta.url));
  const metadata = await sharp(input).metadata();
  const full = original.endsWith(".webp") ? input : await sharp(input).webp({ quality: 85, effort: 6 }).toBuffer();
  const small = await sharp(input).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toBuffer();
  const variants = [];
  for (const [size, bytes, width] of [["full", full, metadata.width], ["960", small, Math.min(960, metadata.width)]]) {
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const filename = `${name}-${digest}-${size}.webp`;
    await writeFile(new URL(filename, output), bytes);
    variants.push({ src: `/artwork/${filename}`, width, bytes: bytes.length });
  }
  console.log(JSON.stringify({ locale, originalBytes: input.length, height: metadata.height, variants }));
}
