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
  const destination = destinations.find((d) =>
    trip.input.destination.toLowerCase().includes(d.name.toLowerCase()),
  );
  const quietDay = () =>
    onChange({
      ...trip,
      version: trip.version + 1,
      days: trip.days.map((items, i) =>
        i !== day ? items : items.filter((item) => item.time !== '16:00' || item.locked),
      ),
    });
  const download = () => {
    const text = `${trip.input.destination}\nPlanning draft — not live-researched. All times are placeholders.\n${styleSummary(trip.style)}\nBudget: ${money(Number(trip.input.budget), trip.input.currency)} ${trip.input.basis}\n\n${trip.days.map((items, i) => `DAY ${i + 1}\n${items.map((x) => `${x.time} — ${x.title}${x.locked ? ' [locked]' : ''}\n${x.description}`).join('\n\n')}`).join('\n\n')}\n\nConfirm venues, routes, opening hours, prices, accessibility, and availability before travel.`;
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
        <span className="cover-draft">Planning draft</span>
      </div>
      <div className="itinerary-heading">
        <div>
          <h2>A little structure. Room for wonder.</h2>
          <p>{styleSummary(trip.style)}</p>
        </div>
        <div className="button-group">
          <button className="button button-secondary" onClick={download}>
            <Download size={16} />
            Export
          </button>
          <button className="button button-primary" onClick={onSave}>
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? 'Saved on this browser' : 'Save trip'}
          </button>
        </div>
      </div>
      <div className="info-banner draft-notice">
        <Info size={18} />
        <p>
          <strong>Your starting point, ready to make your own.</strong> This draft uses activity
          themes and placeholder times. Places, prices, routes, access, and availability haven’t
          been researched.
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
              disabled={!trip.days[day].some((item) => item.time === '16:00' && !item.locked)}
            >
              <Leaf size={15} />
              Make quieter
            </button>
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
                        onClick={() =>
                          onChange({
                            ...trip,
                            version: trip.version + 1,
                            days: trip.days.map((items, i) =>
                              i !== day
                                ? items
                                : items.map((x) =>
                                    x.id === item.id ? { ...x, locked: !x.locked } : x,
                                  ),
                            ),
                          })
                        }
                      >
                        {item.locked ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}
                      </button>
                    </div>
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                    <div className="activity-bottom">
                      <span>
                        <Footprints size={14} />
                        {item.effort}
                      </span>
                      {item.type !== 'rest' && (
                        <button
                          className="text-button"
                          disabled={item.locked}
                          onClick={() => onChange(swapItem(trip, day, item.id))}
                        >
                          <RefreshCw size={14} />
                          Swap idea
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
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
              <span>Not researched</span>
            </div>
            <div className="budget-row">
              <span>
                <Utensils size={16} />
                Food & experiences
              </span>
              <span>Not researched</span>
            </div>
            <div className="budget-row">
              <span>
                <Map size={16} />
                Local transport
              </span>
              <span>Not researched</span>
            </div>
            <div className="budget-line" />
            <div className="budget-row">
              <strong>Trip cost</strong>
              <strong>Unknown</strong>
            </div>
            <p className="field-note">
              {Math.max(0, tripDays(trip.input) - 1)} accommodation nights.{' '}
              {trip.input.transportIncluded
                ? 'Travel to destination is included in your budget.'
                : 'Travel to destination is outside your budget.'}{' '}
              Unknown costs aren’t treated as zero.
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
                Research & sources<small>What still needs checking</small>
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
                Watch this trip<small>Live monitoring isn’t connected</small>
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
