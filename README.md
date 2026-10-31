# TravelLikeaSole

**Find your current. Travel your way.**

A responsive, interactive travel-planning interface based on [the product specification](./TravelLikeaSole.md). Built with React, TypeScript, Vite, and Lucide icons.

## Run locally

Use Node.js 22.18+ or 24+.

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite, usually **http://127.0.0.1:5173/**.

```sh
npm run build   # TypeScript check and optimized production build
npm run preview # Serve the production build locally
npm test        # Deterministic planning and constraint checks
```

## The experience

- **Discover:** photographic destination cards, category filters, destination details, official tourism links, and a planner available immediately.
- **Plan an escape:** three-step setup for destination, origin, flexible duration or exact dates, party size, currency, budget basis, transport inclusion, and travel preferences. Budget is required; style selections are optional. Back and edit actions preserve selections.
- **My travel style:** visual pace cards, interest chips, activity preferences, atmosphere, diet, stay type, dietary/accessibility restrictions, and notes. Saving is explicit and limited to the current browser. Trip-specific adjustments do not overwrite the saved style.
- **Trip drafts:** day tabs, intentional downtime, clearly provisional activity ideas, lock/unlock, activity swaps, quieter afternoons, budget visibility, Google Maps handoff, text export, and explicit saving.
- **Saved places and trips:** browser-local collections with useful empty states and removal controls. Saved trip edits update their stored version.
- **Sole:** an original SVG fish guide, with contextual tips that leave controls unobstructed.

The layout supports desktop, tablet, and mobile. Native dialogs provide focus containment and Escape dismissal; controls have accessible labels and selected states. The app includes a skip link, visible keyboard focus, reduced-motion support, and darker secondary copy for readability.

## Scope and integration status

This delivery implements the **UI/UX and local interactions**. It does **not** implement the full production backend described in the specification.

Trip drafts are deterministic planning outlines. They contain activity themes and placeholder times, not sourced recommendations. Specific places, route feasibility, availability, accessibility, dietary suitability, and prices are unverified. Unknown costs remain unknown. The interface identifies these limitations before and after draft creation.

TinyFish Search, Fetch, Browser, Agent, and Monitor, an application-level LLM, authentication, databases, durable research jobs, and server-side monitoring are **not connected**. The monitoring dialog is informational and does not schedule notifications. No API keys or environment variables are needed for this interface. Future provider integrations must run server-side; do not put credentials in browser environment variables or local storage.

## Code guide

```text
src/
  App.tsx                 App shell, navigation, discovery, and saved collections
  components/
    Dialog.tsx            Native accessible dialog and focus restoration
    Planner.tsx           Three-step setup and editable review
    StyleFields.tsx       Reusable preference controls
    Itinerary.tsx         Daily trip draft, locks, swaps, budget, and export
    Sole.tsx              Original vector mascot
  data.ts                 Destination inspiration and selection options
  lib/
    planner.ts            Typed models, input validation, budgets, and draft logic
    planner.test.ts       Date, budget, lock, and dietary-preservation checks
  styles.css              Responsive visual system
  readability.css         Shared secondary-text contrast and sizing rules
public/images/            Bundled destination photography
```

Storage keys use the `sole.v1.` namespace. Profiles are transient until explicitly saved. Saving a trip does not separately enable reusable profile storage. There is no cross-device synchronization. Corrupt or unavailable browser storage falls back to an empty/session-only state.

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

## Verification

- Production build and TypeScript checks pass, including unused-import checks.
- Seven deterministic checks cover days/nights, daylight-saving boundaries, invalid inputs, budget basis, peaceful-day density, locked activities, and dietary-preserving reversible swaps.
- Browser walkthroughs checked the desktop discovery screen, trip setup through review, destination filtering, bookmarking, saved-place collection, and the collection layout at a 400-pixel viewport.
- Live provider workflows are outside this UI delivery and have not been tested.
