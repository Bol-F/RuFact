# Performance and N+1 audit

Audit reviewed on 2026-10-13. Measurements below are local checks, not production latency promises.

## Request shape and parallelism

There is no relational database/ORM N+1 in the current app. A source check makes one
Tavily search and one Gemini assessment, irrespective of the number of returned URLs
(up to six). Snippets come from the search response: the app does not fetch each
source page in a loop. Russian/English inference is a separate, parallel branch;
detected Uzbek skips it entirely. Tavily must finish before Gemini can use its evidence.

Redis is already used for distributed rate limits, Telegram preferences, leases,
temporary conversation state and delivery retries. Adding another Redis deployment
does not help image decoding. Images are public static files cached by the browser/CDN.

FastAPI loads both model artifacts once. Inference already runs outside the event
loop in a bounded thread pool, behind a semaphore. Adding workers duplicates model
memory and replay-protection state; adding threads did not improve the local CPU
benchmark. Keep the existing bounded concurrency until production load measurements
justify a change. Development reload watches only `ml/src`; browser tests run a
single ML process without a repository-wide watcher.

## Immutable model metadata

Previously each explanation rebuilt the whole feature-name array (60,000 words
for Russian; 20,939 for English) and the weighted coefficient slice. `ModelBundle`
now constructs owned, read-only arrays once. No user text, predictions or evidence
are retained in this cache; model artifacts and statistical outputs are unchanged.

Same-process, alternating local runs with the same pretrained artifacts and input,
20 repetitions per path, measured during the implementation:

| Input/model | Previous median | Cached median |
| --- | ---: | ---: |
| Russian, approximately 4,000 characters | 120.6 ms | 17.7 ms |
| English, approximately 5,000 characters | 43.6 ms | 17.6 ms |

These are inference timings on a development machine, not end-to-end API timings.
Regression tests compare the entire prediction JSON against the uncached reference,
verify metadata is built once, and exercise the existing two-thread execution.

## Telegram Redis batching

State is read once in a bounded five-key MGET after obtaining the conversation
lease. Delivery metadata writes are batched with MULTI, cleanup uses one DEL,
chat mode stays request-local, and independent ownership-checked lease releases
run concurrently. Redis transactions do not provide rollback on runtime errors;
delivery occurs only after the cache operation succeeds. Retries and cleanup
failures remain fail-safe; the completion marker precedes retry-cache deletion.

Native SDK mocked-transport tests (no real Redis or provider traffic) measure:

| Telegram core flow | Previous Redis HTTP round trips | Batched |
| --- | ---: | ---: |
| New source check | 18 | 9 |
| Existing chat turn | 22 | 12 |

The existing rate-limit operations are additional and unchanged. Privacy TTLs,
double completion checks, chat-mode migration and token-checked leases are retained.

## Language artwork

The previous hero changed its URL and regional styling before the next bitmap
finished loading. `HeroArtwork` retains the last decoded picture, decodes the
requested replacement asynchronously, then changes picture and regional metadata
together. Stale completions are ignored. Failed replacements keep the old picture
and show a retry control. The per-mounted-hero decoded-image map is bounded to
three public locales; it stores no user information.

Content-addressed WebP derivatives under `public/artwork` use immutable caching.
Each region has a 960px variant and a full-resolution variant, selected through
`picture`/`srcset`. Original files and attribution are retained. The Russian image
was 2,082,868 bytes; its derivatives are 131,070 bytes (960px) and 454,040 bytes
(full). Below 768px, the hero serves an inline transparent pixel and skips JavaScript
preloading, including after language switching. Decorative information-card images
are lazy-loaded and use the same phone media guard.

Regenerate with `npm run artwork:build`, update `lib/hero-artwork.ts` to the emitted
hash URLs, and run `npm run test:artwork`. Do not overwrite an immutable URL with
new bytes. The asset tests verify hashes, dimensions and transfer-size budgets.

## Bounded input and provider responses

Analysis JSON is capped at 24 KB, ML and Gemini response bodies at 128 KB, and Tavily
responses at 256 KB. Limits apply while reading bytes, not after unbounded `.text()`
allocation. Missing/deceptive Content-Length cannot bypass the cap. Over-limit,
malformed UTF-8, failed and aborted streams are cancelled and unlocked. Existing
rate limits, CSRF guards, strict schemas and request timeouts remain in force.

## Deliberately not cached

Shared web verdict/search/chat caching is not enabled: it would retain submitted
claims and could serve stale answers about changing facts. Introducing it requires
an explicit privacy/retention design and a freshness/invalidation policy. Current
optimisations cache public assets and immutable model metadata, or batch existing
short-lived Redis state without retaining additional content.

## Checks

```bash
npm run test:unit
npm run typecheck
npm run lint
npm run build
npm run test:ml
npm run test:e2e
```

Browser regressions cover gated slow downloads, delayed decoding, rapid language
changes, failure/retry recovery, phone-to-desktop resizing, image reuse, and preservation
of drafts/results. HTTP tests cover chunked body limits and guard ordering.
See [SECURITY.md](SECURITY.md) for the remaining dependency-advisory findings.
