# Stitchr · Step 1

Describe a business, clarify the details that matter, compare existing tools, and confirm a planning stack.

This repository was empty at implementation time. The application uses the live Stitchr site's white, dark green, and lime identity. It does **not** connect vendor accounts, provision tools, build customer apps, or implement an owner dashboard. The future “Build my stack” action is visibly disabled and labeled “Coming in Step 2.”

## Run locally

Node.js 22+ and npm are required. Node.js 24 was used during implementation.

```bash
npm ci
cp .env.example .env.local
# Edit .env.local: DATABASE_URL, OPENAI_API_KEY, OPENAI_MODEL
# Start PostgreSQL, or use your Supabase PostgreSQL connection URL:
docker compose up -d
node --env-file=.env.local --import tsx scripts/migrate.ts
node --env-file=.env.local --import tsx scripts/seed.ts
npm run dev
```

Open http://localhost:3000. Next.js reads `.env.local`; database scripts accept ordinary environment variables or Node's `--env-file` option. Keep the database URL and OpenAI key on the server. Use your provider's required TLS configuration for a remote PostgreSQL connection, without disabling certificate verification.

### Local demo without credentials

PGlite is an embedded PostgreSQL runtime for local exploration and integration tests. It is an explicit development option, not a production database fallback. Do not run multiple processes against the same PGlite directory.

```bash
REGISTRY_DRIVER=pglite npm run db:migrate
REGISTRY_DRIVER=pglite npm run db:seed
REGISTRY_DRIVER=pglite REQUIREMENTS_MODE=demo npm run dev
```

This mode displays a banner and uses a **limited deterministic sample interpreter**, not an LLM. It handles the included business examples and basic numeric facts. Production mode uses OpenAI structured output and fails clearly if it is unavailable; it never silently substitutes the demo. A missing AI key does not generate fabricated recommendations.

A complete demo input:

> Cloud kitchen in the US, 1,000 orders per month, $35 average order, own drivers, one location, guest checkout, $1,000 software budget.

The user can keep unknown answers, edit the resulting specification, compare tools, and select a candidate manually when automatic confidence is insufficient.

## Local origin checks and workspace-root warning

The development server listens on `0.0.0.0`, but open the app at `http://localhost:3000`. API origin checks use the request's actual `Host` header (including its port), because Next.js can represent the internal request URL using the listener address. Requests from unrelated sites remain rejected; forwarded-host headers do not bypass this check.

For a reverse proxy that changes the public host or protocol, set `APP_ORIGIN` to the exact public origin, such as `https://stitchr.example`. Leave it unset for ordinary local development. Restart Next.js after changing environment variables.

The Next.js config explicitly sets `outputFileTracingRoot` to the project directory, so a `package-lock.json` in a parent folder does not change workspace-root inference. You do not need to delete that parent lockfile. See the [Next.js output configuration documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats).

## Architecture

Three backend components, within one Next.js application:

1. **Requirements Service** — `src/lib/requirements`. A stateless OpenAI Responses call interprets the supplied conversation and partial specification. Zod is the single output contract. The prompt separates known facts from inference and asks at most five material questions. No tool recommendations, prices, compatibility decisions, SQL, or credentials come from the model. OpenAI requests use `store: false`, a bounded input/output size, timeouts, and a bounded retry.
2. **Stack Engine** — `src/lib/stack` and `src/lib/pricing`. Deterministic template matching, capability merging, constraints, scoring, greedy stack selection, dependencies, confidence, validation, and arithmetic.
3. **Registry Database** — `src/lib/registry` and `migrations`. PostgreSQL with Drizzle's parameterized SQL interface. Query-time filtering retrieves relevant capability candidates and existing tools rather than loading all 156 products.

The React client implements idea entry → adaptive clarification → editable requirements → real request progress → recommendations/selection → confirmed planning stack. State is held in memory, with immutable snapshots for undo/redo. Refreshing the page starts a new conversation. Final selections and pricing snapshots are stored; raw conversations and business descriptions are not persisted by this app.

## Catalog and evidence

`data/catalog.json` is imported from the supplied **Stitchr Business Tool Catalog**, researched September 10, 2026. It contains:

- All **156 tools across 26 categories**, with stable slugs, original descriptions, price text, routes, proposed setup, constraints, and official reference URLs.
- The original document's SHA-256 and research date, retained for provenance.
- Every observed numerical price mention, its currency and source context. Unreviewed observations are explicitly non-executable and are also stored in `tool_price_observations`.
- Nine starting templates and 16 explicitly named proposed tool pairs normalized by `src/lib/registry/catalog.ts`.

```bash
python3 scripts/import_catalog.py /path/to/Stitchr_Business_Tool_Catalog.docx
```

The importer uses Python's standard library; Microsoft Word is unnecessary. Its expected 156-record assertion protects this particular initial catalog from incomplete extraction. For a new catalog edition, review/update that assertion and source date as part of the import change. Run the tests and inspect the diff before reseeding.

The seed is idempotent and inserts missing records. **It deliberately does not overwrite subsequently reviewed registry records.** To change existing prices or readiness, use a reviewed SQL migration; importing new prose must not silently replace tested integration evidence. For a new catalog edition, give the source a new ID and preserve older source rows.

### Discovery versus supported

The source explicitly says no accounts were connected and no end-to-end combinations were tested. Consequently **all initial tools are `RESEARCHED` discovery products**, and no seeded connection is verified or `SUPPORTED`. The system works as a planning tool, but the initial catalog cannot honestly produce a production-ready connection promise.

A connection's actual transport is `unknown` when the source names a proposed pair without establishing native/API/middleware behavior. API routes are populated only where the source establishes them. Missing scopes, operations, direction, retries, webhooks, idempotency and rate limits remain null/unknown. An API reference never establishes pairwise compatibility.

The seed does not infer commercial availability from a price locale. For example, Stripe's US pricing observation is not evidence of all supported countries; Shopify's ₹1,499 observation remains INR/India and is not converted into a US quote.

## Registry model

Relational tables:

| Table                                                        | Purpose                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `tools`, `capabilities`, `tool_capabilities`                 | Product identity and researched capabilities                                              |
| `tool_plans`, `pricing_rules`                                | Reviewed executable estimates and plan requirements                                       |
| `tool_price_observations`                                    | Non-executable numerical observations with source context                                 |
| `tool_regions`, `tool_limits`                                | Explicit availability and capacity evidence                                               |
| `tool_connections`, `connection_operations`                  | Named pairs, operations, direction, middleware, plan requirements, readiness and evidence |
| `stack_templates`, `template_capabilities`, `template_tools` | Starting business patterns                                                                |
| `tool_readiness`, `registry_sources`                         | Research, support status and provenance                                                   |
| `registry_revision`                                          | Database-triggered revision on factual changes                                            |
| `confirmed_stacks`                                           | Authoritative selections, price snapshots, warnings and architecture edges                |

Migrations are repeatable for local setup. Foreign keys and indexes maintain relational integrity. Production should use a least-privileged application database role; only maintainers should have registry mutation privileges. Do not expose these tables through a public Supabase client. This app uses server-side database access only.

## Recommendation logic

Templates match business types/models, including hybrids. Their defaults are merged with normalized explicit features. Explicit requirements win over template defaults/exclusions; unusual requirements remain visible as gaps. Multiple locations add `multi_location`; third-party delivery requires `third_party_delivery`, not a dispatch product masquerading as a delivery network.

Hard constraints exclude candidates: retired/restricted status, required support/readiness, mandatory no-code route, region availability, deployment mode, API/webhook evidence, digital-only business model exclusions, known usage limits, required exact integrations, and hard budget ceilings. A preference is not a mandatory constraint. If unknown costs prevent proving a hard budget, that candidate is excluded.

Candidates are ranked in stack context with these centrally configured weights:

| Factor                       | Weight |
| ---------------------------- | -----: |
| Requirement fit              |    30% |
| Existing stack compatibility |    20% |
| Connection confidence        |    15% |
| Cost efficiency              |    15% |
| Setup simplicity             |    10% |
| Scalability evidence         |     5% |
| Stitchr readiness            |     5% |

Scores and tie-breaking are deterministic. Weak candidates remain clearly labeled, and the optimizer does not automatically select scores below 60. Researched products are capped at 74; a high product fit cannot erase missing operational evidence.

Confidence: 90+ Strong Match, 75–89 Recommended, 60–74 Viable Alternative, below 60 Weak Match. Empty candidate sets are Requirement Gaps. Two alternatives are displayed whenever available, with an expandable list and a focused comparison dialog.

The optimizer is a deterministic greedy set-cover heuristic, not a claim of a globally optimal stack. It rewards combined capability coverage, retains existing products, discourages extra subscriptions, and counts a multi-role tool once. Sorted IDs break ties. Business flow edges determine which tool pairs require validation; there is no invented all-to-all compatibility matrix.

## Pricing

`src/lib/pricing/calculator.ts` supports fixed, seat, linked account, transaction, percentage, message, workflow, token, minute, progressive tier, minimum spend, range, and unknown formulas. Rates are never supplied by the LLM.

Only reviewed formulas from the catalog are executable. Other pricing remains original source text plus an unavailable/quote state. This is intentionally conservative: the imported starting subscription is not automatically an integration-capable plan, and unknown extras do not become $0.

The UI separates fixed software, usage, payments and optional charges. It shows a **known subtotal** whenever any cost is unresolved; the upper estimate is null rather than a fabricated cap. Annual equivalents retain their annual commitment label. Mixed currencies are never silently converted. No taxes, FX, refunds or unlisted add-ons are invented.

Example: 1,000 US domestic-card orders × $35 × 2.9% + 1,000 × $0.30 = **$1,315 in Stripe processing fees**, before additional services. This is independent of software subscriptions.

Editable assumptions include orders, successful transactions, messages, paid seats/editors, workflow runs, tokens, minutes, linked accounts and transaction value. Null means unknown; zero means an explicitly entered zero. Production products can have several usage meters; add each required meter before marking a price complete.

## Selection and validation

- **Immediate preview:** the browser recalculates known prices, capability coverage and graph checks from its payload.
- **Server revalidation:** changed tools and directly dependent neighbors are rechecked and their candidates reranked. Unrelated categories keep their rankings. Changes to usage assumptions re-evaluate eligibility. Response sequence IDs prevent a delayed response from overwriting newer choices. Revalidation errors preserve choices and disable confirmation.
- **Final confirmation:** one repeatable-read database transaction reloads current tools/plans/connections, checks coverage and all mandatory requirements, recomputes pricing and persists the authoritative result. Client totals and tool details are never accepted. Unknown tools and extra selection roles are rejected.

A changed registry revision returns HTTP 409 with new pricing and validation for review. Retirements or incompatible swaps block confirmation. Researched connections can be acknowledged for a **planning stack**, but mandatory verified integrations cannot be waived. `ready_to_connect` remains false while any verification warnings exist.

Undo, redo and reset use immutable snapshots. Downloading the final JSON plan includes the user's specification, server validation, price assumptions and architecture edges. There is no public endpoint exposing another user's confirmed stack.

## APIs

| Route                          | Input / output                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `POST /api/onboarding/analyze` | Conversation + optional partial spec → validated spec, clarification questions, complete flag, interpreter mode |
| `POST /api/stacks/recommend`   | BusinessSpec → capability categories, candidates, selected tools, prices, warnings and registry revision        |
| `POST /api/stacks/revalidate`  | Spec, previous/current selections, revision → affected categories, latest validations and prices                |
| `POST /api/stacks/confirm`     | Spec, selection, revision, uncertainty acknowledgment → saved planning stack or 409/422                         |
| `POST /api/events`             | Allowlisted event names and minimal numeric metadata                                                            |

Bodies and schema lengths are bounded, errors are sanitized, and browser origin mismatches are rejected. There is no vendor OAuth or key collection in Step 1. Before public production exposure, apply authenticated access or ingress rate limits/spending controls to the AI-backed endpoint. Authentication/billing infrastructure is deliberately outside this MVP.

## Observability

Lightweight structured logs record recommendation latency, matched templates, tool/warning counts, confirmation, failures and allowlisted UI events: start, description submission, clarification, requirements confirmation, generated stack, compare, tool changes, warnings, assumption edits, confirmation and drop-off. Business descriptions, question answers, keys and account credentials are excluded from analytics. Drop-off events are best effort via `sendBeacon`.

## Extending the registry

### Add a tool

Add a catalog-backed entry with a stable ID and source evidence; map only supported-in-source capabilities in `catalog.ts`. Unknown pricing gets a nullable base price and an explicit status. Add reviewed plans/rules as applicable. Seed new records. Keep readiness `RESEARCHED` until evidence supports promotion. For already existing records, write a reviewed migration rather than overwriting with prose.

### Add a connection

Create the exact pair and proposed transport; use `unknown` if not established. Record plan IDs, direction, middleware, authentication/scopes, required operations, webhooks/polling, quotas, recovery, constraints and source references as evidence becomes available. Test success, failure, permissions, replay and lifecycle changes before `TESTED`; only mark `SUPPORTED` when Stitchr owns ongoing maintenance. Include a regression test. Do not add a generic “both have APIs” connection.

### Add a template

Add a deterministic pattern in `src/lib/stack/templates.ts`: business types, default/optional capabilities, suggested tool pattern, confidence and readiness. Seed it into the relational template tables. Add a business scenario test. Tool preferences are contextual hints, not a requirement override, and `tested_connections` must remain empty until actual test evidence exists.

## Verification

```bash
npm test           # engine, PostgreSQL/API integration, and React interaction tests
npm run typecheck
npm run build
npm run smoke      # isolated production-server HTTP journey using explicit demo mode
npm audit --omit=dev
```

Tests cover the 17 requested business/edge scenarios, weighted scoring, hard exclusions, multi-role optimization, unknown prices, US payment arithmetic, tiers/minimums, graph direction, required middleware, tool swaps, final server authority, registry changes and AI failure behavior. UI tests exercise clarification, summary, comparison, selection, undo/redo, assumptions, server failure and final confirmation.

Visual/browser verification limitation: the provided cloud browser blocks localhost. The UI is responsive by CSS and is tested through React interactions and HTTP requests, but desktop/mobile screenshots and real browser layout checks must still be completed in a browser that can access the local app. Live OpenAI extraction requires an operator-provided key; no live model call or vendor connection was performed during implementation.

OpenAI structured-output reference: https://developers.openai.com/api/docs/guides/structured-outputs
