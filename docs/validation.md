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

The subsequent recommendation update adds BM25 relevance, weighted practical fit, MMR diversity, and a bounded schedule search. The automated suite now has 37 passing tests, including 15 targeted ranking regressions and the HTTP action for re-optimizing an existing trip with its locked item intact. These are controlled algorithm checks, not a claim of measured real-world satisfaction improvement. See [the ranking design](ranking.md).

The Chrome walkthrough also verified the existing-trip action using live Kyoto research: a locked Fushimi Inari visit stayed at 09:30, a restaurant in Augusta, Georgia was removed, and the unavailable lunch slot stayed visibly unconfirmed. The updated plan exposed interest/diversity explanations and price/walking caveats, and saved successfully. Re-ranking reused the existing evidence without another provider run. The local preview screenshot is in `artifacts/improved-itinerary.jpg` (ignored by Git).
