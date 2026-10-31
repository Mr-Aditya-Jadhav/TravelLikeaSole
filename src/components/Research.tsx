import {
  Check,
  Clock3,
  ExternalLink,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { Trip } from '../lib/planner';
import Dialog from './Dialog';
import { api } from '../lib/api';
import { useState } from 'react';

export const isResearching = (trip: Trip) =>
  ['queued', 'researching', 'validating'].includes(trip.research?.status || '');
export function ResearchProgress({
  trip,
  onChange,
}: {
  trip: Trip;
  onChange: (trip: Trip) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const research = trip.research;
  if (!research) return null;
  const active = isResearching(trip);
  const action = async (kind: 'retry' | 'cancel') => {
    setBusy(true);
    setError('');
    try {
      onChange(await api[kind](trip.id));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The request failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className={`research-progress ${active ? 'research-active' : ''}`}
      aria-label="Trip research progress"
    >
      <div className="research-progress-heading">
        {active ? (
          <LoaderCircle className="spin" size={20} />
        ) : research.status === 'failed' ? (
          <Info size={20} />
        ) : (
          <ShieldCheck size={20} />
        )}
        <div>
          <strong>{research.phase}</strong>
          <p>
            {active
              ? 'Sole is checking real sources. You can leave this screen and come back.'
              : `${research.evidence.length} source records · ${research.candidates.length} options · ${research.gaps.length} verification notes`}
          </p>
        </div>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => action(active ? 'cancel' : 'retry')}
        >
          {active ? <X size={14} /> : <RefreshCw size={14} />}{' '}
          {active ? 'Cancel' : 'Retry missing research'}
        </button>
      </div>
      <div className="research-api-stages">
        {['Search', 'Fetch', 'Agent', 'Browser'].map((kind) => {
          const event = [...research.events].reverse().find((e) => e.api === kind);
          return (
            <span key={kind} className={event?.status || 'waiting'}>
              {event?.status === 'running' ? (
                <LoaderCircle size={13} className="spin" />
              ) : event?.status === 'complete' ? (
                <Check size={13} />
              ) : (
                <Clock3 size={13} />
              )}{' '}
              {kind}
              {event?.status === 'partial' ? ' · needs review' : ''}
            </span>
          );
        })}
      </div>
      {research.events.length > 0 && (
        <p className="research-latest" role="status">
          {research.events.at(-1)?.message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function SourcesDialog({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const research = trip.research;
  return (
    <Dialog title="Research and sources" onClose={onClose} wide>
      <div className="sources-dialog">
        <span className="eyebrow">
          <ShieldCheck size={16} />
          RESEARCH YOU CAN INSPECT
        </span>
        <h2>A little evidence. A lot more clarity.</h2>
        <p>
          Source retrieval is evidence of what a page reported. Availability, allergy safety,
          accessibility, and exact trip costs may still need direct confirmation.
        </p>
        {!research ? (
          <div className="info-banner">
            <Info size={18} />
            <p>
              This older local draft has not been researched. Open the trip and select Research this
              trip.
            </p>
          </div>
        ) : (
          <>
            <div className="source-summary">
              <strong>
                {research.evidence.length}
                <small>source records</small>
              </strong>
              <strong>
                {research.candidates.length}
                <small>researched options</small>
              </strong>
              <strong>
                {research.status}
                <small>research status</small>
              </strong>
            </div>
            {research.ranking && (
              <div className="info-banner ranking-note">
                <Sparkles size={17} />
                <p>
                  Your interests, pace, practical visit details, source freshness, and comparable
                  prices guide each recommendation. Sole also looks for a varied mix and workable
                  timing. Locked items stay fixed when you improve the plan.
                </p>
              </div>
            )}
            <h3>What still needs checking</h3>
            <ul className="research-gaps">
              {research.gaps.map((gap, i) => (
                <li key={i}>
                  <Info size={14} />
                  {gap}
                </li>
              ))}
            </ul>
            <h3>Your source trail</h3>
            <div className="source-list">
              {research.evidence.map((e) => (
                <article key={e.id}>
                  <div className="source-meta">
                    <span>
                      {e.source} · {e.category}
                    </span>
                    <time dateTime={e.retrievedAt}>{new Date(e.retrievedAt).toLocaleString()}</time>
                  </div>
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.title}
                    <ExternalLink size={14} />
                  </a>
                  <p>{e.excerpt}</p>
                  <span className="source-domain">{new URL(e.url).hostname}</span>
                </article>
              ))}
            </div>
            <h3>Research history</h3>
            <ol className="research-history">
              {research.events.map((event) => (
                <li key={event.id}>
                  <span className={`research-event-dot ${event.status}`} />
                  <div>
                    <strong>
                      {event.api} · {event.status}
                    </strong>
                    <p>{event.message}</p>
                    <small>
                      {new Date(event.at).toLocaleTimeString()}
                      {event.providerId ? ` · Provider reference ${event.providerId}` : ''}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Dialog>
  );
}
