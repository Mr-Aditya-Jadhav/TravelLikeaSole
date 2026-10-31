# Itinerary recommendation engine

`server/ranking.ts` scores and diversifies researched candidates. `server/planning.ts` applies constraints and searches for a feasible combination of visits. This is an explainable, deterministic starting point for a travel product with explicit preferences and limited interaction history. Its weights are engineering defaults, not a learned model or an empirically calibrated satisfaction probability.

## 1. Eligibility comes before ranking

Dietary restrictions, explicit exclusions, walking limits, dates, known closed weekdays, arrival/departure buffers, opening windows, comparable known costs, and locks remain constraints. A good relevance score cannot override them. Arbitrary allergy/accessibility requirements still need direct verification; unknown suitability stays unresolved.

Destination qualification is also separate from relevance. A venue name that contains the destination is not enough: the source must support the selected city and country. A source-stated location that names the city (for example "Jl Monkey Forest, Ubud, Central Bali") also counts, as long as it names no other listed country and no US address, because local guides often never repeat the country name. Explicitly conflicting countries/addresses are rejected; unestablished locations are excluded from scheduled visits and retain a caveat in the shortlist. This is a conservative text-and-source qualification, not a general geocoding service. A regression reproduces a restaurant named Kyoto in Augusta, Georgia, and verifies that it cannot become a Kyoto, Japan lunch recommendation.

The selected walking presets use conservative planning caps: Minimal walking requires reported visits of at most 15 minutes walking and at most 30 reported walking minutes across a day; Easy walks requires at most 45 per visit and 90 across a day. Missing effort is not treated as confirmed low effort. These planning policies do not establish medical or accessibility suitability.

## 2. BM25 interest relevance

The engine uses term-frequency saturation and document-length normalization from [Okapi BM25](https://nlp.stanford.edu/IR-book/html/htmledition/okapi-bm25-a-non-binary-model-1.html), with `k1 = 1.2` and `b = 0.75`. A travel-specific vocabulary expands interests into relevant terms: Nature includes botanical gardens, forests, and wildlife; Culture includes museums, crafts, and heritage.

Implementation details:

- The place name receives twice the text weight of the description.
- Descriptions are bounded to 2,500 characters and term counts are capped at four to reduce repetitive keyword spam.
- Each interest receives equal query weight regardless of how many synonyms it has.
- The final interest signal is 65% normalized BM25 relevance and 35% coverage of selected interests.
- Empty interest selections receive a neutral value instead of fabricated preferences.
- Duplicate entities and tracking-link variants are removed before corpus statistics are calculated.

The dictionary is currently English-oriented. This is lexical relevance, not a claim of multilingual semantic understanding.

## 3. Weighted practical fit

Each candidate receives a base score from normalized components:

| Component       | Weight | Basis                                                                        |
| --------------- | -----: | ---------------------------------------------------------------------------- |
| Interests       |   0.40 | BM25 and selected-interest coverage                                          |
| Atmosphere      |   0.10 | Source-reported quiet/social characteristics                                 |
| Pace and effort |   0.10 | Reported visit duration and selected activity style                          |
| Evidence detail |   0.18 | Actual supporting sources and available practical fields                     |
| Freshness       |   0.07 | Source retrieval age; shorter decay for volatile categories                  |
| Budget fit      |   0.15 | Comparable currency, party size, room/night basis, and a planning allocation |

Evidence detail depends on support and completeness, not whether the data arrived through Agent, Browser, or Fetch. A retrieval timestamp is used separately from publication or event dates. Freshness half-lives are 14 days for attraction descriptions and two days for the other, more volatile categories. Missing or invalid retrieval dates receive a conservative default.

Unknown prices receive a conservative score and stay unknown in the cost summary. Foreign currencies are not silently converted. The budget allocation is a ranking heuristic, not an estimate of an unobserved trip total. The schedule separately rejects any combination whose comparable known spending exceeds the selected cap.

Scores are internal ordering values. They are not displayed as confidence or safety percentages.

## 4. MMR variety and locality

[Maximal Marginal Relevance](https://www.cs.cmu.edu/~jgc/publication/The_Use_MMR_Diversity_Based_LTMIR_1998.pdf) balances relevance with the similarity of options already selected. Here similarity combines travel-theme overlap and lexical overlap. The relevance weight is 0.78 for travelers selecting multiple interests and 0.90 for a more focused profile.

The contextual utility is:

```text
lambda * baseScore
  - (1 - lambda) * maxSimilarityToSelectedVisits
  + reportedLocationAffinity
  + newlyCoveredInterestBonus
```

The location bonus is bounded at 0.08 and the new-interest bonus at 0.06. Reported coordinates support a Haversine-distance affinity; otherwise an explicitly shared neighborhood can add affinity. Generic destination words are removed from neighborhood comparison so two unknown places in “Kyoto” do not receive a false proximity bonus. Unknown locations receive no proximity bonus.

This helps avoid a sequence of near-identical museums when the traveler also selected nature, while retaining a stronger focus for someone who selected temples alone.

## 5. Bounded beam search for the itinerary

[Beam search](https://d2l.ai/chapter_recurrent-modern/beam-search.html) retains several promising partial solutions rather than committing to the first local choice. The travel planner adapts that idea to time slots and known spending, using a beam of 20 states and at most 12 candidate expansions per slot.

The engine can leave a slot open to preserve a better later combination. This matters when a morning-only venue competes with one that remains open all afternoon, or when a premium early choice would consume the budget needed for two suitable visits.

Each extension checks:

- Unique venues across the trip, including equivalent source URLs.
- Source-reported opening/closing times, explicit event dates, and fixed event starts.
- Destination-local arrival/departure labels with 90-minute travel-day buffers.
- Intentional rest blocks and non-overlapping visit windows.
- Walking totals and comparable known spending.
- Transfer space before and after already reserved stops.

Transfers remain estimates. Without coordinates the allowance is 30 minutes. With source-reported coordinates, the engine uses a conservative straight-line local-transport heuristic (35 km/h plus 10 minutes, with a 30-minute minimum), clearly labeled for route confirmation. This is not a routing-service estimate.

The beam is bounded and therefore approximate; it does not guarantee a globally optimal itinerary. Prices, access, venue data, and routes can remain unverified even when the proposed combination fits these checks.

## Existing trips, locks, and explanations

**Improve recommendations** reuses the trip’s existing source records and candidates. It does not start another TinyFish research run. Locked activities and locked rest blocks are reserved before the search; their identities, descriptions, and times remain intact. Unlocked items can be rebuilt into a more suitable combination. Optimistic version checks protect concurrent edits.

Retrying missing research has a different purpose: it keeps already edited sourced items and fills unresolved slots when possible. It does not silently replace an existing valid plan.

Each new recommended item includes matched interests, practical fit reasons, relevant variety/locality reasons, and explicit caveats. **Why Sole picked this** exposes those reasons in the UI without presenting internal ordering scores as verification confidence.

## Regression coverage

Ranking tests cover synonym relevance, input-order stability, repeated-keyword resistance, freshness, evidence completeness, unknown costs, MMR variety, entity deduplication, reported locality, contrasting traveler profiles, budget combinations, time-window lookahead, partial travel days, fixed event times, lock preservation, and safe alternatives. The HTTP test also exercises the existing-trip optimization action and its version increment.
