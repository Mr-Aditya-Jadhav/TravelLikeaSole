# TravelLikeASole — Product and Implementation Specification

Version: 1.0  
Prepared: 31 October 2026  
Status: Build specification based on the reviewed product direction

## 1. Product objective

TravelLikeASole is a personalized travel-planning web app guided by Sole, a friendly sole fish. It turns scattered information from the internet into a realistic itinerary that fits the traveler's dates, budget, food preferences, interests, physical comfort, and desired pace.

The experience starts with destination selection and a compact visual setup. Travelers choose cards, chips, dates, and budget controls instead of answering a long chatbot questionnaire. The application creates one reusable Traveler Profile and uses TinyFish Search, Fetch, Browser, Agent, and Monitor for distinct research and trip-maintenance tasks.

**Tagline:** Find your current. Travel your way.

**Core promise:** A trip that fits you, supported by sources you can inspect and links you can act on.

### 1.1 Problems to solve

- Travel information is scattered across tourism websites, booking platforms, event calendars, local news, Instagram, YouTube, and blogs.
- Popular recommendations often ignore walking limits, food restrictions, downtime, budget, and arrival/departure times.
- Social discoveries may be outdated, geographically vague, or impossible to book.
- Users repeat the same preferences for each new trip.
- Plans become stale when events change, access closes, or relevant new information appears.

### 1.2 Product principles

1. Make selection easier than typing.
2. Ask only for information needed to improve the trip.
3. Separate enduring preferences from trip-specific choices.
4. Respect explicit constraints before optimizing recommendations.
5. Explain recommendations with evidence and personal fit.
6. Expose uncertainty rather than inventing missing information.
7. Use each TinyFish API for a meaningful, distinct task.
8. Allow useful partial results when a source fails.
9. Keep the user in control of profile storage, monitoring, and bookings.

## 2. Scope

### 2.1 Required initial release

- Responsive web app with fish-guided, selection-first onboarding.
- Destination, origin, dates/duration, party size, and budget input.
- Compact preference selection and editable review summary.
- One structured Traveler Profile, with optional persistence.
- One application-level LLM call to interpret a new profile, not one call per answer.
- Separate Trip Context for each trip.
- Real integrations for TinyFish Search, Fetch, Browser, Agent, and Monitor.
- Sourced itinerary with travel options, stays, meals, attractions, activities, and cultural-event research.
- Evidence links, retrieval times, clear price labels, and data-gap messages.
- Cost breakdown, physical-effort information, and realistic scheduling.
- Activity swap and a way to lock itinerary items.
- Optional trip monitoring and an in-app change history.
- Reliable behavior for at least one explicitly tested destination and one controlled Browser workflow.

### 2.2 Deferred scope

- In-app purchases, room reservations, ticket purchases, and payments.
- Guaranteed worldwide coverage or guaranteed access to any named website.
- Complex multi-city optimization.
- Full group preference negotiation.
- Voice conversations and autonomous account sign-ins.
- Full video understanding or unrestricted social-media scraping.
- Cross-device profile synchronization unless authentication is explicitly implemented.
- Automatic modification of booked or locked activities.

Build real supported flows first. Mocked data may be used for development and automated tests, but must never be presented as live research in the product.

## 3. User experience

### 3.1 Landing page

Primary prompt: **Where's your next escape?**

Supporting copy: **Pick a place. Sole will find a trip that fits you.**

The destination selector and primary action must be visible immediately. Avoid a marketing-only landing page that hides the planner behind several clicks.

Sole should be visible as a friendly guide. Use brief messages, small expression changes, and helpful progress states. The mascot must not obstruct controls, delay the flow, or become the primary interaction mechanism.

### 3.2 Screen 1 — Your trip

| Input | Behavior |
| --- | --- |
| Destination | Searchable city/region selector; resolve ambiguous names before research |
| Starting city | Used to discover transport to the destination |
| Timing | Exact date range or duration with explicitly flexible dates |
| Travelers | Solo, couple, friends, family; actual party size and room occupancy |
| Budget | Amount, currency, per-person/group basis, transport-inclusion toggle |

Exact dates enable date-specific events and prices. Duration-only trips must be labeled provisional; do not present date-specific availability as verified until dates are selected.

Optional expandable fields: arrival/departure time, already-booked transport, children/older travelers, room count, and fixed commitments. Avoid collecting exact ages unless a provider requires them; age bands are sufficient for planning.

### 3.3 Screen 2 — Your travel style

Display compact groups of cards/chips on one screen. All selections should be directly editable without a conversational turn.

| Group | Options | Selection |
| --- | --- | --- |
| Pace | Peaceful, balanced, packed | Single |
| Atmosphere | Quiet spaces, a mix, meet people | Single |
| Activity | Minimal walking, easy walks, long walks, hikes | Single; optional detailed limits |
| Interests | Temples, culture, nature, food, beaches, nightlife, shopping, wellness, photography | Multiple |
| Food | Vegetarian, vegan, Jain, nonvegetarian, flexible | Single plus restrictions |
| Stay | Hostel, simple private room, boutique, luxury, no preference | Single |

Include 'No preference' or a skip path where appropriate. Interests and optional details must not block progress. Budget and hard restrictions must not receive hidden defaults.

Relevant details expand inline:

- Hiking: desired difficulty and maximum duration.
- Mobility: walking limit, stairs, step-free requirements, or other explicit needs.
- Food: allergies and exclusions; never equate a menu label with verified allergy safety.
- Culture: performances, local festivals, crafts, history, or religious experiences.
- Stay: private bathroom, workspace, gym, quiet room, or other must-haves.

Optional free text: **Anything Sole should keep in mind?**

Do not use extrovert/introvert or gym attendance as proxies for mobility or interests. Ask about the actual travel behavior that matters.

### 3.4 Screen 3 — Review and go

Show destination/dates, budget basis, selected chips, hard constraints, and a plain-language summary.

Example: **A peaceful culture explorer who prefers vegetarian food, simple private stays, short walks, and unhurried days.**

Actions:

- Build my trip.
- Edit any preference directly.
- Remember my travel style, off until explicitly selected.

The selected values are authoritative. A generated summary must never override them.

### 3.5 Returning traveler

Show: **Same travel style, new destination?**

Offer 'Use my saved style', 'Adjust for this trip', and 'Edit my saved style'. A returning traveler should be able to start a new trip by entering trip details without repeating preference onboarding.

Trip overrides do not update the saved profile unless the user explicitly selects that action.

### 3.6 Accessibility and interaction requirements

- All controls work with keyboard navigation and visible focus states.
- Cards expose selected state to assistive technology.
- Provide text labels for effort, confidence, and status; never rely on color alone.
- Respect reduced-motion settings.
- Preserve entered values when navigating backward or recovering from errors.
- Mobile layouts must avoid horizontal scrolling for core tasks.
- No preference change should require an LLM request merely to update a chip.

## 4. Profile understanding and persistence

### 4.1 One profile-understanding call

Collect onboarding selections locally, then make one application-level LLM request when the user submits the completed setup. Its job is to normalize the profile, summarize travel style, and interpret optional free text.

The model must preserve explicit selections, distinguish hard constraints from preferences, avoid psychological diagnoses, and return schema-validated structured data.

Do not invoke the model after each click. Deduplicate duplicate submissions. Reuse a completed interpretation for the same input hash. Failed attempts may be retried under a bounded policy, but do not claim retries are literally one network request.

If the call fails, build the profile deterministically from selected values and generate a template summary. The user must still be able to plan a trip.

### 4.2 TinyFish Agent is a separate capability

TinyFish Agent is a goal-based website automation API, not a general-purpose profile-inference endpoint. Use one separate LLM call for profile interpretation, or deterministic mapping if no LLM is configured. Pass only relevant constraints from the resulting profile into TinyFish research goals.

The one-call requirement applies to initial profile understanding. It does not describe TinyFish's internal model calls or prohibit separately budgeted itinerary synthesis. Search, extraction, research runs, and monitoring are separate operations.

### 4.3 Storage behavior

- Default initial persistence: explicit opt-in local browser storage with schema versioning.
- Explain that local saving works on the current device/browser.
- Keep unsaved profiles transient; saving a trip must not silently enable permanent profile storage.
- Provide edit and delete controls.
- Never store provider credentials, API keys, or browser session tokens in local storage.
- Cross-device saving requires authenticated server-side ownership and authorization.
- A Traveler Profile is not a TinyFish Browser Context Profile. Do not conflate preference storage with login-cookie storage.

## 5. Domain model

Use typed schemas and runtime validation. The following are application models, not claimed TinyFish response schemas.

### 5.1 TravelerProfile

```ts
type TravelerProfile = {
  id: string;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  persistence: 'session' | 'local' | 'account';
  pace: 'peaceful' | 'balanced' | 'packed' | 'unspecified';
  atmosphere: 'quiet' | 'mixed' | 'social' | 'unspecified';
  interests: Array<{ key: string; priority: number }>;
  food: {
    diet: 'vegetarian' | 'vegan' | 'jain' | 'nonvegetarian' | 'flexible' | 'unspecified';
    exclusions: string[];
    allergies: string[];
  };
  mobility: {
    activityPreference: 'minimal' | 'easy' | 'long_walks' | 'hikes' | 'unspecified';
    maxWalkingMinutesPerDay: number | null;
    maxContinuousWalkingMinutes: number | null;
    stairs: 'avoid' | 'okay' | 'unknown';
    stepFreeRequired: boolean;
    hikingDifficulty: 'easy' | 'moderate' | 'hard' | null;
    notes: string[];
  };
  stay: { style: string; requiredAmenities: string[] };
  usualSpendingStyle: 'budget' | 'midrange' | 'premium' | 'unspecified';
  mustHaves: string[];
  exclusions: string[];
  summary: string;
  interpretation: { inputHash: string; method: 'llm' | 'rules'; model: string | null };
};
```

Unselected values remain unspecified. Treat unknown physical requirements conservatively where they could violate an explicit restriction.

### 5.2 TripContext

```ts
type TripContext = {
  id: string;
  profileId: string;
  profileVersion: number;
  origin: PlaceRef | null;
  destination: PlaceRef;
  dateMode: 'exact' | 'flexible';
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  destinationTimezone: string;
  arrivalAt: string | null;
  departureAt: string | null;
  party: { adults: number; children: number; rooms: number };
  budget: {
    amount: number;
    currency: string;
    basis: 'per_person' | 'group';
    includesIntercityTravel: boolean;
    isHardLimit: boolean;
  };
  overrides: Partial<TravelerProfile>;
  fixedCommitments: FixedCommitment[];
  inspirationUrls: string[];
};
```

`PlaceRef` contains a stable ID when available, display name, region/country, coordinates when known, and timezone. Normalize start/end semantics and compute days/nights consistently. A single-day trip has zero accommodation nights unless an overnight stay is explicitly requested.

### 5.3 Candidate, evidence, and cost

Every candidate should contain:

- ID, category, name, resolved place/location, coordinates if known.
- Canonical URL and provider/organizer identity.
- Availability dates and operating hours with timezone.
- Typical duration and physical-effort information.
- Dietary suitability or stay amenities where relevant.
- Costs, booking URL, and cancellation information if observed.
- Evidence IDs and field-level evidence mapping.
- Unknown fields and explicit verification gaps.

Evidence records contain source URL, source type, retrieval time, publication date if available, event/experience date if known, extracted facts, and supported fields. Keep publication date separate from event date and retrieval time.

Cost records contain amount or range, currency, unit (person/night/room/trip), quantity, dates, occupancy basis, tax/fee inclusion status, and status (`observed_for_dates`, `observed_generic`, `estimated`, `unknown`). Never convert unknown cost to zero.

### 5.4 Itinerary and operational records

- **Itinerary:** trip ID, version, days, budget summary, gaps, warnings, generation time, evidence IDs.
- **ItineraryItem:** candidate ID or free-time block, local start/end, transfer before item, effort, cost, fit explanation, source IDs, booking link, lock state, alternatives.
- **ResearchRun:** application job ID, API type, goal/query, provider run/session ID where available, timestamps, lifecycle status, attempt count, validated output, error category.
- **WatchSubscription:** trip ID, selected sources/topics, purpose, provider monitor IDs, status, schedule, end time, delivery preference.
- **TripChange:** monitor/run ID, detected time, evidence, relevance, affected items, proposed action, deduplication key, user disposition.

## 6. TinyFish integrations

Implement adapters so provider response formats do not leak throughout the application. Confirm exact endpoints, SDK methods, schemas, limits, and account availability against current official documentation before coding. Do not invent provider method names.

| API | Required product role | Demonstrable output |
| --- | --- | --- |
| Search | Find sources and candidate places/events | Ranked URLs with category and relevance |
| Fetch | Extract facts from known URLs | Structured facts linked to supporting pages |
| Browser | Direct scripted interaction on a tested source | Date/occupancy/filter-specific comparison result |
| Agent | Goal-driven adaptive website navigation | Validated candidate or comparison records |
| Monitor | Watch selected public pages/topics after user opt-in | Baseline, change history, and relevant trip updates |

All five integrations must be real and independently observable. An Agent run using a browser internally does not satisfy the separate Browser API integration requirement. Each trip need not invoke every API when unnecessary; Monitor is opt-in.

### 6.1 Search

Build focused queries from destination, dates, interests, budget, and categories. Examples include local performances during exact trip dates, official attraction information, suitable neighborhoods, and relevant public social discoveries.

Search results are leads, not verified facts. Deduplicate URLs, select authoritative sources, and fetch supporting pages before relying on consequential details.

### 6.2 Fetch

Batch related URLs within documented limits. Extract hours, dates, prices, menus, accessibility notes, organizer details, booking links, and notices.

Validate that extracted values actually belong to the intended place, date/year, room, party size, or event. Preserve nulls and ambiguity. Prefer fresh requests for volatile information and reusable cache entries for stable destination facts.

### 6.3 Browser

Use a remote browser session with direct Playwright/CDP control for one explicitly supported workflow, such as selecting travel dates and occupancy on a tested stay-comparison source.

- Keep scripts narrow and source-specific.
- Confirm applied filters before accepting results.
- Capture selected dates, occupancy, currency, and price basis.
- Label login barriers, unsupported filters, and inaccessible pages clearly.
- End sessions after work completes or fails.
- Do not proceed to checkout or modify accounts.

Browser support is a tested capability matrix, not a claim that every booking platform works.

### 6.4 Agent

Use natural-language goals for adaptive navigation across a selected website. Include destination, dates, relevant preferences, exclusions, output schema, missing-data behavior, and action boundaries.

Example goal template:

> On the supplied organizer website, find cultural experiences in {destination} during {date range}. Prefer {interests}. Exclude {explicit exclusions}. Inspect relevant detail pages. Return title, venue, local date/time, duration, price basis, booking URL, source URL, and any stated accessibility requirements. Return unknown fields as null. Do not infer event dates from publication dates. Do not purchase, reserve, sign in, or change account data.

Use a documented structured-output mechanism where available. Validate infrastructure success and actual goal success separately. A completed run with an empty or unusable result is not a successful research task.

Stream real progress through the application when supported. Expose only safe user-facing messages; redact secrets, session URLs, and raw internal prompts from public logs.

### 6.5 Monitor

Enable only after the user selects **Watch this trip** and confirms the tracked sources/topics and frequency.

- Page monitoring: selected event, attraction, or official notice page.
- Topic monitoring: new relevant local-event or disruption URLs.
- Store a baseline and subsequent change history.
- Filter incoming results for relevance to the trip's dates, location, and selected items.
- Keep unchanged/non-actionable checks quiet.
- Deduplicate provider events and repeated page changes.
- Offer stop/pause controls and stop tracking at trip completion.
- Enforce expiration server-side; do not depend on the user reopening the app.

Page-content changes do not guarantee current ticket or room inventory. Date-dependent prices may need a separate Agent/Browser recheck. Topic results can discover new URLs without establishing that the trip conditions changed.

An immediate manual check and a scheduled notification may behave differently; follow the current provider documentation. Do not assume manual checks deliver webhooks. Use a publicly reachable webhook in deployed environments and a supported local-development strategy.

## 7. Source strategy

| Category | Extract | Preferred source types |
| --- | --- | --- |
| Travel to destination | Routes, timing, duration, fare, baggage if available | Operators and accessible travel platforms |
| Local transport | Transfer estimates, public transit, service hours | Routing service, official transit, operators |
| Stays | Dates, room/occupancy, location, amenities, taxes, cancellation | Properties and tested accommodation platforms |
| Attractions | Hours, closures, entry fees, visit duration, effort | Official attractions and tourism authorities |
| Food | Diet fit, menu, prices, opening hours, reservations | Restaurant websites and accessible listings |
| Culture | Exact year/date, time, venue, tickets, organizer | Organizers, venues, tourism calendars |
| Experiences | Availability, requirements, duration, price | Direct operators and tested marketplaces |
| Weather | Forecast and alerts | Official weather sources or configured provider |
| Local news | Closures, disruptions, cancellations | Official notices and reputable local reporting |
| Social discovery | Place names, recent ideas, inspiration links | Accessible public Instagram/YouTube pages |

Named travel platforms are candidate sources, not guaranteed integrations. Record tested support and failure behavior.

### 7.1 Social-media handling

- Discover accessible public posts/videos through Search or user-pasted links.
- Extract captions/descriptions, visible dates, named places, and relevant outbound links.
- Resolve a discovery to a real place or organizer.
- Verify operational facts elsewhere before scheduling.
- Show the original inspiration link and distinguish discovery from verification.
- Never claim captions provide full video understanding.
- If inaccessible, request an optional place name/description and continue without blocking the trip.
- Do not infer that a recently uploaded video depicts a recent visit.

### 7.2 Evidence and freshness

Assign verification states per fact: verified on a primary source, corroborated, reported by a secondary source, or unknown. Avoid arbitrary confidence percentages.

Maintain configurable freshness policies. Prices and availability require shorter cache windows than attraction descriptions. Exact thresholds must be explicit configuration, with last-checked times shown. For future trips beyond a forecast horizon, use labeled seasonal context instead of an invented forecast.

## 8. Planning pipeline

1. Validate trip input and resolve destination/timezone.
2. Load or interpret the profile once; merge explicit trip overrides.
3. Create a focused research plan by category.
4. Search for sources and fetch the strongest candidates.
5. Run bounded Agent and Browser tasks where interaction adds value.
6. Normalize costs, dates, locations, effort, and evidence.
7. Merge duplicate entities while preserving distinct source offers.
8. Apply hard constraints.
9. Rank remaining candidates by preferences, cost, geography, evidence, and variety.
10. Schedule fixed commitments first, then activities, meals, transfers, and rest.
11. Validate time feasibility, effort, budget, hours, and evidence.
12. Return the itinerary with alternatives and unresolved gaps.

An LLM may propose a schedule or explanations, but deterministic validation must decide whether the final plan satisfies explicit constraints. Do not publish an invalid plan merely because the prose is convincing.

### 8.1 Hard constraints

- Exact available travel window and fixed commitments.
- Explicit budget ceiling, normalized to the correct group/person basis.
- Dietary restrictions and excluded experiences.
- Walking, stairs, exertion, and accessibility requirements.
- Party size, room requirements, and age-related operator restrictions when relevant.
- Date overlap, closed days, operating hours, and booking requirements.

Unknown accessibility must not be presented as confirmed suitability. When a required property is unverified, exclude the item from a confirmed slot or clearly offer it only as a needs-confirmation alternative.

### 8.2 Ranking

Use configurable weighted scoring for interest fit, desired pace, atmosphere, cost fit, evidence quality, freshness, transfer efficiency, and diversity. Apply penalties for missing consequential facts and excessive travel.

Hard constraints are filters, not low-weight preferences. A high scenic score cannot outweigh a prohibited hike.

### 8.3 Scheduling

- Use destination-local times and IANA timezones; store timestamps unambiguously.
- Treat arrival/departure days as partial days.
- Distinguish trip days from accommodation nights.
- Include realistic transfer, meal, queue, check-in, and rest buffers.
- Cluster nearby activities and avoid unnecessary backtracking.
- Use a configured routing provider where available; otherwise label conservative transfer estimates.
- Anchor verified regional events at their fixed times.
- Keep peaceful schedules visibly less dense.
- Provide alternatives for weather-sensitive activities.
- Do not schedule unknown event times as precise confirmed slots.

### 8.4 Budget calculation

Normalize transport, accommodation, meals, local transfers, activities, taxes/fees when known, and a visible configurable contingency. Avoid double-counting shared rooms, transfers, included meals, or round-trip fares.

Show known subtotal, estimated components, unknown components, and estimated range. Unknown costs prevent a claim that the complete trip is verified within budget.

If no feasible plan exists, return a constraint-conflict state with selectable options such as fewer paid activities, different stay style, adjusted dates, or a revised budget. Do not apply changes without user selection.

## 9. Itinerary interface

### 9.1 Overview

Show destination/dates, travelers, editable preference chips, budget range, category breakdown, research freshness, and key gaps. Include one brief personalization statement.

### 9.2 Daily itinerary

Each item shows time/duration, name, personal-fit reason, effort, cost basis, transfer from the previous stop, evidence links, booking/details link, verification status, and alternatives.

Free time and rest blocks should be intentional items, not empty space interpreted as a research failure.

### 9.3 Comparisons

Provide a short stay shortlist and relevant transport options. Compare like-for-like occupancy, dates, currency, and inclusions. If offers differ, state the difference rather than declaring a false cheapest option.

Booking actions hand off to the provider. Use exact source URLs when available. If only a search URL is possible, label it 'Search availability' rather than 'Book this offer'.

### 9.4 Replanning

Required actions: swap activity, make day quieter, reduce cost, lock/unlock item.

Replanning must preserve locked items and fixed commitments, research only missing/affected information, and validate transfers, effort, hours, and budget again. Persist an itinerary version so stale swap results cannot overwrite newer edits.

If the change is infeasible, keep the existing valid version and explain the conflict.

## 10. Application API contracts

The following endpoints are proposed application contracts, not TinyFish endpoints. Equivalent framework server actions are acceptable if the same boundaries are maintained.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/profiles/interpret` | Batch-interpret completed selections; deduplicate by input hash |
| `POST /api/trips` | Validate Trip Context and create a trip |
| `POST /api/trips/:id/plan` | Start an idempotent background planning job |
| `GET /api/jobs/:id` | Return job progress, partial output, and safe errors |
| `GET /api/jobs/:id/events` | Optional application SSE progress stream |
| `GET /api/trips/:id` | Return current trip and itinerary version |
| `POST /api/trips/:id/replan` | Apply scoped change with expected itinerary version |
| `PATCH /api/trips/:id/items/:itemId` | Change lock state with version checking |
| `POST /api/trips/:id/watch` | Create selected monitors after explicit opt-in |
| `PATCH /api/trips/:id/watch` | Pause/resume/change watch settings |
| `DELETE /api/trips/:id/watch` | Stop provider monitors and local subscription |
| `GET /api/trips/:id/changes` | Read relevant monitoring history |
| `POST /api/integrations/tinyfish/monitor-webhook` | Validate and process monitor deliveries |

Use consistent error envelopes: code, safe message, retriable flag, affected operation, and correlation ID. Return conflict responses for stale itinerary versions.

Background jobs must outlive a single browser request. Refreshing the page must reconnect to the existing job rather than start duplicate provider runs.

## 11. Architecture and operations

Recommended baseline: Next.js, TypeScript, runtime schema validation, a server-side TinyFish integration layer, a background job runner, and persistent trip/research storage. Use a database such as SQLite for a compatible single-instance prototype or a hosted relational database for deployment. Do not rely on process memory or a serverless local filesystem for durable monitoring state.

Suggested modules:

```text
app/                 Pages and application endpoints
components/          Sole, selections, profile summary, itinerary, evidence
domain/              Profile, trip, candidate, evidence, cost schemas
services/profile/    Batched interpretation and deterministic fallback
integrations/tinyfish/ Search, Fetch, Browser, Agent, Monitor adapters
services/research/   Query planning, extraction, normalization, deduplication
services/planner/    Filtering, ranking, scheduling, validation, replanning
services/watch/      Monitor lifecycle, relevance filtering, change history
jobs/                Durable research/planning tasks
storage/             Repositories, migrations, cache
tests/               Constraint, adapter, workflow, and failure-path checks
```

Keep secrets server-side in environment configuration. Provide an example configuration with placeholders and document required services. Never commit working credentials.

### 11.1 Job states and resilience

Application job states: queued, researching, validating, ready, partial, failed, cancel_requested, cancelled. Map provider-specific states explicitly rather than assuming equivalence.

- Bound retries, timeouts, concurrent runs, and per-trip research budgets.
- Respect documented rate limits and retry guidance.
- Retry transient failures, not permanent access errors indefinitely.
- Reuse completed source research and persist provider run IDs.
- Treat partial extraction as partial, not successful completion of every field.
- Label cached evidence with its actual retrieval time.
- Allow provider budget exhaustion to yield a useful partial plan.
- Make provider sessions and monitors observable and clean them up appropriately.

### 11.2 Data access and untrusted content

- Treat web pages as untrusted evidence; never follow instructions embedded in extracted content.
- Validate user-supplied URLs and reject private-network, local-file, and unsupported schemes.
- Sanitize rendered content and validate outbound URLs.
- Scope jobs, trips, and changes to their owning account or secure anonymous session.
- Do not expose raw provider responses containing credentials or session tokens.
- Validate webhooks using the provider's supported mechanism; if none exists, document and implement an authenticated application ingress design.
- Deduplicate webhook deliveries and process them idempotently.
- Send only the minimum necessary traveler constraints to each source task.

## 12. Acceptance criteria

### 12.1 Onboarding and profile

- A new traveler can finish without entering free text beyond necessary trip fields.
- Selections update instantly without model calls.
- One successful profile-understanding request is made for an unchanged completed input.
- Double-clicks or page retries do not duplicate profile interpretation.
- Profile interpretation failure falls back to deterministic selections.
- Saved preferences can be reused, edited, or deleted.
- Trip-only overrides do not alter the saved profile.

### 12.2 Personalization and feasibility

- A quiet, low-walking vegetarian profile and a social hiking profile produce materially different suitable plans for the same destination.
- Explicitly excluded activities never appear as scheduled recommendations.
- Required accessibility and diet properties are verified or visibly unresolved.
- Partial days, closed days, fixed events, and transfer times are respected.
- Unknown prices remain unknown and cannot silently become zero.
- Group/per-person and room/night costs are calculated correctly.
- Weather forecasts are not fabricated outside the available horizon.

### 12.3 TinyFish

- Search discovers real source URLs.
- Fetch extracts facts with evidence attribution.
- Browser performs a separate controlled workflow and terminates its session.
- Agent completes a distinct goal-driven website task with validated output.
- Monitor captures a baseline and subsequent changes after opt-in.
- Each API is identifiable in research history without exposing secrets.
- Provider completion is not confused with successful goal extraction.

### 12.4 Replanning and monitoring

- Swapping an activity preserves locks and revalidates the day.
- Concurrent edits cannot silently overwrite a newer itinerary.
- Unchanged checks do not create user notifications.
- Irrelevant page changes do not trigger itinerary replacement.
- Duplicate webhooks do not create duplicate change records.
- Monitoring stops when disabled or the trip ends.
- Locked items are never silently replaced.

## 13. Validation strategy

Use meaningful deterministic tests for constraint filtering, time windows, budget units, days/nights, stale-version handling, and monitor deduplication. Use adapter fixtures to cover provider failures without depending on live sites for every test.

Run an end-to-end path for new onboarding, saved-profile reuse, plan generation, item swap, and watch opt-in/stop. Test one real workflow per TinyFish API against an authorized, accessible source before calling the integration complete.

Use a controlled page change to demonstrate monitoring when a real event page does not change during a demo. Label controlled demonstration data clearly. Do not describe a fixture replay as a live source update.

Verify desktop/mobile layouts, keyboard operation, reduced motion, empty states, partial results, and source-access failures.

## 14. Delivery requirements for the coding agent

Deliver working application code, setup instructions, placeholder environment configuration, database initialization/migrations where needed, supported-source notes, and validation results.

Build in these dependency stages:

1. Typed models, runtime schemas, onboarding, and profile persistence.
2. Batched interpretation with fallback and request deduplication.
3. TinyFish adapters and durable research jobs.
4. Evidence normalization, constraint filtering, scheduling, and validation.
5. Itinerary UI, cost comparisons, and provider links.
6. Scoped replanning with locks and version control.
7. Opt-in monitoring, webhook processing, relevance filtering, and expiration.
8. End-to-end verification and product polish.

Do not replace a required real integration with a static success screen. If provider access or a source is unavailable, expose the limitation and keep the adapter boundary ready for the real integration.

### Definition of done

The app lets a traveler select a destination and preferences, save a reusable profile, receive a sourced and feasible itinerary, inspect travel/stay options, change one part of the plan, and opt into relevant trip updates. All five requested TinyFish APIs have real, distinct implementations and verified behavior. Unknown information, estimates, cached research, and unsupported sources remain clearly labeled.

## 15. Official integration references

These references support the capability distinctions in this specification. Confirm exact contracts and limits at implementation time.

- [TinyFish documentation](https://docs.tinyfish.ai/)
- [Search API](https://docs.tinyfish.ai/search-api)
- [Fetch API](https://docs.tinyfish.ai/fetch-api)
- [Browser API](https://docs.tinyfish.ai/browser-api)
- [Agent API](https://docs.tinyfish.ai/agent-api)
- [Monitor](https://docs.tinyfish.ai/monitor)
- [Monitor API reference](https://docs.tinyfish.ai/monitor/api-reference)
- [Structured output](https://docs.tinyfish.ai/key-concepts/structured-output)
- [Run lifecycle](https://docs.tinyfish.ai/key-concepts/runs)

TinyFish also documents a Research API. It is not required by this version, which implements the five APIs explicitly requested: Search, Fetch, Browser, Monitor, and Agent.
