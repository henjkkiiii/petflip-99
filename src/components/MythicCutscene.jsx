import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Sparkles, Zap } from 'lucide-react';
import { formatGems } from '../lib/format.js';
import { fireConfetti } from '../lib/confetti.js';
import { sound } from '../lib/sound.js';
import { PetImage } from './PetImage.jsx';
import { GemAmount } from './GemAmount.jsx';

export function MythicCutscene({ pet, onDone }) {
  const [stage, setStage] = useState('charge'); // 'charge' | 'burst' | 'reveal'

  const isGarg =
    pet?.tier === 'gargantuan' || /^gargantuan\b/i.test(String(pet?.name || ''));

  useEffect(() => {
    if (!pet) return undefined;
    setStage('charge');
    sound.mythicCutscene(isGarg);

    const t1 = setTimeout(() => {
      setStage('burst');
      fireConfetti(true);
    }, 1100);

    const t2 = setTimeout(() => {
      setStage('reveal');
      if (isGarg) fireConfetti(true);
    }, 1550);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pet, isGarg]);

  if (!pet || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`mythic-cutscene ${isGarg ? 'mythic-gargantuan' : 'mythic-titanic'} stage-${stage}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="mythic-bg-rays" />
      <div className="mythic-flash-overlay" />

      <button type="button" className="mythic-skip-btn" onClick={onDone}>
        {stage === 'reveal' ? 'Continue →' : 'Skip →'}
      </button>

      {stage === 'charge' && (
        <div className="mythic-charge-wrap">
          <div className="mythic-warning-pill">
            <Zap size={16} />
            <span>
              {isGarg ? 'GARGANTUAN ANOMALY DETECTED' : 'TITANIC SIGNAL LOCKED'}
            </span>
          </div>
          <div className="mythic-orb-wrap">
            <div className="mythic-orb-ring" />
            <div className="mythic-orb-core">
              {isGarg ? <Crown size={48} /> : <Sparkles size={48} />}
            </div>
          </div>
          <div className="mythic-charge-sub">Unlocking vault…</div>
        </div>
      )}

      {stage !== 'charge' && (
        <div className="mythic-reveal-wrap">
          <div className="mythic-shockwave" />
          <div className="mythic-tier-banner">
            <Crown size={18} />
            <span>{isGarg ? 'GARGANTUAN UNBOXED' : 'TITANIC UNBOXED'}</span>
            <Crown size={18} />
          </div>

          <div className="mythic-pet-pedestal">
            <div className="mythic-pet-halo" />
            <div className="mythic-pet-img-wrap">
              <PetImage thumb={pet.thumb} alt={pet.name} size={170} lazy={false} />
            </div>
          </div>

          <h2 className="mythic-pet-name">{pet.name}</h2>

          <div className="mythic-pet-value">
            <GemAmount value={pet.value || 0} iconSize={24} />
            <span className="mythic-rap-tag">LIVE RAP</span>
          </div>

          {stage === 'reveal' && (
            <button
              type="button"
              className={`btn btn-lg ${isGarg ? 'btn-gold' : 'btn-primary'} mythic-claim-btn`}
              onClick={onDone}
            >
              Claim &amp; View Summary
            </button>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
