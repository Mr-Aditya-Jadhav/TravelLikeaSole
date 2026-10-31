import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Clock3,
  ExternalLink,
  Info,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import Dialog from './Dialog';
import { api } from '../lib/api';
import type { Trip } from '../lib/planner';
import type { TripWatch } from '../lib/research';

export default function WatchDialog({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [watches, setWatches] = useState<TripWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [type, setType] = useState<'fetch' | 'search'>('fetch');
  const [target, setTarget] = useState(trip.research?.evidence[0]?.url || '');
  const [frequency, setFrequency] = useState('daily');
  const [consent, setConsent] = useState(false);
  const [delivery, setDelivery] = useState('server');
  const maxEnd =
    trip.input.dateMode === 'exact'
      ? trip.input.endDate
      : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [end, setEnd] = useState(maxEnd);
  useEffect(() => {
    let live = true;
    Promise.all([api.watches(trip.id), api.status()])
      .then(([next, status]) => {
        if (live) {
          setWatches(next);
          setDelivery(status.monitoringDelivery);
        }
      })
      .catch((error) => {
        if (live) setError(error.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [trip.id]);
  const act = async (watch: TripWatch, action: string, changeId?: string) => {
    setBusy(watch.id);
    setError('');
    try {
      const updated = await api.watchAction(watch.id, action, changeId ? { changeId } : {});
      setWatches((old) => old.map((x) => (x.id === updated.id ? updated : x)));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The watch could not be updated.');
    } finally {
      setBusy('');
    }
  };
  const create = async () => {
    if (!consent) return;
    setBusy('new');
    setError('');
    try {
      const watch = await api.createWatch(trip.id, {
        type,
        target,
        frequency,
        expiresAt: new Date(`${end}T23:59:59Z`).toISOString(),
        confirmed: true,
      });
      setWatches((old) => [watch, ...old.filter((x) => x.id !== watch.id)]);
      setConsent(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The watch could not be created.');
    } finally {
      setBusy('');
    }
  };
  const days = Math.max(1, Math.ceil((Date.parse(end + 'T23:59:59Z') - Date.now()) / 86400000));
  const checks = frequency === 'daily' ? 1 : 4;
  const changes = watches
    .flatMap((w) => w.changes.map((change) => ({ ...change, watch: w })))
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  return (
    <Dialog title="Watch this trip" onClose={onClose} wide>
      <div className="watch-dialog">
        <span className="eyebrow">
          <Bell size={16} />A LITTLE PEACE OF MIND
        </span>
        <h2>Keep an eye on your escape.</h2>
        <p>
          Watch public sources for useful changes. You choose what to track, how often, and when to
          stop. Your itinerary won’t change automatically.
        </p>
        {loading ? (
          <p className="loading-row">
            <LoaderCircle className="spin" size={17} />
            Loading your trip watches…
          </p>
        ) : (
          <>
            <div className="watch-existing">
              {watches.map((watch) => (
                <article className="watch-card" key={watch.id}>
                  <div className="watch-card-title">
                    <strong>
                      <span className={`watch-status ${watch.status}`} />
                      {watch.status}
                    </strong>
                    <span>
                      {watch.frequency === 'daily' ? 'Daily' : 'Every 6 hours'} · ends{' '}
                      {new Date(watch.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="watch-target">{watch.target}</p>
                  <p className="field-note">
                    {watch.delivery === 'server'
                      ? 'Scheduled by this server; the provider schedule stays paused.'
                      : 'Provider schedule with authenticated webhook delivery.'}
                    {watch.lastCheckedAt
                      ? ` Last checked ${new Date(watch.lastCheckedAt).toLocaleString()}.`
                      : ''}
                  </p>
                  {watch.lastError && <p className="form-error">{watch.lastError}</p>}
                  <div className="watch-actions">
                    {watch.status !== 'stopped' && (
                      <>
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => act(watch, 'run')}
                        >
                          <RefreshCw size={13} />
                          Check now ($0.005)
                        </button>
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => act(watch, watch.status === 'active' ? 'pause' : 'resume')}
                        >
                          {watch.status === 'active' ? <Pause size={13} /> : <Play size={13} />}{' '}
                          {watch.status === 'active' ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => act(watch, 'stop')}
                        >
                          <Square size={12} />
                          Stop
                        </button>
                      </>
                    )}
                    {busy === watch.id && <LoaderCircle className="spin" size={14} />}
                  </div>
                </article>
              ))}
            </div>
            <section className="watch-create">
              <h3>Choose what matters</h3>
              <div className="segmented">
                <button
                  className={type === 'fetch' ? 'active' : ''}
                  onClick={() => {
                    setType('fetch');
                    setTarget(trip.research?.evidence[0]?.url || '');
                  }}
                >
                  A source page
                </button>
                <button
                  className={type === 'search' ? 'active' : ''}
                  onClick={() => {
                    setType('search');
                    setTarget(`${trip.input.destination} travel closures cultural events`);
                  }}
                >
                  A local topic
                </button>
              </div>
              <label>
                {type === 'fetch' ? 'Source from this trip' : 'Topic to watch'}
                {type === 'fetch' ? (
                  <select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Choose a researched source</option>
                    {[
                      ...new Map(trip.research?.evidence.map((e) => [e.url, e]) || []).values(),
                    ].map((e) => (
                      <option key={e.url} value={e.url}>
                        {e.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    maxLength={2000}
                  />
                )}
              </label>
              <div className="form-grid">
                <label>
                  Check frequency
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                    <option value="daily">Daily (09:00 UTC on public hosting)</option>
                    <option value="six_hourly">Every 6 hours (UTC on public hosting)</option>
                  </select>
                </label>
                <label>
                  Stop watching on
                  <input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    max={maxEnd}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              <div className="info-banner">
                <Clock3 size={18} />
                <p>
                  {delivery === 'webhook'
                    ? 'Scheduled results will arrive through this server’s protected webhook.'
                    : 'Local watches run while this server is running. The provider schedule is paused to avoid duplicate charges. Due checks resume when the server restarts.'}{' '}
                  Watches expire automatically.
                </p>
              </div>
              <label className="remember-option">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  <strong>Watch this source with TinyFish</strong>
                  <small>
                    $0.005 per check, including the initial baseline. {checks} check(s)/day is about
                    ${(checks * 0.005).toFixed(3)}/day; up to roughly $
                    {(days * checks * 0.005 + 0.005).toFixed(2)} through the chosen end date. Manual
                    checks cost extra. Pause or stop anytime.
                  </small>
                </span>
              </label>
              <button
                className="button button-primary"
                disabled={!!busy || !consent || !target || !end}
                onClick={create}
              >
                {busy === 'new' ? <LoaderCircle className="spin" size={16} /> : <Bell size={16} />}
                Start watching
              </button>
            </section>
            <section className="watch-history">
              <h3>
                <ShieldCheck size={18} />
                Your change history
              </h3>
              {changes.length ? (
                changes.map((change) => (
                  <article
                    key={change.watch.id + change.id}
                    className={change.disposition === 'dismissed' ? 'dismissed' : ''}
                  >
                    <div className="source-meta">
                      <span>
                        {change.baseline
                          ? 'Baseline'
                          : change.relevant === true
                            ? 'Relevant update'
                            : 'Needs your review'}
                      </span>
                      <time>{new Date(change.detectedAt).toLocaleString()}</time>
                    </div>
                    <p>{change.summary}</p>
                    <div className="watch-actions">
                      {change.sourceUrl && (
                        <a
                          className="text-button"
                          href={change.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Inspect source
                          <ExternalLink size={13} />
                        </a>
                      )}
                      {!change.baseline && change.disposition === 'new' && (
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => act(change.watch, 'dismiss', change.id)}
                        >
                          <Check size={13} />
                          Reviewed
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <p className="field-note">
                  No checks yet. A baseline will appear when you start a watch. Unchanged checks and
                  irrelevant changes stay quiet.
                </p>
              )}
            </section>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="field-note">
          <Info size={12} /> Page changes don’t guarantee ticket or room availability. Recheck
          date-specific offers directly with the provider.
        </p>
      </div>
    </Dialog>
  );
}
