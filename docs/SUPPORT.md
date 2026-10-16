# RuFact voluntary support

Implementation date: 16 October 2026. **Not deployed or enabled by this change.**
The `/support` page and existing [@RuFact_bot](https://t.me/RuFact_bot) offer
optional, one-time **50 / 100 / 250 Telegram Stars** support. Fact-checking and
AI chat remain free. No subscription, tax-deductibility, accuracy guarantee,
priority service or other paid entitlement is promised.

## Components and flow

```text
/support → POST /api/support/stars ─┐
                                  ├→ dedicated limits → pending Redis intent
/donate amount (same bot) ─────────┘                         ↓
                                              Telegram createInvoiceLink
                                                           ↓
                                                invoice URL (not payment)
                                                           ↓
Telegram pre_checkout_query → secret webhook → atomic payer/query reservation
                                                           ↓
                                              answerPreCheckoutQuery
                                                           ↓
Telegram successful_payment → secret webhook → validate approved intent
                                              + unique charge → paid receipt
                                                           ↓
                                              localized bot thank-you
```

The website has no authenticated Telegram identity. Its invoice is bound to the
first valid payer at pre-checkout. A bot-created invoice is bound to that bot
user immediately. Invoice links can be forwarded; the server therefore enforces
one payer/query and one payment per intent. Browser return URLs, query parameters,
button clicks and client-reported payment statuses are never evidence of payment.
The frontend displays **invoice ready**, never **payment successful**.

`createInvoiceLink` uses `currency: "XTR"`, `provider_token: ""`, exactly one
price and no subscription/tips/shipping fields, as specified by the
[official Bot API](https://core.telegram.org/bots/api#createinvoicelink).
Pre-checkout must be answered within **10 seconds of Telegram sending it**;
Redis is capped at 2.5 seconds and the answer request at 3 seconds, with no
automatic provider retries. Network delivery and cold starts also consume that
deadline. A 60-second webhook function duration does not extend Telegram's limit.
See [answerPreCheckoutQuery](https://core.telegram.org/bots/api#answerprecheckoutquery).

## Files

| Area | Files |
| --- | --- |
| Page and presentation | `app/support/page.tsx`, `app/support/support.css`, `components/SupportPageContent.tsx` |
| Localization and navigation | `lib/support-copy.ts`, `lib/i18n.ts`, `components/Header.tsx`, `components/Footer.tsx` |
| Website boundary | `app/api/support/stars/route.ts`, `lib/server/support-http.ts` |
| Shared amounts and configuration types | `lib/support.ts` |
| Payment engine, transport and persistence | `lib/server/support-core.ts`, `lib/server/support-store.ts`, `lib/server/support.ts` |
| Bot integration | `lib/server/telegram-core.ts`, `telegram-ui.ts`, `telegram.ts`, `app/api/telegram/webhook/route.ts`, `scripts/setup-telegram.mjs`, `scripts/telegram-commands.mjs` |
| Abuse protection | `lib/server/rate-limit.ts` |
| Tests | `tests/support.test.mjs`, `tests/support-api.test.mjs`, `tests/support-telegram.test.mjs`, `tests/e2e/support.spec.ts` |
| Configuration and commands | `.env.example`, `package.json`, `playwright.config.ts` |
| Documentation | `README.md`, `docs/TELEGRAM.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, this document |

## Server-only environment variables

Never prefix these variables with `NEXT_PUBLIC_`, commit their values, expose
them in exception output, or paste them into chats.

| Variable | Default / requirement |
| --- | --- |
| `SUPPORT_STARS_ENABLED` | `false`; only exact `true` permits new invoices after all readiness checks |
| `SUPPORT_WALLET_ENABLED` | `false`; reserved, even `true` cannot activate Wallet in this implementation |
| `SUPPORT_CONTACT_URL` | A real, monitored HTTPS payment-help contact; required before enabling Stars |
| `SUPPORT_RATE_LIMIT_MAX` | `5` invoice attempts per client/window |
| `SUPPORT_RATE_LIMIT_WINDOW_SECONDS` | `600` seconds |
| `SUPPORT_DAILY_LIMIT` | `100` invoice attempts/day shared by web and bot, not a limit on Stars donated |
| `TELEGRAM_BOT_TOKEN` | Existing bot token; no second bot or payment-provider token needed |
| `TELEGRAM_WEBHOOK_SECRET` | Existing independent random 32–256-character secret matching the setup script |
| `TELEGRAM_WEB_APP_URL` | Existing public HTTPS website origin, e.g. `https://rufact.vercel.app` |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Existing read/write Redis REST credentials; `KV_REST_API_URL` + `KV_REST_API_TOKEN` aliases are accepted |
| `RATE_LIMIT_HASH_SECRET` | Existing independent random secret of at least 32 characters |
| `RATE_LIMIT_NAMESPACE` | Existing stable deployment namespace, normally `rufact`; isolate staging from production |

The support feature requires Redis even in development: **no in-memory financial
fallback**. A read-only Redis token is insufficient. Gemini, Tavily and the ML
API are not involved in payments and their quotas do not gate confirmations.
Keep Production and Preview secrets isolated. Page availability is read on the
server per request; provider tokens and financial records are never serialized
into page props. Enable flags only in an owner-approved deployment environment.

## Transaction model and retention

Redis key prefix is `<namespace>:support:<SHA256(bot-numeric-ID)[0:16]>:`. It is
stable across token rotation for the same bot; changing bot/namespace/Redis
database without migrating outstanding records can break reconciliation.

- `transaction:<reference>`: 192-bit cryptographically random reference;
  allowed amount, `XTR`, locale, created/expiry timestamps and status.
- `pending`: usable for **15 minutes**, deleted after **24 hours**. Failed
  invoice creation can leave an inaccessible pending intent until expiry; no
  charge is assumed and provider calls are not blindly retried.
- `approved`: atomically bound payer ID, pre-checkout query ID, approval time;
  retained for **90 days** to recognize delayed confirmed payments.
- `paid`: same record plus Telegram charge ID, paid time and bounded thank-you
  delivery lease/completion marker; retained for **90 days from first receipt**.
  Retries do not extend this TTL. The checkout query ID is removed on payment.
- `charge:<SHA256(charge-ID)>`: uniqueness index pointing at the reference,
  retained for the same **90 days**. It changes atomically with the paid record.

Payer IDs are decimal strings at rest, avoiding Lua `cjson` numeric rounding of
Telegram's up-to-52-bit identifiers. They are retained only because legitimate
payment matching and refunds require them. No names, usernames, card data,
addresses, emails, phone numbers or fact-check/chat content are in these records.
Provider-specific charge IDs are not retained. Financial references are not
stored in browser localStorage/sessionStorage or public analytics.

`/forget` removes conversation/preferences, **not these receipts**. The 90-day
engineering retention is not legal advice or a compliance determination. Before
activation, the owner must verify applicable accounting/refund/privacy periods,
set up secure backups/access controls and ensure records remain available for
all required obligations. If longer retention is required, review the constants
and documentation before accepting payments. Redis loss/eviction is not a
substitute for a reviewed financial backup/reconciliation procedure.

## Security, retries and failures

- Same-origin JSON-only website boundary, exact amount/locale allowlist, no
  additional keys, 1024-byte streamed body cap and three-second body-read deadline.
- HMAC IP identity for web and verified Telegram identity for bot. Separate
  sliding invoice limits and shared fixed-window daily budget; no AI quota use.
  Production rate-limit timeouts/Redis errors fail closed.
- Existing constant-time webhook secret check occurs before body parsing.
  Payment updates are dispatched before ordinary message/AI budgets. Malformed
  payment messages cannot fall through to text analysis.
- Lua transitions verify intent, expected amount/currency, payer, prior approval
  and unique charge, atomically. No browser-supplied identity or success status.
- Turning Stars off rejects new invoices/pre-checkout but **still processes
  already approved successful payments**. Do not remove bot/Redis credentials
  just to disable new acceptance.
- Duplicate receipt deliveries are idempotent. Thank-you delivery is leased and
  retryable. A crash/ambiguous timeout after Telegram accepts a message may
  duplicate a thank-you; the system does not claim exactly-once messaging.
- Known invalid/expired invoices receive a localized pre-checkout refusal.
  Redis failure refuses checkout rather than accepting unverifiable payments.
  Cancelling Telegram checkout is not a payment confirmation. A reserved invoice
  is single-use; after cancellation/failure, request a fresh invoice rather than
  expecting a second checkout query on the old link to be accepted.
  Redis/provider failures during confirmation return webhook `503` for retry.
  A structurally valid but unmatched/wrong-amount/wrong-currency receipt also
  returns `503`: **inspect and reconcile it**, never mark it paid or discard the
  update just to clear the queue. Invalid envelopes/unsupported updates are
  safely acknowledged without crediting anything.
- No public admin, refund or receipt-status endpoints. No provider payloads,
  secret URLs or financial IDs are logged. Use aggregate HTTP status/error-rate
  monitoring and restricted Telegram/Redis operations for investigation.

Rate limiting is not complete DDoS protection. Keep existing platform/WAF rules,
provider quotas and alerts. Monitor `/api/support/stars` and webhook 503 rates,
Telegram pending updates and Redis availability/eviction/backup health.

## Owner activation checklist (manual; not performed by this implementation)

1. Review Telegram's current [Stars payment guide](https://core.telegram.org/bots/payments-stars)
   and developer terms. Confirm this voluntary-support use case is permitted,
   provider/owner age and regional eligibility, tax/privacy obligations and
   applicable Uzbekistan restrictions. Obtain qualified local advice where
   needed; the code does not determine eligibility or bypass provider checks.
2. Establish a genuine monitored `SUPPORT_CONTACT_URL` and a payment/refund policy.
   Verify `/paysupport` reaches a person who can investigate and refund. Do not
   use a dead address, generic public issue thread or the bot itself without a
   working support handler. `/terms` and the Support page are notices, not a
   substitute for owner-approved legal/payment policies.
3. Review Redis retention, no-eviction/durability policy, backup and restricted
   access. Keep production and staging namespaces separate. Do not rotate the
   namespace while outstanding payments exist. Rotate any previously exposed
   credentials through their providers; never commit them.
4. Run the automated mocked checks below. In a separate, owner-approved Telegram
   **test environment**, register the equivalent test webhook and use isolated
   Redis. Verify actual Lua execution, invoice opening, pre-checkout round-trip
   latency (including cold starts), confirmation, cancellation, expiry, wrong
   payer, duplicate delivery and refund behavior with test Stars only. The test
   environment uses Telegram's documented test endpoint; this production adapter
   is intentionally fixed to the normal Bot API and has no public endpoint toggle.
   Use a separately reviewed test-only adapter/configuration in that isolated
   environment, not a production token or real financial transaction.
5. Obtain explicit permission to deploy. Publish code with
   `SUPPORT_STARS_ENABLED=false` and `SUPPORT_WALLET_ENABLED=false`. Set real,
   server-only environment values on Vercel. Confirm the Support page is readable
   and honestly disabled on desktop/mobile in all three languages.
6. After that deployment, with matching secure local env values, run:

   ```bash
   npm run telegram:setup -- register
   npm run telegram:setup -- status
   ```

   The updated script registers localized commands plus
   `allowed_updates: ["message", "pre_checkout_query"]`; successful payments
   arrive inside `message`. It does not drop pending updates. Check `/start`,
   `/chat`, `/check`, `/new`, `/stop`, `/uz`, `/ru`, `/en`, `/privacy`, `/forget`,
   `/donate`, `/terms` and `/paysupport` while Stars are still disabled.
   The command menu follows Telegram's client language (`uz/ru/en`, Uzbek
   fallback), independently of the response language saved by `/uz`, `/ru`, `/en`.
7. Only after the preceding checks and **separate owner approval**, set
   `SUPPORT_STARS_ENABLED=true` for the intended environment and redeploy. Do not
   enable Preview unintentionally. All readiness guards must pass. Wallet stays
   false. Monitor first usage; do not conduct a live payment test without
   separate approval from its payer/project owner.
8. To pause acceptance, set Stars false and redeploy, retaining bot credentials,
   webhook subscription, Redis and receipts for delayed confirmations/refunds.
   Avoid rolling back to a webhook version that ignores payment updates while
   outstanding transactions exist.

## Payment help, reconciliation and manual refunds

### Non-payment Redis diagnostic

`npm run check:support` skips without explicit network opt-in. To verify the actual
Redis Lua transitions with configured local REST credentials, an operator may run:

```bash
npm run check:support -- --live-redis
```

This creates three synthetic records under a fresh random `support-diagnostic`
namespace, caps their TTLs at five minutes, and deletes only the five enumerated
diagnostic keys afterwards. It checks approval, 52-bit payer identifiers, wrong
amount/payer rejection, duplicate receipts and thank-you leases. It never calls
Telegram, creates an invoice, sends a message or processes a real payment. Output
contains only status, check count and cleanup status; credentials are not printed.
An incomplete cleanup is a failure; short TTLs bound the leftover synthetic data.

Use a separately configured staging database for isolation when available. A pass
only verifies the database selected by that process's environment; it does not
prove production secrets match, credential rotation, provider eligibility, real
checkout/refunds, or Telegram's ten-second pre-checkout deadline. Keep the owner
activation checklist above. Do not enable payments with exposed Redis credentials.

### Operator refund procedure

Telegram requires bots to answer `/paysupport`; the operator, not Telegram, handles
legitimate disputes. See the [official dispute/refund guidance](https://core.telegram.org/bots/payments-stars#q-how-are-disputes-handled).

1. Receive the request through the configured private support channel. Ask for
   the minimum information necessary; never ask for card data, passwords or bot
   tokens, or publish transaction identifiers in public issues.
2. An authorized operator checks the existing bot's Telegram Stars transaction
   history and restricted Redis receipt (payer ID, amount, Telegram charge ID).
   Reconcile unmatched webhook events against Telegram's authoritative payment
   history. Do not invent a paid receipt or change money state from a browser.
3. For an approved refund, use the official server-to-server
   [`refundStarPayment`](https://core.telegram.org/bots/api#refundstarpayment)
   with `user_id` and `telegram_payment_charge_id`, using secure operator tooling
   and the same bot. No public endpoint/script in this change can issue refunds.
4. Check the API result/Telegram history and keep the restricted refund/accounting
   record according to the reviewed policy. Never tell a user a refund succeeded
   just because it was requested. This minimal app does not implement a refund
   ledger/admin UI or automatic refund-event reconciliation.

## Automated verification (no real payments)

```bash
npm run typecheck
npm run lint
npm run test:telegram
npm run test:support
npm run test:unit
npm run check:secrets
npm run build
npm run test:e2e -- tests/e2e/support.spec.ts
```

Tests inject/mock Telegram and payment stores. They cover exact amounts, all
locales, strict bodies/origins/unsafe URLs, missing config, provider errors,
Redis errors, pre-checkout validation/reservation, duplicate/replayed/concurrent
success, delayed confirmations after disablement, 52-bit ID representation and
existing bot commands. Redis adapter tests validate its script contract but do
**not execute real Lua**; staging integration remains an activation prerequisite.

An optional browser-only enabled fixture uses **fake** bot/Redis configuration
and intercepts invoice POSTs; it never creates actual invoices:

```powershell
$env:SUPPORT_STARS_E2E='1'
$env:PLAYWRIGHT_PORT='3013'
npm run test:e2e -- tests/e2e/support.spec.ts
Remove-Item Env:SUPPORT_STARS_E2E
Remove-Item Env:PLAYWRIGHT_PORT
```

Do not use the fixture against production or with `PLAYWRIGHT_USE_START=1`.
Regular browser tests force both payment flags off. The fixture is defined only
in Playwright configuration and cannot be activated through a public request.

## Telegram Wallet / TON: deliberately unavailable

Stars (`XTR`) are a Telegram payment unit, **not TON and not a cryptocurrency
checkout**. Wallet Pay is a separate future provider. This change adds no crypto
addresses, transactions, signatures, keys or deposit instructions. The public
availability type is `walletEnabled: false`; changing its env flag alone cannot
enable a missing provider.

Any future integration needs separate design/review and owner approval, current
provider eligibility/age/region checks, independent confirmation of applicable
Uzbekistan law, provider terms, AML/KYC/tax/privacy and refund requirements where
relevant, secure webhook/authentication/signature validation, storage and tests.
Until then, present it only as unavailable. This document is an engineering
checklist, not a legal determination that any payment use is permitted.
