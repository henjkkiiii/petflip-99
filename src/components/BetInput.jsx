import React, { useEffect, useState } from 'react';
import { parseGems, formatGems } from '../lib/format.js';
import { useGame } from '../store/useGame.js';
import { GemIcon } from './GemIcon.jsx';
import { sound } from '../lib/sound.js';

const CHIP_PRESETS = [
  { label: '100K', val: 100_000 },
  { label: '500K', val: 500_000 },
  { label: '1M', val: 1_000_000 },
  { label: '5M', val: 5_000_000 },
];

export function BetInput({ value, onChange, disabled = false, label = 'Bet Amount' }) {
  const balance = useGame((s) => s.balance);
  const [text, setText] = useState(formatGems(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(formatGems(value));
    }
  }, [value, focused]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setText(val);
    const parsed = parseGems(val);
    if (Number.isInteger(parsed) && parsed > 0) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseGems(text);
    if (Number.isInteger(parsed) && parsed > 0) {
      onChange(parsed);
      setText(formatGems(parsed));
    } else {
      setText(formatGems(value));
    }
  };

  const applyMultiplier = (factor) => {
    sound.click();
    if (factor === 'max') {
      const next = Math.max(1, Math.floor(balance));
      onChange(next);
      setText(formatGems(next));
      return;
    }
    const next = Math.max(1, Math.min(balance > 0 ? balance : 1e15, Math.round(value * factor)));
    onChange(next);
    setText(formatGems(next));
  };

  return (
    <div className="bet-input-group">
      <div className="bet-input-header">
        <span>{label}</span>
        <span className="text-muted">Bal: {formatGems(balance)}</span>
      </div>
      <div className="bet-input-row">
        <div className="bet-field-wrap">
          <GemIcon size={17} />
          <input
            type="text"
            className="bet-field"
            value={text}
            disabled={disabled}
            onFocus={() => setFocused(true)}
            onChange={handleInputChange}
            onBlur={handleBlur}
            placeholder="e.g. 2.5m"
          />
        </div>
        <div className="bet-quick-btns">
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={disabled}
            onClick={() => applyMultiplier(0.5)}
          >
            ½
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={disabled}
            onClick={() => applyMultiplier(2)}
          >
            2×
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={disabled}
            onClick={() => applyMultiplier('max')}
          >
            Max
          </button>
        </div>
      </div>

      <div className="bet-chip-presets">
        {CHIP_PRESETS.map((c) => (
          <button
            key={c.label}
            type="button"
            className={`bet-chip-btn ${value === c.val ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => {
              sound.click();
              onChange(c.val);
              setText(formatGems(c.val));
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
