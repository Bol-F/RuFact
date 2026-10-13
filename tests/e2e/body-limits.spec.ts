import { expect, test } from "@playwright/test";
import { request as httpRequest } from "node:http";

function postChunked(url: string, body: Buffer, extraHeaders: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST", headers: {
        "content-type": "application/json", "transfer-encoding": "chunked",
        "x-vercel-forwarded-for": `2001:db8:${process.pid.toString(16)}:c::1`, ...extraHeaders,
      },
    }, response => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 32_000) response.destroy(new Error("Unexpected oversized test response"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"), headers: response.headers }));
    });
    request.setTimeout(15_000, () => request.destroy(new Error("Local request timeout")));
    request.on("error", reject);
    for (let offset = 0; offset < body.length; offset += 2048) request.write(body.subarray(offset, offset + 2048));
    request.end();
  });
}

test("analyze caps chunked bytes before JSON parsing and preserves valid UTF-8 at the limit", async ({ baseURL }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "HTTP transport check once");
  const url = new URL("/api/analyze", baseURL).href;
  const json = Buffer.from(JSON.stringify({ text: "Бу хабар рост эмас.", useGemini: false, locale: "uz" }));
  const exact = Buffer.concat([json, Buffer.alloc(24_000 - json.length, 0x20)]);
  const oversized = await postChunked(url, Buffer.concat([exact, Buffer.from(" ")]));
  expect(oversized.status).toBe(413);
  expect(JSON.parse(oversized.body)).not.toHaveProperty("label");
  const valid = await postChunked(url, exact);
  expect(valid.status).toBe(200);
  expect(valid.headers["cache-control"]).toBe("private, no-store");
  expect(JSON.parse(valid.body)).toMatchObject({ label: "UNSURE", confidence: 0,
    meta: { engineVersion: "uzbek-source-only-v1", inputLanguage: "uz" } });
  const malformed = await postChunked(url, Buffer.from('{"text":'));
  expect(malformed.status).toBe(400);
  const invalidUtf8 = await postChunked(url, Buffer.concat([Buffer.from('{"text":"'), Buffer.from([0xff]), Buffer.from('","useGemini":false}') ]));
  expect(invalidUtf8.status).toBe(400);
  // Security checks still precede reading an oversized body.
  const crossSite = await postChunked(url, Buffer.concat([exact, Buffer.from(" ")]), { origin: "https://evil.example" });
  expect(crossSite.status).toBe(403);
});
