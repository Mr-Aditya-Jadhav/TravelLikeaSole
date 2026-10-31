# TravelLikeaSole

**Find your current. Travel your way.**

A working travel-planning app with a React/TypeScript interface, a Node.js server, SQLite storage, and five independent TinyFish integrations. The [product specification](./TravelLikeaSole.md) remains the design reference.

## Start the app

Use **Node.js 24**, or Node.js 22.18+ with native TypeScript and `node:sqlite` support.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. Keep the same hostname when returning to saved trips: browser cookies distinguish `localhost` from `127.0.0.1`.

The server reads `TINYFISH_API_KEY` from its environment or a project `.env` file. If the key is already exported, no `.env` file is needed. Otherwise copy `.env.example` to `.env` and enter your key locally. Never put a key in chat, a `VITE_` variable, browser storage, or committed source.

```sh
npm run build          # Frontend/server type checks and production frontend build
npm start              # Serve the built app and backend on the same origin
npm test               # Deterministic unit, HTTP, adapter, and lifecycle tests
npm run test:live      # Real Search and Fetch checks
npm run test:live -- --all           # Metered checks for all five APIs
npm run test:live -- --only=Browser  # Check a single capability
npm run test:live -- --workflow     # Test a running app through research/save/lock
npm run expire-watches # One-shot maintenance for an external scheduler
```

Live Browser/Agent tests consume TinyFish credits. The `--all` Monitor test creates a temporary daily monitor, pauses it immediately, captures one manual check, and deletes that specific monitor in `finally`; the baseline and manual check are about $0.01. It does not touch existing account monitors. `--workflow` requires the app server, makes real research requests, and removes only its own test trip after success. Ordinary `npm test` uses temporary databases and provider fixtures, with no paid provider requests.

## What works

- Destination discovery, visual preferences, exact dates or flexible duration, party size, explicit room count, currency, budget basis, and optional arrival/departure times.
- Real server research with persisted progress, cancellation, reconnection after refresh, request deduplication, bounded concurrency, and restart recovery using saved provider IDs.
- Source records with links, retrieval times, provider attribution, candidates, useful partial results, and visible verification gaps.
- Personalized day plans, downtime, arrival/departure buffers, non-repeating visits, supported opening/closing-time checks, closed-weekday checks, date-specific event filtering, and known-cost budget checks.
- Server-side activity locking, swapping researched alternatives, quieter days, and reducing cost where a comparable, observed cheaper alternative exists. Version checks prevent stale edits from overwriting newer changes.
- Stay, transport, event, and attraction shortlists, plus source/detail and map handoffs. Bookings remain on provider sites.
- Secure trip saving tied to the current browser’s anonymous session. Reusable travel style remains a separate, explicit browser-local opt-in.
- Opt-in page/topic watches with baseline capture, manual checks, pause/resume/stop, change review, duplicate suppression, expiration, and server restart recovery.
- Exportable plans including source URLs, timestamps, and verification notes.

## The five integrations

The recommendation engine now combines **BM25 relevance, weighted practical fit, MMR diversification, and bounded beam search**. Use **Improve recommendations** on an existing researched trip to apply it without starting another TinyFish run. Locked items stay fixed. Each activity exposes **Why Sole picked this** with concrete reasons and outstanding caveats. See [ranking design and parameters](docs/ranking.md).

| API     | Real implementation                                                                   | User-visible result                                                                                                      |
| ------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Search  | `GET https://api.search.tinyfish.ai` with focused category queries                    | Leads for attractions, food, stays, transport, and culture                                                               |
| Fetch   | Batched `POST https://api.fetch.tinyfish.ai`, up to 10 URLs, `ttl: 0`                 | Extracted facts, page text, and evidence records                                                                         |
| Agent   | `POST /v1/automation/run-async`, followed by `GET /v1/runs/{id}`                      | Adaptive navigation through up to three public venue/experience detail pages, schema-validated records                   |
| Browser | Separate remote Browser session, Playwright CDP control, explicit session termination | Booking.com comparison with real sort interaction and confirmed destination, dates, adult occupancy, rooms, and currency |
| Monitor | Create baseline, lifecycle PATCH, run-now checks, webhook ingestion                   | Relevant changes and review history after explicit opt-in                                                                |

The Browser workflow is independent of Agent’s internal browser. Flexible-date and same-day trips skip date-specific room comparisons with an explicit explanation. Broad guide pages remain evidence rather than invented individual attractions. A provider’s `COMPLETED` state is not treated as extraction success without usable validated output.

Current official contracts: [Search](https://docs.tinyfish.ai/search-api), [Fetch](https://docs.tinyfish.ai/fetch-api), [Agent](https://docs.tinyfish.ai/agent-api/reference), [Browser](https://docs.tinyfish.ai/browser-api/reference), [Monitor](https://docs.tinyfish.ai/monitor/api-reference).

## Monitoring locally and on a public server

Each check, including the initial baseline, is billed by TinyFish (currently $0.005/check). The watch dialog shows the schedule, cost, and expiration before consent. Manual checks cost extra.

**Local mode:** leave `PUBLIC_APP_URL` empty. The application creates a real Monitor, captures the baseline, and immediately pauses its provider schedule. The Node server runs due manual checks and stores the returned results itself. This avoids an unreachable localhost webhook and duplicate scheduled billing. Keep the server running for local checks; due checks resume after restart. When the server is off, the provider schedule remains paused.

**Public HTTPS mode:** set `PUBLIC_APP_URL` to the app’s externally reachable HTTPS origin. TinyFish uses its provider schedule and posts to a per-watch webhook with a random, unguessable capability token. The application validates that token and the expected provider monitor ID, deduplicates run IDs, and filters unchanged/irrelevant updates. Monitor does not document signed webhook payloads; this protected ingress is an application design, not a claim of provider signature verification. The normal API never returns webhook tokens or remote CDP URLs.

A daily public schedule runs at 09:00 UTC; the six-hour schedule runs at 00:00, 06:00, 12:00, and 18:00 UTC. Local checks run at the selected interval after creation. Manual run-now responses are ingested directly: TinyFish does not send a webhook for manual checks.

The server checks expiration every 30 seconds and pauses expired provider monitors. Deploy it as an always-running service. For additional recovery, schedule `npm run expire-watches` against the same environment and persistent database every minute. A stopped/offline public deployment cannot enforce a third-party schedule’s expiry until a maintenance process can reach TinyFish again. Stop pauses the provider while preserving the in-app history; the disposable live test is the only automatic provider-monitor deletion.

## Storage, ownership, and deployment

SQLite initializes automatically under `.data/sole.sqlite`; schema creation/versioning lives in `server/store.ts`. The data directory and `.env` are ignored by Git. Use a persistent disk and back up the database for production. Run one application instance against this database; a multi-instance queue/monitor deployment needs shared leasing infrastructure.

Trips and watches are scoped to an anonymous, random HttpOnly/SameSite cookie; the server stores its hash. Cookies are Secure when `NODE_ENV=production`. Sessions last 90 days. Clearing the cookie loses access to that session’s saved trips. Account login, account recovery, and cross-device synchronization are not implemented.

Research necessarily stores trip inputs for its durable job. Unsaved research trips expire after 24 hours unless an active watch still needs them. Choosing Save preserves the trip. Profile normalization is deterministic and hash-cached; selected values remain authoritative. No general LLM credential is required, and TinyFish Agent is not used as a profile-inference service. Arbitrary free-text restrictions require direct confirmation; unverified restrictive options are not promoted into suitable activity slots.

For a public deployment:

```sh
npm run build
NODE_ENV=production HOST=0.0.0.0 PORT=5173 npm start
```

Terminate HTTPS at a trusted proxy, configure `PUBLIC_APP_URL`, and mount `DATA_DIRECTORY` persistently. This is a Node application, not a static-only hosting build. The API validates runtime schemas, request origins, ownership, versions, payload limits, safe URL schemes/public DNS, and per-session/IP/server research rates. Do not expose a shared paid API key through an unrestricted public app without appropriate access and spending controls.

## Supported sources and honest limits

Kyoto is the live-tested destination. Agent uses public Japan Guide destination/detail navigation there; other destinations use a discovered public attraction source. Experience sites may introduce sign-in walls; login-only results are reported as gaps. Booking.com’s comparison was tested with exact dates, one adult, one room, and INR. Other occupancies/currencies are validated at runtime and may become partial results if a site changes its interface or blocks access. Children’s occupancy and provider-specific age rules require direct property confirmation.

Prices are not converted or guessed. An observed generic price is distinguished from a date-specific offer; unknown price units/taxes remain unknown. Booking card totals are preserved as source text when their total/tax basis cannot be established confidently. The app does not claim a complete trip is within budget while essential costs remain unknown. Allergy safety and accessibility are never inferred from a menu tag or generic page.

All schedules remain proposed plans requiring source/route verification. Transfers use labeled 30-minute buffers, and unknown visit durations use a conservative proposed one-hour slot. Event dates/times must be explicit to enter a dated event slot. Weather forecasts, guaranteed global coverage, payments, reservations, unrestricted social scraping, and automated sign-ins are not implemented.

See [live validation and source support](docs/validation.md) for the verification record.

## Code guide

```text
server/
  index.ts / api.ts       Same-origin HTTP API and frontend hosting
  schemas.ts             Runtime input and extracted-result validation
  store.ts               SQLite initialization, ownership, and version checks
  tinyfish.ts            Five independent provider adapters
  agent.ts / browser.ts  Goal-based navigation and direct scripted comparison
  jobs.ts / planning.ts  Durable research, ranking, constraints, and scheduling
  watches.ts             Monitor lifecycle, delivery, deduplication, expiration
  integration.test.ts    Deterministic integration and failure-path checks
  live-check.ts          Opt-in live provider and application checks
src/
  App.tsx                App shell, discovery, saved trips, and job reconnection
  components/Planner.tsx / StyleFields.tsx / Itinerary.tsx
  components/Research.tsx / WatchDialog.tsx
  lib/api.ts             Same-origin browser API client; no provider credentials
  lib/planner.ts         Shared models and local-draft compatibility
  lib/research.ts        Typed evidence, candidates, progress, and watches
```

## Visual assets

Photography is bundled locally from Unsplash; no image service is required at runtime. Photos are destination inspiration and may illustrate the surrounding region. The original fish mascot is an SVG component.

| File          | Unsplash photo                                                                             |
| ------------- | ------------------------------------------------------------------------------------------ |
| `hero.jpg`    | [Italian alpine lake](https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1)        |
| `bali.jpg`    | [Bali inspiration](https://images.unsplash.com/photo-1537996194471-e657df975ab4)           |
| `kyoto.jpg`   | [Japan inspiration](https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e)          |
| `varkala.jpg` | [Indian coastal inspiration](https://images.unsplash.com/photo-1512343879784-a960bf40e7f2) |
| `vietnam.jpg` | [Vietnam inspiration](https://images.unsplash.com/photo-1528181304800-259b08848526)        |
| `jaipur.jpg`  | [Jaipur inspiration](https://images.unsplash.com/photo-1599661046827-dacff0c0f09a)         |
| `swiss.jpg`   | [Swiss inspiration](https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99)          |

Google Fonts supplies DM Sans, Manrope, and Playfair Display. System sans-serif and Georgia fallbacks remain usable when offline.
