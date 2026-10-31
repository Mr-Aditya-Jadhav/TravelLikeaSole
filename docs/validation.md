# Integration validation

Verified on 31 October 2026 against the configured TinyFish API key. Credentials and browser connection URLs were not stored in source or validation output.

| Capability | Live check                                                                                                                         | Outcome                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Search     | Kyoto/Fushimi Inari official source discovery                                                                                      | Passed; 3 real result URLs                                        |
| Fetch      | Live extraction from `https://inari.jp/en/`                                                                                        | Passed; real page text                                            |
| Agent      | Category/card navigation from Japan Guide’s Kyoto page, up to three public detail pages                                            | Passed; 3 schema-validated experience records                     |
| Browser    | Booking.com dates 10–12 December 2026, Kyoto, 1 adult, 1 room, INR; apply price sorting; verify visible date/guest/currency fields | Passed; 3 stay cards; remote session explicitly closed            |
| Monitor    | Disposable example.com page monitor: create baseline, pause, run once, delete that test monitor                                    | Passed; baseline and manual result returned; test monitor deleted |

The first experience-site attempt hit a login wall. A completed run with an empty candidate list was correctly rejected. The final tested Agent workflow uses public destination/detail navigation. Booking.com exposed sign-in overlays and a sort-menu role difference; the final script uses the actual dismiss/sort controls and validates the filters after interaction.

The full application HTTP workflow also passed: create a two-day Kyoto trip, follow persisted progress, complete real research, save the trip, lock an activity, and remove that disposable trip. It returned **12 evidence records, 9 usable candidates, and 4 sourced activity slots**. Its flexible dates deliberately skipped the date-specific Browser stay workflow and produced a visible gap, rather than an availability claim.

Ordinary automated tests use temporary SQLite databases and controlled provider fixtures. They exercise authentication-header boundaries, ambiguous start failures, billing failures, unsafe URL rejection, owner isolation, duplicate submissions, stale edits, budget units, dietary/mobility restrictions, closed dates, non-repeating visits, arrival/departure buffers, lock preservation, monitor deduplication, local scheduling, and expiration. Controlled changed-content fixtures demonstrate change filtering; they are not described as live source changes.

Production scheduled webhook delivery requires a configured public HTTPS deployment. The local Node scheduling path and webhook handler are implemented; a public webhook delivery was not live-tested in this local-only session. The live example.com Monitor check verified the baseline/manual lifecycle, not a naturally occurring page change or room/ticket inventory guarantee.

Source support is deliberately narrow and observable. An inaccessible site or an unconfirmed filter produces partial research with an explanation. The application does not promise that every named travel platform or every destination is supported.

The subsequent recommendation update adds BM25 relevance, weighted practical fit, MMR diversity, and a bounded schedule search. The automated suite now has 40 passing tests. They include 16 targeted ranking regressions (one covers a stated location that names the city but not the country), an Agent retry regression, a guide-page filter regression, and the HTTP action for re-optimizing an existing trip with its locked item intact. These are controlled algorithm checks, not a claim of measured real-world satisfaction improvement. See [the ranking design](ranking.md).

The Chrome walkthrough also verified the existing-trip action using live Kyoto research: a locked Fushimi Inari visit stayed at 09:30, a restaurant in Augusta, Georgia was removed, and the unavailable lunch slot stayed visibly unconfirmed. The updated plan exposed interest/diversity explanations and price/walking caveats, and saved successfully. Re-ranking reused the existing evidence without another provider run. The local preview screenshot is in `artifacts/improved-itinerary.jpg` (ignored by Git).

## End-to-end journeys (`npm run test:e2e`)

Run against a separate app instance with the live TinyFish key, after the fixes below. Each row comes from the latest live run of that case (cases 4 and 5 finished Sat, 31 Oct 2026 09:45:44 UTC; case 2 finished Sat, 31 Oct 2026 10:00:05 UTC; cases 1 and 3 finished Sat, 31 Oct 2026 10:15:35 UTC). Cases 4 and 5 ran before the destination and article fixes. Replaying case 4's saved research under the final rules gives the same plan, and case 5 does not use the planner. In the latest Kyoto and Jaipur runs, Booking.com did not show results to the automated browser (the step timed out waiting for them). The direct Browser check passed right before, and earlier runs compared stays for both cities. Each case goes through the app's own HTTP API. It checks evidence links, source-reported opening hours, diet, known budget, travel-day buffers, and no repeated venues. It then saves, locks, re-optimizes (the lock must hold), swaps, and confirms that stale edits are rejected.

| Case | Journey                          | Result                           | Highlights                                                                                              |
| ---- | -------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1    | Kyoto culture escape             | Passed except hotel step (19/20) | 10 sources, 3 sourced stops, Booking.com did not show results to the automated browser, 3 Agent records |
| 2    | Bali flexible wellness trip      | Passed (20/20)                   | 13 sources, 3 sourced stops, stay comparison skipped (flexible dates), 3 Agent records                  |
| 3    | Jaipur family heritage trip      | Passed except hotel step (19/20) | 11 sources, 2 sourced stops, Booking.com did not show results to the automated browser, 3 Agent records |
| 4    | Lisbon friends getaway           | Passed (19/19)                   | 11 sources, 2 sourced stops, 3 stays compared, 2 Agent records                                          |
| 5    | Watch the Kyoto trip for changes | Passed (8/8)                     | 2 monitors: baseline, manual check, pause, resume, stop, cleanup                                        |

Direct API checks after the fixes (`npm run test:live -- --all`): Search passed, Fetch passed, Browser passed, Agent passed, Monitor passed. Offline suite: 40/40 tests passing.

### What the first run found

The first run used the original Agent timing and search queries. It had the Booking.com sort fix and the single Agent retry already in place. It passed 2 of 5 cases: Kyoto culture escape passed (20/20); Bali flexible wellness trip failed (14/16); Jaipur family heritage trip failed (14/16); Lisbon friends getaway failed (13/15); Watch the Kyoto trip for changes passed (8/8). The failures were:

- Bali flexible wellness trip: Agent completed: The Agent result is not ready yet. Its run ID has been saved; no duplicate run was started.; Sourced activities scheduled: 0 sourced slots
- Jaipur family heritage trip: Agent completed: The Agent result is not ready yet. Its run ID has been saved; no duplicate run was started.; Sourced activities scheduled: 0 sourced slots
- Lisbon friends getaway: Agent completed: The Agent result is not ready yet. Its run ID has been saved; no duplicate run was started.; Sourced activities scheduled: 0 sourced slots

Fixes made from these findings:

- **Browser:** Booking.com's sort control is now targeted by its stable `data-id`. Opening the menu is retried, with a same-sort URL fallback. Date, guest, room, and currency checks still run after the sort.
- **Agent timing:** live runs took about 250 seconds, and the old 270-second wait discarded successful runs. The wait is now `AGENT_TIMEOUT_SECONDS + 300`, and a late result is picked up after the stay comparison. A finished run with no listings gets one fresh attempt.
- **Agent safety:** in one run, the agent met a Tripadvisor captcha and began submitting its form. That run was cancelled. The goal now forbids solving or bypassing captchas and bot checks. Non-Kyoto runs start from a page Fetch already read cleanly, or from Wikivoyage.
- **Sources:** Search drops social, video, and forum links. The attraction query no longer packs in interest words, and the event query uses month names. Fetch skips bot-check pages. Guide, list, itinerary, and calendar pages stay as evidence instead of becoming activities (a Kyoto plan had scheduled "The Ultimate Guide" and a Facebook post).
- **Destination check:** venues were scheduled only when a source named both the city and the country. Wikivoyage and jaipurtravel.com name "Bali" and "Jaipur" but rarely "Indonesia" or "India", so a second full run found Tanah Lot, Amber Fort and others but scheduled none of them (Bali flexible wellness trip: Sourced activities scheduled: 0 sourced slots; Jaipur family heritage trip: Sourced activities scheduled: 0 sourced slots). A source-stated location that names the city now qualifies, as long as it names no other listed country and no US address. Replaying Kyoto and Lisbon showed identical plans under the old and new rule.
- **Articles as visits:** the same run scheduled "How Much Money Do I Need For Kyoto?" as a Kyoto stop. Question titles and money or budget advice now stay as evidence, like guides and lists.
- **Booking.com variability:** Booking.com serves different page versions. In later sessions, a sign-in pop-up covered the sort button once, a results reload took more than 15 seconds once, and once the results list rendered and then disappeared from the page. The wait after sorting is now 30 seconds, and the reason for a failed stay comparison is logged on the server. When Booking.com does not show confirmable results, the app says so and invents no room prices; it does not try to get around the provider's checks. The direct Browser check timed out once at the old 15-second wait and passed on re-run with the longer wait.
- **Setup and queue:** a saved `.env` key now wins over a different shell export, with a warning. Queued research runs first come, first served.
