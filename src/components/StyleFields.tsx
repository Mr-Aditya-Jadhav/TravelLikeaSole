import { Check, Footprints, Leaf, Moon, Mountain, Sparkles, Sun, Users } from 'lucide-react';
import type { TravelStyle } from '../lib/planner';
import { interestOptions } from '../data';

export default function StyleFields({
  value,
  onChange,
}: {
  value: TravelStyle;
  onChange: (value: TravelStyle) => void;
}) {
  const choose = (key: keyof TravelStyle, choice: string) =>
    onChange({ ...value, [key]: value[key] === choice ? '' : choice });
  return (
    <div className="style-fields">
      <fieldset>
        <legend>What’s your kind of pace?</legend>
        <div className="selection-grid pace-grid">
          {[
            { label: 'Peaceful', subtitle: 'Less rush, more moments', icon: Moon },
            { label: 'Balanced', subtitle: 'A little of both worlds', icon: Sun },
            { label: 'Packed', subtitle: 'Make every moment count', icon: Sparkles },
          ].map(({ label, subtitle, icon: Icon }) => (
            <button
              type="button"
              key={label}
              aria-pressed={value.pace === label}
              className={`selection-card ${value.pace === label ? 'selected' : ''}`}
              onClick={() => choose('pace', label)}
            >
              <Icon size={23} />
              <strong>{label}</strong>
              <span>{subtitle}</span>
              {value.pace === label && <Check className="selection-check" size={15} />}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>
          What draws you in? <span>Pick as many as you like</span>
        </legend>
        <div className="chips">
          {interestOptions.map(({ label, icon: Icon }) => (
            <button
              type="button"
              key={label}
              aria-pressed={value.interests.includes(label)}
              className={`chip ${value.interests.includes(label) ? 'selected' : ''}`}
              onClick={() =>
                onChange({
                  ...value,
                  interests: value.interests.includes(label)
                    ? value.interests.filter((x) => x !== label)
                    : [...value.interests, label],
                })
              }
            >
              <Icon size={16} />
              {label}
              {value.interests.includes(label) && <Check size={13} />}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>How do you like to explore?</legend>
        <div className="chips">
          {[
            { label: 'Minimal walking', icon: Leaf },
            { label: 'Easy walks', icon: Footprints },
            { label: 'Long walks', icon: Footprints },
            { label: 'Hikes', icon: Mountain },
          ].map(({ label, icon: Icon }) => (
            <button
              type="button"
              key={label}
              aria-pressed={value.walking === label}
              className={`chip ${value.walking === label ? 'selected' : ''}`}
              onClick={() => choose('walking', label)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Food preferences
          <select value={value.food} onChange={(e) => onChange({ ...value, food: e.target.value })}>
            <option value="">No preference</option>
            {['Vegetarian', 'Vegan', 'Jain', 'Nonvegetarian', 'Flexible'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Your kind of stay
          <select value={value.stay} onChange={(e) => onChange({ ...value, stay: e.target.value })}>
            <option value="">No preference</option>
            {['Hostel', 'Simple private room', 'Boutique', 'Luxury'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Your ideal atmosphere</legend>
        <div className="chips">
          {['Quiet spaces', 'A mix', 'Meet people'].map((label) => (
            <button
              type="button"
              key={label}
              aria-pressed={value.atmosphere === label}
              className={`chip ${value.atmosphere === label ? 'selected' : ''}`}
              onClick={() => choose('atmosphere', label)}
            >
              <Users size={15} />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <details className="extra-details">
        <summary>Dietary restrictions, accessibility & other details</summary>
        <label>
          Allergies, food exclusions, or accessibility requirements
          <textarea
            placeholder="For example: no peanuts, step-free access, or a 20-minute walking limit"
            value={value.restrictions}
            onChange={(e) => onChange({ ...value, restrictions: e.target.value })}
          />
        </label>
        <p className="field-note">
          Allergy safety and accessibility need direct confirmation with each venue.
        </p>
        <label>
          Anything else Sole should keep in mind?
          <textarea
            placeholder="A birthday dinner, a quiet room, your wish to try pottery…"
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
          />
        </label>
      </details>
    </div>
  );
}
