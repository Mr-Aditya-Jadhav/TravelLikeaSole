import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Compass,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import Dialog from './Dialog';
import Sole from './Sole';
import StyleFields from './StyleFields';
import { destinations } from '../data';
import {
  buildDraft,
  localDate,
  money,
  styleSummary,
  tripDays,
  validateInput,
  type TravelStyle,
  type Trip,
  type TripInput,
} from '../lib/planner';

export default function Planner({
  initialInput,
  initialStyle,
  hasSavedStyle,
  onClose,
  onComplete,
  onSaveStyle,
}: {
  initialInput: TripInput;
  initialStyle: TravelStyle;
  hasSavedStyle: boolean;
  onClose: () => void;
  onComplete: (trip: Trip) => void;
  onSaveStyle: (style: TravelStyle) => void;
}) {
  const [step, setStep] = useState(0);
  const [input, setInput] = useState(initialInput);
  const [style, setStyle] = useState(initialStyle);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.closest('dialog')?.scrollTo({ top: 0 });
  }, [step]);
  const update = <K extends keyof TripInput>(key: K, value: TripInput[K]) => {
    setInput((old) => ({ ...old, [key]: value }));
    setError('');
  };
  const next = () => {
    const problem = validateInput(input);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setStep(step + 1);
  };
  const finish = () => {
    if (remember) onSaveStyle(style);
    onComplete(buildDraft(input, style));
  };
  return (
    <Dialog title="Plan your escape" onClose={onClose} wide>
      <div className="planner-header">
        <div className="eyebrow">
          <Compass size={15} /> A TRIP THAT FEELS LIKE YOU
        </div>
        <h2>
          {
            [
              'First, a little about your trip.',
              'Your way is the right way.',
              'Looking like your kind of escape.',
            ][step]
          }
        </h2>
        <p>
          {
            [
              'Big adventures start with a few small details.',
              'Choose what feels right. Everything here is optional.',
              'A quick look before your next chapter begins.',
            ][step]
          }
        </p>
      </div>
      <ol className="stepper">
        {['Your trip', 'Your travel style', 'Review & go'].map((label, i) => (
          <li
            key={label}
            className={i <= step ? 'active' : ''}
            aria-current={step === i ? 'step' : undefined}
          >
            <span>{i < step ? <Check size={14} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="planner-body" key={step} ref={bodyRef}>
        {step === 0 && (
          <>
            {hasSavedStyle && (
              <div className="inline-note">
                <Sole small />
                <span>
                  <strong>Same travel style, new destination?</strong> Your saved style is ready.
                  Adjust it in the next step for this trip.
                </span>
              </div>
            )}
            <div className="form-grid">
              <label>
                Where are you heading? <span className="required">*</span>
                <div className="input-icon">
                  <MapPin size={17} />
                  <input
                    list="planner-destinations"
                    value={input.destination}
                    onChange={(e) => update('destination', e.target.value)}
                    placeholder="City or region, country"
                  />
                </div>
                <datalist id="planner-destinations">
                  {destinations.map((d) => (
                    <option key={d.id} value={`${d.name}, ${d.country}`} />
                  ))}
                </datalist>
              </label>
              <label>
                Starting from <span className="optional">optional</span>
                <div className="input-icon">
                  <Compass size={17} />
                  <input
                    value={input.origin}
                    onChange={(e) => update('origin', e.target.value)}
                    placeholder="Your home city"
                  />
                </div>
              </label>
            </div>
            <fieldset>
              <legend>When’s your escape?</legend>
              <div className="segmented">
                <button
                  type="button"
                  className={input.dateMode === 'flexible' ? 'active' : ''}
                  onClick={() => update('dateMode', 'flexible')}
                >
                  I’m flexible
                </button>
                <button
                  type="button"
                  className={input.dateMode === 'exact' ? 'active' : ''}
                  onClick={() => update('dateMode', 'exact')}
                >
                  I have dates
                </button>
              </div>
              {input.dateMode === 'flexible' ? (
                <div className="duration-row">
                  <CalendarDays size={19} />
                  <span>A little getaway for</span>
                  <div className="counter">
                    <button
                      type="button"
                      disabled={input.duration <= 1}
                      aria-label="One fewer day"
                      onClick={() => update('duration', input.duration - 1)}
                    >
                      −
                    </button>
                    <strong>{input.duration}</strong>
                    <button
                      type="button"
                      disabled={input.duration >= 30}
                      aria-label="One more day"
                      onClick={() => update('duration', input.duration + 1)}
                    >
                      +
                    </button>
                  </div>
                  <span>days</span>
                </div>
              ) : (
                <div className="form-grid date-fields">
                  <label>
                    Departure
                    <input
                      type="date"
                      min={localDate()}
                      value={input.startDate}
                      onChange={(e) => update('startDate', e.target.value)}
                    />
                  </label>
                  <label>
                    Return
                    <input
                      type="date"
                      min={input.startDate || localDate()}
                      value={input.endDate}
                      onChange={(e) => update('endDate', e.target.value)}
                    />
                  </label>
                </div>
              )}
              <p className="field-note">
                {input.dateMode === 'flexible'
                  ? 'Flexible dates keep your plan provisional. Choose exact dates to check events and availability.'
                  : 'Departure and return dates are included in your trip length.'}
              </p>
            </fieldset>
            <fieldset>
              <legend>Who’s coming along?</legend>
              <div className="chips">
                {['Solo', 'Couple', 'Friends', 'Family'].map((label) => (
                  <button
                    type="button"
                    key={label}
                    aria-pressed={input.party === label}
                    className={`chip ${input.party === label ? 'selected' : ''}`}
                    onClick={() =>
                      setInput({
                        ...input,
                        party: label,
                        travelers:
                          label === 'Solo'
                            ? 1
                            : label === 'Couple'
                              ? 2
                              : Math.max(2, input.travelers),
                      })
                    }
                  >
                    <Users size={16} />
                    {label}
                  </button>
                ))}
              </div>
              {input.party !== 'Solo' && (
                <label className="travelers-input">
                  Number of travelers
                  <input
                    type="number"
                    min="2"
                    max="20"
                    value={input.travelers}
                    onChange={(e) => update('travelers', Number(e.target.value))}
                  />
                </label>
              )}
            </fieldset>
            <fieldset>
              <legend>
                What budget feels comfortable? <span className="required">*</span>
              </legend>
              <div className="budget-inputs">
                <select
                  aria-label="Budget currency"
                  value={input.currency}
                  onChange={(e) => update('currency', e.target.value)}
                >
                  {['INR', 'USD', 'EUR', 'GBP', 'IDR', 'JPY'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <div className="input-icon">
                  <Wallet size={17} />
                  <input
                    aria-label="Budget amount"
                    type="number"
                    min="1"
                    value={input.budget}
                    placeholder="Your budget"
                    onChange={(e) => update('budget', e.target.value)}
                  />
                </div>
                <select
                  aria-label="Budget basis"
                  value={input.basis}
                  onChange={(e) => update('basis', e.target.value as TripInput['basis'])}
                >
                  <option>per person</option>
                  <option>whole group</option>
                </select>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={input.transportIncluded}
                  onChange={(e) => update('transportIncluded', e.target.checked)}
                />
                Include travel to and from the destination
              </label>
            </fieldset>
          </>
        )}
        {step === 1 && <StyleFields value={style} onChange={setStyle} />}
        {step === 2 && (
          <>
            <div className="review-destination">
              <div className="review-location-icon">
                <MapPin size={28} />
              </div>
              <div>
                <span className="eyebrow">YOUR NEXT CHAPTER</span>
                <h3>{input.destination}</h3>
                <p>
                  {tripDays(input)} days · {Math.max(0, tripDays(input) - 1)} nights ·{' '}
                  {input.travelers} {input.travelers === 1 ? 'traveler' : 'travelers'} ·{' '}
                  {input.dateMode === 'flexible'
                    ? 'Flexible dates'
                    : `${input.startDate} — ${input.endDate}`}
                </p>
              </div>
              <button type="button" className="text-button" onClick={() => setStep(0)}>
                Edit
              </button>
            </div>
            <div className="review-block">
              <div className="section-title-row">
                <h4>Your travel style</h4>
                <button type="button" className="text-button" onClick={() => setStep(1)}>
                  Edit
                </button>
              </div>
              <p>{styleSummary(style)}</p>
              <div className="chips">
                {[style.pace, style.walking, style.atmosphere, style.stay, ...style.interests]
                  .filter(Boolean)
                  .map((item, i) => (
                    <span className="chip selected" key={`${item}-${i}`}>
                      {item}
                    </span>
                  ))}
              </div>
              {style.restrictions && (
                <p className="restriction-note">
                  <ShieldCheck size={16} />
                  Requirements: {style.restrictions}
                </p>
              )}
              {style.notes && <p className="field-note">Your note: {style.notes}</p>}
            </div>
            <div className="review-budget">
              <Wallet size={22} />
              <div>
                <strong>{money(Number(input.budget), input.currency)}</strong>
                <span>
                  {input.basis} · {input.transportIncluded ? 'including' : 'excluding'} travel to
                  destination
                </span>
              </div>
              <button type="button" className="text-button" onClick={() => setStep(0)}>
                Edit
              </button>
            </div>
            <label className="remember-option">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>
                <strong>Remember my travel style</strong>
                <small>
                  Save on this browser for your next escape. You can edit or delete it anytime.
                </small>
              </span>
            </label>
            <div className="info-banner">
              <Sparkles size={18} />
              <p>
                This creates an editable planning draft. Live research, prices, bookings, and trip
                monitoring aren’t connected yet.
              </p>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
      <div className="planner-footer">
        {step > 0 ? (
          <button className="button button-ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft size={16} />
            Back
          </button>
        ) : (
          <span className="privacy-note">
            <ShieldCheck size={15} />
            Your trip. Your choices.
          </span>
        )}
        <button className="button button-primary" onClick={step === 2 ? finish : next}>
          {['Find my travel style', 'Review my escape', 'Build my trip draft'][step]}
          {step === 2 ? <Sparkles size={17} /> : <ArrowRight size={17} />}
        </button>
      </div>
    </Dialog>
  );
}
