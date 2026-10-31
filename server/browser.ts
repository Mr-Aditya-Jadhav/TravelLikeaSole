import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import { tinyfish, type TinyFish } from './tinyfish.ts';
import type { Trip } from '../src/lib/planner.ts';
import type { Candidate, Evidence } from '../src/lib/research.ts';
import { id, now } from './store.ts';
import { safeUrl } from './security.ts';

export async function compareStays(
  trip: Trip,
  onSession: (id: string | null) => void,
  client: TinyFish = tinyfish,
): Promise<{ candidates: Candidate[]; evidence: Evidence[]; gaps: string[] }> {
  const input = trip.input;
  if (input.dateMode !== 'exact' || input.startDate === input.endDate)
    return {
      candidates: [],
      evidence: [],
      gaps: [
        'Date-specific stay comparison needs exact dates and at least one accommodation night.',
      ],
    };
  const params = new URLSearchParams({
    ss: input.destination,
    checkin: input.startDate,
    checkout: input.endDate,
    group_adults: String(input.travelers),
    no_rooms: String(input.rooms || 1),
    group_children: '0',
    selected_currency: input.currency,
    lang: 'en-us',
  });
  const target = `https://www.booking.com/searchresults.html?${params}`;
  const session = await client.createBrowser(target);
  onSession(session.session_id);
  let browser: Browser | undefined;
  try {
    browser = await chromium.connectOverCDP(session.cdp_url, { timeout: 30000 });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.newPage());
    await page.waitForURL((url) => url.hostname.endsWith('booking.com'), { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    const dismissOverlays = async () => {
      const close = page.getByRole('button', { name: /dismiss sign.in/i }).first();
      await close.click({ timeout: 4000 }).catch(() => {});
      const cookies = page.getByRole('button', { name: /^accept$|accept all cookies/i }).first();
      if (await cookies.isVisible().catch(() => false))
        await cookies.click({ timeout: 2000 }).catch(() => {});
    };
    await page.locator('[data-testid="property-card"]').first().waitFor({ timeout: 25000 });
    await dismissOverlays();
    const destination = page.locator('input[name="ss"]').first();
    if (
      !(await destination.inputValue())
        .toLowerCase()
        .includes(input.destination.split(',')[0].toLowerCase())
    )
      throw new Error('The destination field did not match the selected city.');
    // Apply a real comparison control after the provider has loaded the date/occupancy URL.
    // The menu can ignore a click made before the page finishes hydrating, so retry it, and
    // match only "Price (lowest first)", not "Best reviewed & lowest price".
    const sorter = page.locator('[data-testid="sorters-dropdown-trigger"]:visible').first();
    const lowestPrice = page
      .locator('[data-testid="sorters-dropdown"] [data-id="price"]')
      .or(page.getByRole('menuitem', { name: /^price \(lowest first\)$/i }))
      .or(page.getByRole('option', { name: /^price \(lowest first\)$/i }))
      .first();
    let sorted = false;
    for (let attempt = 0; attempt < 3 && !sorted; attempt++) {
      try {
        await sorter.click({ timeout: 8000 });
        await lowestPrice.click({ timeout: 6000 });
        await page.waitForURL((url) => url.searchParams.get('order') === 'price', {
          timeout: 15000,
        });
        sorted = true;
      } catch {
        await page.keyboard.press('Escape').catch(() => {});
        await dismissOverlays();
      }
    }
    if (!sorted) {
      // Same provider sort, applied through its URL; the filter checks below still run.
      const url = new URL(page.url());
      url.searchParams.set('order', 'price');
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await dismissOverlays();
    }
    await page.locator('[data-testid="property-card"]').first().waitFor({ timeout: 15000 });
    const actual = new URL(page.url()).searchParams;
    if (
      ['checkin', 'checkout', 'group_adults', 'no_rooms', 'selected_currency'].some(
        (key) => actual.has(key) && actual.get(key) !== params.get(key),
      )
    )
      throw new Error('The stay provider changed a selected filter.');
    const guestText = (
      await page.locator('[data-testid="occupancy-config"]:visible').first().innerText()
    ).replace(/\s+/g, ' ');
    if (
      !new RegExp(`\\b${input.travelers}\\s+adult`).test(guestText) ||
      !new RegExp(`\\b${input.rooms || 1}\\s+room`).test(guestText)
    )
      throw new Error('The visible guest and room counts could not be confirmed.');
    const currencyText = await page
      .locator('[data-testid="header-currency-picker-trigger"]:visible')
      .first()
      .innerText();
    if (!currencyText.includes(input.currency))
      throw new Error('The visible currency did not match the requested currency.');
    const fields = await page
      .locator('[data-testid="date-display-field-start"],[data-testid="date-display-field-end"]')
      .allTextContents();
    if (fields.length < 2)
      throw new Error('The selected stay dates could not be confirmed in the provider interface.');
    const dateMatches = (text: string, date: string) => {
      const d = new Date(`${date}T12:00:00Z`);
      return (
        text.includes(String(d.getUTCDate())) &&
        text
          .toLowerCase()
          .includes(d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase())
      );
    };
    if (!dateMatches(fields[0], input.startDate) || !dateMatches(fields[1], input.endDate))
      throw new Error('The visible stay dates did not match this trip.');
    const cards = await page.locator('[data-testid="property-card"]').all();
    const candidates: Candidate[] = [];
    const evidence: Evidence[] = [];
    for (const card of cards.slice(0, 3)) {
      const name = await card.locator('[data-testid="title"]').innerText();
      const href = await card.locator('[data-testid="title-link"]').getAttribute('href');
      const url = href ? safeUrl(new URL(href, page.url()).href) : null;
      if (!url) continue;
      const text = (await card.innerText()).slice(0, 1800);
      const sourceId = id();
      evidence.push({
        id: sourceId,
        url,
        title: name,
        excerpt: text.slice(0, 600),
        retrievedAt: now(),
        category: 'stay',
        source: 'Browser',
      });
      // Card totals have varying tax/room bases; retain text rather than mislabel a parsed number.
      candidates.push({
        id: id(),
        name,
        category: 'stay',
        description: text.slice(0, 600),
        url,
        evidenceIds: [sourceId],
        durationMinutes: null,
        walkingMinutes: null,
        stepFree: null,
        diets: [],
        location: input.destination,
        opensAt: null,
        closesAt: null,
        date: input.startDate,
        price: {
          amount: null,
          currency: input.currency,
          unit: 'unknown',
          status: 'unknown',
          taxesIncluded: null,
        },
        gaps: [
          `Compared for ${input.startDate}–${input.endDate}, ${input.travelers} adults, ${input.rooms || 1} room(s). Read the provider's displayed total and tax basis before booking.`,
        ],
        source: 'Browser',
      });
    }
    if (!candidates.length) throw new Error('No usable stay comparison cards were returned.');
    return { candidates, evidence, gaps: [] };
  } finally {
    await browser?.close().catch(() => {});
    await client.closeBrowser(session.session_id);
    onSession(null);
  }
}
