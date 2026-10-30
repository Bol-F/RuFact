# Source-grounded AI chat

Web: `/chat`. Telegram: `/chat` or the localized AI chat keyboard button. Chat explains news, claims and sources; it is not a measured classifier or a guarantee of truth. `/check` and ordinary Telegram messages outside chat mode still perform claim assessment.

Whole supported arithmetic equations use the same exact bounded calculator as
text checking, before provider availability and internet-budget checks. For example,
`2+2=5` explains that both sides differ and gives `2+2 = 4`. Local calculation
replies have no source URLs or probability; mixed prose and unsupported mathematics
continue through the usual source-grounded workflow. General request limits remain.

## Configuration and quotas

No new provider key is needed. Both surfaces require server-only `GEMINI_API_KEY`, the existing allowlisted `GEMINI_MODEL`, `GEMINI_REVIEW_ENABLED=true`, and `TAVILY_API_KEY`. Production additionally requires Redis REST credentials and `RATE_LIMIT_HASH_SECRET`. Telegram uses its existing token and webhook secret. Never expose secrets with `NEXT_PUBLIC_`.

The installed AI SDK Google adapter uses the configured Gemini key directly; no extra paid service is introduced. Factual questions perform one basic Tavily search and one bounded Gemini generation. Whole-message greetings, introductions, thanks and basic app help are answered locally with no search, citations or provider charge. Chat shares the existing per-client/user limits and global daily provider budget: defaults are 5 internet requests per 5 minutes and 30 daily across website and bot. Provider free-tier quotas also apply independently. Continuing a conversation does not bypass those limits; quota failures keep the conversation available for later.

## Uzbek source priority

Uzbek web chat and Telegram `/uz` chat prefer `president.uz`, `gov.uz`
(government and ministry pages), `lex.uz`, `kun.uz` and `daryo.uz`.
Both Latin and Cyrillic questions use this policy. The fixed server-owned list
uses Tavily's `include_domains_mode: "prefer"`, so the same request also searches
the wider web. It is not a restricted Uzbekistan-only search and does not add
per-site requests, retries, keys or environment variables. RU/EN chat and the
statement analyzer retain their existing search policy.

The prompt still requires relevant, current evidence, prioritises primary
documents over summaries and surfaces unresolved conflicts. Preferred sites
are not a guarantee of truth. Arbitrary Telegram channels are not treated as
official; private/unindexed posts are not searched. Official ministry websites
provide the primary route to their published announcements.

Reference: [Tavily domain preferences](https://docs.tavily.com/documentation/api-reference/endpoint/search#body-include-domains-mode).

## Data and safety

- Device-local `/profile` preferences include an optional default search topic: General, News, Sport, Health, Science or Politics. A compact selector can override it for one check or chat turn without changing the saved default. The browser sends only a validated enum; malformed API values return 400. Topic hints favour relevant domains using Tavily `prefer` and add evidence-handling guidance to Gemini. Query text, rate limits, model selection and the one-search budget stay unchanged. General preserves the previous behaviour; Telegram uses General by default. Topics do not establish truth, remove conflicting evidence or restrict the rest of the web.
- The header profile panel preserves the current conversation and unsent draft. Interface language, reading style/size and palette live there, alongside the Telegram bot link and local check-history controls. Preferences have no login or cross-device sync and fall back to memory when browser storage is blocked.

- Web chat is reachable from the homepage, desktop navigation and a visible mobile header button. The viewport-height workspace keeps the composer available; sources are expandable and citation numbers link directly to retrieved pages. Enter sends on desktop; Shift+Enter inserts a line. Mobile Enter inserts a line.
- Web conversation uses versioned, bounded `sessionStorage` for this browser tab. Refreshing, navigating away and returning, or changing language preserves completed messages. Up to 30 exchanges remain visible; only three exchanges plus the current question are sent as context. New conversation or End chat clears the transcript. Normal tab closure clears session storage; a browser's session-restoration feature may restore it, so use End chat on shared devices. Storage failures fall back to memory without preventing chat. In-flight requests and unsent drafts are not persisted.
- Telegram stores up to three exchanges under hashed identities in Redis, expiring after 30 minutes of inactivity. Its separate chat-mode preference has no expiry and is removed by `/stop`, `/check` or `/forget`. `/new` clears context and keeps chat active; `/stop` ends chat and clears context. Expiring conversation text never silently switches back to fact checking. Telegram retains messages under its own policies. Delivery-retry caches can last 48 hours.
- Questions are capped at 2000 characters. Only alternating user/assistant text is accepted, never system messages, tool calls, attachments or provider settings. Total context is capped at 10,000 characters and JSON at 32,000 bytes.
- Tavily receives the latest factual question, with recent factual context only for short dependent follow-ups. Greetings do not pollute search queries. Gemini receives short context and untrusted retrieved snippets. Do not submit confidential data.
- Source URLs come only from search results and are filtered to credential-free HTTPS links. React renders AI text as text; Telegram uses escaped HTML. Links do not prove that every generated statement is supported.
- Missing evidence or provider errors produce an unavailable response, not a fabricated verdict. Provider exceptions are not logged or returned with secrets. Requests are time-bounded; model retries are disabled to conserve quotas.
- Telegram conversation leases serialize messages. Deduplication and cached replies avoid another generation on normal delivery retries, but crashes can still lead to duplicate transport delivery.

## Verification

The dependency check on 11 October 2026 found existing advisories outside the new AI packages. Next.js was patched to 16.3.8 and `source-map-js` updated. Eight audit entries remain in the `braces`/lint and `sprintf-js`/Mammoth dependency chains; automatic force-fixes propose incompatible downgrades, so they were not applied. This feature is not a certification that the entire repository is vulnerability-free.

```bash
npm run test:chat
npm run test:telegram
npm run typecheck
npm run lint
npm run build
npm run test:e2e -- tests/e2e/chat.spec.ts
```

Browser tests mock replies to verify layout, language changes without context loss, refresh persistence, source expansion, follow-ups, escaping, cancellation, explicit exits and quota recovery without spending provider quota. The real API greeting test needs no Gemini configuration. Separately test one real factual question after deployment and inspect its sources. Run `npm run telegram:setup -- register` after deployment to update commands, then test `/chat`, a greeting, a question, a follow-up, `/new` and `/stop` in Telegram.
