import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown } from 'lucide-react';
import { fireConfetti } from '../lib/confetti.js';
import { sound } from '../lib/sound.js';
import { PetImage } from './PetImage.jsx';
import { GemAmount } from './GemAmount.jsx';

export function MythicCutscene({ pet, crateIcon, onDone }) {
  // 'crack1' -> 'crack2' -> 'crack3' -> 'silhouette' -> 'reveal'
  const [stage, setStage] = useState('crack1');

  const isGarg =
    pet?.tier === 'gargantuan' || /^gargantuan\b/i.test(String(pet?.name || ''));

  useEffect(() => {
    if (!pet) return undefined;
    setStage('crack1');
    sound.mythicCutscene(isGarg);

    const t1 = setTimeout(() => setStage('crack2'), 500);
    const t2 = setTimeout(() => setStage('crack3'), 1000);
    const t3 = setTimeout(() => {
      setStage('silhouette');
      fireConfetti(true);
    }, 1500);
    const t4 = setTimeout(() => {
      setStage('reveal');
      fireConfetti(true);
    }, 1950);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [pet, isGarg]);

  if (!pet || typeof document === 'undefined') return null;

  const isCracking = stage === 'crack1' || stage === 'crack2' || stage === 'crack3';

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

      {isCracking ? (
        <div className="mythic-crack-stage">
          <div className={`mythic-crate-shake ${stage}`}>
            {crateIcon ? (
              <img src={crateIcon} alt="Crate" className="mythic-crate-img" />
            ) : (
              <div className="mythic-crate-fallback">
                <Crown size={72} />
              </div>
            )}
            <svg className="mythic-crack-svg" viewBox="0 0 200 200" aria-hidden="true">
              <path
                d="M100 18 L92 62 L114 82 L88 122 L106 168"
                className="crack-line c1"
              />
              {(stage === 'crack2' || stage === 'crack3') && (
                <path
                  d="M42 54 L84 86 L66 118 L118 142"
                  className="crack-line c2"
                />
              )}
              {stage === 'crack3' && (
                <path
                  d="M158 48 L116 84 L142 114 L96 156"
                  className="crack-line c3"
                />
              )}
            </svg>
          </div>
        </div>
      ) : (
        <div className="mythic-reveal-wrap">
          <div className="mythic-shockwave" />

          <div className={`mythic-pet-pedestal ${stage === 'silhouette' ? 'is-silhouette' : ''}`}>
            <div className="mythic-pet-halo" />
            <div className="mythic-pet-img-wrap">
              <PetImage thumb={pet.thumb} alt={pet.name} size={210} lazy={false} />
            </div>
          </div>

          {stage === 'reveal' && (
            <>
              <div className="mythic-tier-banner">
                <Crown size={18} />
                <span>{isGarg ? 'GARGANTUAN' : 'TITANIC'}</span>
                <Crown size={18} />
              </div>

              <h2 className="mythic-pet-name">{pet.name}</h2>

              <div className="mythic-pet-value">
                <GemAmount value={pet.value || 0} iconSize={24} />
                <span className="mythic-rap-tag">RAP</span>
              </div>

              <button
                type="button"
                className={`btn btn-lg ${isGarg ? 'btn-gold' : 'btn-primary'} mythic-claim-btn`}
                onClick={onDone}
              >
                Claim &amp; Continue
              </button>
            </>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
