import { useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Coffee,
  Download,
  ExternalLink,
  Footprints,
  Info,
  Leaf,
  LockKeyhole,
  Map,
  MapPin,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  UnlockKeyhole,
  Utensils,
  Wallet,
} from 'lucide-react';
import { budgetTotal, money, styleSummary, swapItem, tripDays, type Trip } from '../lib/planner';
import { destinations } from '../data';
import Sole from './Sole';
import { api, ApiError } from '../lib/api';
import { isResearching, ResearchProgress } from './Research';

export default function Itinerary({
  trip,
  saved,
  onChange,
  onSave,
  onBack,
  onInfo,
}: {
  trip: Trip;
  saved: boolean;
  onChange: (trip: Trip) => void;
  onSave: () => void;
  onBack: () => void;
  onInfo: (kind: 'sources' | 'watch') => void;
}) {
  const [day, setDay] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const researching = isResearching(trip);
  const perform = async (action: string, itemId?: string, locked?: boolean) => {
    if (!trip.serverOwned) return;
    setBusy(true);
    setError('');
    try {
      onChange(await api.editTrip(trip.id, { action, day, itemId, locked, version: trip.version }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update this trip.');
      if (error instanceof ApiError && error.code === 'STALE_VERSION') {
        try {
          onChange(await api.getTrip(trip.id));
        } catch {
          /* The current plan is retained when reconnecting. */
        }
      }
    } finally {
      setBusy(false);
    }
  };
  const lock = (itemId: string, locked: boolean) => {
    if (trip.serverOwned) {
      void perform('lock', itemId, locked);
      return;
    }
    onChange({
      ...trip,
      version: trip.version + 1,
      days: trip.days.map((items, i) =>
        i !== day ? items : items.map((x) => (x.id === itemId ? { ...x, locked } : x)),
      ),
    });
  };
  const beginResearch = async () => {
    setBusy(true);
    setError('');
    try {
      onChange(await api.createTrip(trip.input, trip.style, crypto.randomUUID()));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not research this trip.');
    } finally {
      setBusy(false);
    }
  };
  const knownItems = trip.days.flat().filter((item) => typeof item.cost === 'number');
  const knownSubtotal = knownItems.reduce((total, item) => total + (item.cost || 0), 0);
  const priced = (type: 'food' | 'discover') =>
    knownItems.some((item) => item.type === type)
      ? money(
          knownItems
            .filter((item) => item.type === type)
            .reduce((total, item) => total + (item.cost || 0), 0),
          trip.input.currency,
        ) + ' known'
      : 'Unknown';
  const destination = destinations.find((d) =>
    trip.input.destination.toLowerCase().includes(d.name.toLowerCase()),
  );
  const quietDay = () => {
    if (trip.serverOwned) {
      void perform('quiet');
      return;
    }
    onChange({
      ...trip,
      version: trip.version + 1,
      days: trip.days.map((items, i) =>
        i !== day ? items : items.filter((item) => item.time !== '16:00' || item.locked),
      ),
    });
  };
  const download = () => {
    const text = `${trip.input.destination}\n${trip.research ? 'Live source research · ' + trip.research.status : 'Local planning draft — not researched'}\n${styleSummary(trip.style)}\nBudget: ${money(Number(trip.input.budget), trip.input.currency)} ${trip.input.basis}\n\n${trip.days.map((items, i) => `DAY ${i + 1}\n${items.map((x) => `${x.time}${x.endTime ? '–' + x.endTime : ''} — ${x.title}${x.locked ? ' [locked]' : ''}\n${x.description}\n${x.verification || 'Unresearched'}`).join('\n\n')}`).join('\n\n')}\n\nSOURCES\n${trip.research?.evidence.map((e) => `${e.title}\n${e.url}\nRetrieved ${e.retrievedAt} via ${e.source}`).join('\n\n') || 'No live evidence'}\n\nVERIFICATION NOTES\n${trip.research?.gaps.join('\n') || 'All details need research.'}\n\nConfirm venues, routes, opening hours, prices, accessibility, and availability before travel.`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'my-travel-like-a-sole-draft.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="itinerary-page page-enter">
      <button className="text-button back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to my trips
      </button>
      <div
        className="itinerary-cover"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(10,40,33,.78),rgba(10,40,33,.12)),url(${destination?.image || '/images/hero.jpg'})`,
        }}
      >
        <div className="eyebrow">YOUR NEXT CHAPTER</div>
        <h1>
          {trip.input.destination.split(',')[0]},<br />
          <em>your way.</em>
        </h1>
        <div className="cover-details">
          <span>
            <CalendarDays size={16} />
            {tripDays(trip.input)} days ·{' '}
            {trip.input.dateMode === 'flexible'
              ? 'Flexible dates'
              : `${trip.input.startDate} — ${trip.input.endDate}`}
          </span>
          <span>
            <MapPin size={16} />
            {trip.input.travelers} {trip.input.travelers === 1 ? 'traveler' : 'travelers'}
          </span>
        </div>
        <span className="cover-draft">
          {researching
            ? 'Researching your escape'
            : trip.research?.evidence.length
              ? 'Sourced plan · review details'
              : trip.research
                ? 'Research needs attention'
                : 'Local planning draft'}
        </span>
      </div>
      <div className="itinerary-heading">
        <div>
          <h2>A little structure. Room for wonder.</h2>
          <p>{styleSummary(trip.style)}</p>
        </div>
        <div className="button-group">
          {trip.serverOwned && (
            <button
              className="button button-secondary"
              disabled={busy || researching || !trip.research?.candidates.length}
              onClick={() => perform('optimize')}
            >
              <Sparkles size={16} />
              {busy ? 'Updating…' : 'Improve recommendations'}
            </button>
          )}
          <button className="button button-secondary" onClick={download}>
            <Download size={16} />
            Export
          </button>
          <button className="button button-primary" onClick={onSave}>
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? 'Trip saved' : 'Save trip'}
          </button>
        </div>
      </div>
      {trip.research && <ResearchProgress trip={trip} onChange={onChange} />}
      {error && (
        <p className="form-error itinerary-error" role="alert">
          {error}
        </p>
      )}
      <div className="info-banner draft-notice">
        <Info size={18} />
        <p>
          <strong>
            {trip.research
              ? 'Your sources, your choices.'
              : 'Your starting point, ready to research.'}
          </strong>{' '}
          {trip.research
            ? 'Recommendations link to live research. Suggested times and transfer buffers are estimates; review source details, availability, and verification gaps before booking.'
            : 'This older draft uses placeholder ideas. Research it to find real places, stays, and experience options.'}
          {!trip.serverOwned && (
            <button className="text-button" disabled={busy} onClick={beginResearch}>
              Research this trip <RefreshCw size={14} />
            </button>
          )}
        </p>
      </div>
      <div className="itinerary-columns">
        <section className="daily-plan">
          <div className="day-tabs" aria-label="Itinerary days">
            {trip.days.map((_, i) => (
              <button
                key={i}
                aria-pressed={day === i}
                className={day === i ? 'active' : ''}
                onClick={() => setDay(i)}
              >
                Day {i + 1}
              </button>
            ))}
          </div>
          <div className="day-heading">
            <div>
              <span className="eyebrow">DAY {day + 1}</span>
              <h3>
                {day === 0
                  ? 'Settle in. Soak it all up.'
                  : [
                      'Small moments, big memories.',
                      'A new day, a little discovery.',
                      'Take the long way home.',
                    ][day % 3]}
              </h3>
            </div>
            <button
              className="text-button"
              onClick={quietDay}
              disabled={
                busy ||
                researching ||
                !trip.days[day].some((item) => item.time >= '15:00' && !item.locked)
              }
            >
              <Leaf size={15} />
              Make quieter
            </button>
            {trip.serverOwned && (
              <button
                className="text-button"
                disabled={busy || researching}
                onClick={() => perform('reduce_cost')}
              >
                <Wallet size={14} />
                Reduce cost
              </button>
            )}
          </div>
          <p className="schedule-note">
            <Clock3 size={14} />
            Suggested times · confirm arrival, transfers, and venue hours
          </p>
          <div className="timeline">
            {trip.days[day].map((item) => {
              const Icon = item.type === 'food' ? Utensils : item.type === 'rest' ? Coffee : MapPin;
              return (
                <article
                  className={`timeline-item ${item.type === 'rest' ? 'rest-item' : ''}`}
                  key={item.id}
                >
                  <div className="timeline-time">
                    {item.time}
                    <span className="timeline-dot">
                      <Icon size={15} />
                    </span>
                  </div>
                  <div className="activity-card">
                    <div className="activity-topline">
                      <span className="activity-category">
                        {item.type === 'rest'
                          ? 'A LITTLE BREATHING ROOM'
                          : item.type === 'food'
                            ? 'TASTE THE LOCAL LIFE'
                            : 'FOLLOW YOUR CURRENT'}
                      </span>
                      <button
                        className={`icon-button ${item.locked ? 'locked' : ''}`}
                        aria-label={`${item.locked ? 'Unlock' : 'Lock'} ${item.title}`}
                        aria-pressed={item.locked}
                        disabled={busy || researching}
                        onClick={() => lock(item.id, !item.locked)}
                      >
                        {item.locked ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}
                      </button>
                    </div>
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                    {item.fitReason && (
                      <p className="activity-fit">
                        <Sparkles size={12} />
                        {item.fitReason}
                      </p>
                    )}
                    {item.ranking && (
                      <details className="recommendation-reason">
                        <summary>Why Sole picked this</summary>
                        <ul>
                          {item.ranking.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                        {item.ranking.caveats.length > 0 && <p>{item.ranking.caveats.join(' ')}</p>}
                      </details>
                    )}
                    {(item.transferMinutes || 0) > 0 && (
                      <p className="activity-transfer">
                        <Map size={12} />
                        {item.transferMinutes} min transfer allowance · route needs confirmation
                      </p>
                    )}
                    {item.candidateId && (
                      <div className="activity-evidence">
                        <span className="verification-label">
                          Source reported · confirm trip details
                        </span>
                        {trip.research?.candidates
                          .filter((candidate) => candidate.id === item.candidateId)
                          .map((candidate) => (
                            <a
                              className="text-button"
                              key={candidate.id}
                              href={candidate.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Source & details
                              <ExternalLink size={12} />
                            </a>
                          ))}
                      </div>
                    )}
                    <div className="activity-bottom">
                      <span>
                        <Footprints size={14} />
                        {item.effort}
                      </span>
                      {item.type !== 'rest' && (
                        <button
                          className="text-button"
                          disabled={item.locked || busy || researching}
                          onClick={() =>
                            trip.serverOwned
                              ? perform('swap', item.id)
                              : onChange(swapItem(trip, day, item.id))
                          }
                        >
                          <RefreshCw size={14} />
                          Swap activity
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {trip.research && (
            <div className="comparison-sections">
              {(
                [
                  { category: 'stay', label: 'Stays to consider' },
                  { category: 'transport', label: 'Getting there & getting around' },
                  { category: 'event', label: 'Culture & events' },
                  { category: 'attraction', label: 'More researched alternatives' },
                ] as const
              ).map(({ category, label }) => (
                <details className="comparison-block" key={category}>
                  <summary>
                    {label}
                    <span>
                      {trip.research!.candidates.filter((c) => c.category === category).length}{' '}
                      options
                    </span>
                  </summary>
                  {trip
                    .research!.candidates.filter((c) => c.category === category)
                    .map((candidate) => (
                      <article key={candidate.id}>
                        <span className="eyebrow">
                          {candidate.source} · {candidate.category}
                        </span>
                        <h4>{candidate.name}</h4>
                        <p>{candidate.description}</p>
                        {candidate.ranking?.caveats.some((note) =>
                          note.includes('selected destination'),
                        ) && (
                          <p className="field-note">
                            Location is not established for this destination. Confirm it before
                            considering this option.
                          </p>
                        )}
                        <p className="field-note">
                          {candidate.price.amount !== null
                            ? `${money(candidate.price.amount, candidate.price.currency)} / ${candidate.price.unit.replace('_', ' ')} · ${candidate.price.status === 'observed_for_dates' ? 'observed for dates' : 'generic listed price; availability unverified'}`
                            : 'Exact price and availability need checking.'}
                        </p>
                        {candidate.gaps.length > 0 && (
                          <p className="field-note">{candidate.gaps.slice(0, 2).join(' ')}</p>
                        )}
                        <a
                          className="text-button"
                          href={candidate.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {candidate.category === 'stay' ? 'Search availability' : 'Inspect source'}
                          <ExternalLink size={13} />
                        </a>
                      </article>
                    ))}
                  {!trip.research!.candidates.some((c) => c.category === category) && (
                    <p className="field-note">
                      No usable options were extracted in this category. Inspect the research gaps
                      or retry missing research.
                    </p>
                  )}
                </details>
              ))}
            </div>
          )}
        </section>
        <aside className="trip-aside">
          <div className="budget-card">
            <span className="eyebrow">
              <Wallet size={15} /> YOUR BUDGET
            </span>
            <h3>
              {money(Number(trip.input.budget), trip.input.currency)}
              <small> / {trip.input.basis === 'per person' ? 'person' : 'group'}</small>
            </h3>
            <p>
              {money(budgetTotal(trip.input), trip.input.currency)} total for {trip.input.travelers}{' '}
              {trip.input.travelers === 1 ? 'traveler' : 'travelers'}
            </p>
            <div className="budget-line" />
            <div className="budget-row">
              <span>
                <BedDouble size={16} />
                Accommodation
              </span>
              <span>Exact total unknown</span>
            </div>
            <div className="budget-row">
              <span>
                <Utensils size={16} />
                Known meal prices
              </span>
              <span>{priced('food')}</span>
            </div>
            <div className="budget-row">
              <span>
                <Map size={16} />
                Local transport
              </span>
              <span>Exact total unknown</span>
            </div>
            <div className="budget-line" />
            <div className="budget-row">
              <strong>Known activity subtotal</strong>
              <strong>
                {knownItems.length ? money(knownSubtotal, trip.input.currency) : 'Unknown'}
              </strong>
            </div>
            <p className="field-note">
              {Math.max(0, tripDays(trip.input) - 1)} accommodation nights.{' '}
              {trip.input.transportIncluded
                ? 'Travel to destination is included in your budget.'
                : 'Travel to destination is outside your budget.'}{' '}
              Unknown costs aren’t treated as zero. The complete trip total is not yet verified
              within your budget.
            </p>
          </div>
          <div className="sole-tip">
            <Sole />
            <h4>A plan is just the beginning.</h4>
            <p>The best travel days leave a little space for the unexpected.</p>
            <span>— Sole, your travel companion</span>
          </div>
          <div className="aside-links">
            <button onClick={() => onInfo('sources')}>
              <ShieldCheck size={18} />
              <span>
                Research & sources
                <small>
                  {trip.research
                    ? `${trip.research.evidence.length} source records & verification notes`
                    : 'What still needs checking'}
                </small>
              </span>
              <ArrowUpRight size={17} />
            </button>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.input.destination)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Map size={18} />
              <span>
                Explore the area<small>Open in Google Maps</small>
              </span>
              <ExternalLink size={15} />
            </a>
            <button onClick={() => onInfo('watch')}>
              <Sparkles size={18} />
              <span>
                Watch this trip
                <small>
                  {trip.serverOwned ? 'Opt in to useful trip updates' : 'Research this trip first'}
                </small>
              </span>
              <ChevronDown size={17} />
            </button>
          </div>
          {(trip.style.restrictions || trip.style.notes) && (
            <div className="requirements-card">
              <h4>
                <ShieldCheck size={17} />
                Your must-haves
              </h4>
              {trip.style.restrictions && <p>{trip.style.restrictions}</p>}
              {trip.style.notes && <p>{trip.style.notes}</p>}
              <small>Keep these visible while researching and booking.</small>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
