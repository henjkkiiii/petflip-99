import React, { useEffect, useMemo, useRef, useState } from 'react';
import { weightedPick, rand } from '../lib/rng.js';
import { sound } from '../lib/sound.js';
import { PetImage } from './PetImage.jsx';
import { GemAmount } from './GemAmount.jsx';

const TILE_WIDTH = 136;
const TILE_GAP = 10;
const TOTAL_TILES = 44;
const WINNER_INDEX = 36;

const TIER_GLOW = {
  normal: 'rgba(56, 217, 255, 0.35)',
  huge: 'rgba(168, 85, 247, 0.55)',
  titanic: 'rgba(255, 197, 49, 0.65)',
  gargantuan: 'rgba(236, 72, 153, 0.72)',
};

const TIER_SOLID = {
  normal: '#38d9ff',
  huge: '#a855f7',
  titanic: '#ffc531',
  gargantuan: '#ec4899',
};

function easeSuspense(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.06) {
    const u = t / 0.06;
    return 0.08 * u * u;
  }
  const u = (t - 0.06) / 0.94;
  return 0.08 + 0.92 * (1 - Math.pow(1 - u, 4.4));
}

export function CaseReel({
  items,
  winner,
  spinning,
  fast = false,
  compact = false,
  onDone,
}) {
  const wrapRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const [settled, setSettled] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Build 44-item strip whenever a new winner is locked in for a spin
  const strip = useMemo(() => {
    if (!items || items.length === 0) return [];
    const rares = items.filter((it) =>
      ['huge', 'titanic', 'gargantuan'].includes(it.tier)
    );
    const addNearMiss =
      winner?.tier === 'normal' && rares.length > 0 && rand() < 0.58;
    const nearMissSide = rand() < 0.5 ? WINNER_INDEX - 1 : WINNER_INDEX + 1;

    const arr = [];
    for (let i = 0; i < TOTAL_TILES; i++) {
      if (i === WINNER_INDEX && winner) {
        arr.push(winner);
      } else if (addNearMiss && i === nearMissSide) {
        arr.push(rares[Math.floor(rand() * rares.length)]);
      } else {
        arr.push(weightedPick(items, 'chance'));
      }
    }
    return arr;
  }, [items, winner]);

  useEffect(() => {
    if (!spinning || !winner || strip.length === 0) {
      return;
    }

    setSettled(false);

    const trackEl = trackRef.current;
    const wrapEl = wrapRef.current;
    const vpEl = viewportRef.current;
    if (!trackEl || !vpEl) return;

    trackEl.style.transition = 'none';
    trackEl.style.transform = 'translate3d(0px, 0, 0)';

    const durationMs = fast ? 1400 : 5800;
    let rafId = null;
    let freezeTimer = null;
    let snapTimer = null;
    let startRaf = null;
    let activeTileEl = null;
    let lastTier = '';

    startRaf = requestAnimationFrame(() => {
      const firstTile = trackEl.children[0];
      const tileW = firstTile ? firstTile.getBoundingClientRect().width : TILE_WIDTH;
      const trackStyle = window.getComputedStyle(trackEl);
      const gapPx = parseFloat(trackStyle.columnGap || trackStyle.gap) || TILE_GAP;
      const stepPx = Math.max(1, tileW + gapPx);
      const vpWidth = vpEl.clientWidth || 720;
      const centerOffset = vpWidth / 2 - tileW / 2;
      const centerX = -(WINNER_INDEX * stepPx - centerOffset);
      const jitter = (rand() - 0.5) * (tileW * 0.82);
      const landX = centerX + jitter;

      let startTime = null;
      let lastTickIdx = -1;

      const frame = (now) => {
        if (startTime === null) startTime = now;
        const elapsed = now - startTime;
        const rawT = Math.min(1, Math.max(0, elapsed / durationMs));
        const progress = easeSuspense(rawT);
        const x = landX * progress;

        trackEl.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;

        const markerInTrack = vpWidth / 2 - x;
        const idx = Math.floor(markerInTrack / stepPx);
        if (idx !== lastTickIdx && idx >= 0 && idx < TOTAL_TILES) {
          lastTickIdx = idx;
          activeTileEl?.classList.remove('reel-tile-active');
          activeTileEl = trackEl.children[idx] || null;
          activeTileEl?.classList.add('reel-tile-active');

          // Pitch-ramped tick sound + tease ping on late rares
          sound.tick(1.18 - rawT * 0.3);
          const passingTile = strip[idx];
          const passingTier = passingTile?.tier || 'normal';
          if (
            rawT > 0.55 &&
            ['huge', 'titanic', 'gargantuan'].includes(passingTier)
          ) {
            sound.tease();
          }

          if (wrapEl && passingTier !== lastTier) {
            lastTier = passingTier;
            wrapEl.style.setProperty('--reel-glow', TIER_GLOW[passingTier] || TIER_GLOW.normal);
          }
        }

        if (rawT < 1) {
          rafId = requestAnimationFrame(frame);
        } else {
          trackEl.style.transform = `translate3d(${landX.toFixed(2)}px, 0, 0)`;

          // Nail-biting freeze on edge before elastic snap to dead center
          freezeTimer = setTimeout(() => {
            if (!trackRef.current) return;
            void trackRef.current.offsetWidth;
            trackRef.current.style.transition =
              'transform 280ms cubic-bezier(0.22, 1.35, 0.36, 1)';
            trackRef.current.style.transform = `translate3d(${centerX.toFixed(2)}px, 0, 0)`;

            snapTimer = setTimeout(() => {
              activeTileEl?.classList.remove('reel-tile-active');
              activeTileEl = null;
              const winTier = winner?.tier || 'normal';
              if (wrapEl) {
                wrapEl.style.setProperty('--reel-glow', TIER_GLOW[winTier] || TIER_GLOW.normal);
              }
              setSettled(true);
              sound.reveal();
              onDoneRef.current?.(winner);
            }, 290);
          }, 130);
        }
      };

      rafId = requestAnimationFrame(frame);
    });

    return () => {
      if (startRaf) cancelAnimationFrame(startRaf);
      if (rafId) cancelAnimationFrame(rafId);
      if (freezeTimer) clearTimeout(freezeTimer);
      if (snapTimer) clearTimeout(snapTimer);
      activeTileEl?.classList.remove('reel-tile-active');
    };
  }, [spinning, winner, fast, strip]);

  const winTier = winner?.tier || 'normal';

  return (
    <div
      ref={wrapRef}
      className={`case-reel-wrap ${compact ? 'compact' : ''} ${
        settled ? `reel-settled reel-hit-${winTier}` : ''
      }`}
    >
      <div className="case-reel-accent-top" />
      <div className="case-reel-accent-bot" />

      {!compact && settled && winner?.name && (
        <div className={`reel-win-pill tier-badge tier-badge-${winTier}`}>
          {winner.name}
        </div>
      )}

      {settled && (
        <div
          className="reel-burst-layer"
          style={{ '--burst-color': TIER_SOLID[winTier] || TIER_SOLID.normal }}
        >
          <div className="reel-sunburst" />
          <div className="reel-shockwave" />
        </div>
      )}

      <div className="case-reel-marker" />

      <div className="case-reel-viewport" ref={viewportRef}>
        <div ref={trackRef} className="case-reel-track">
          {strip.map((pet, idx) => {
            const isWinTile = settled && idx === WINNER_INDEX;
            const isDimmed = settled && idx !== WINNER_INDEX;
            const tier = pet?.tier || 'normal';
            const isRare = ['huge', 'titanic', 'gargantuan'].includes(tier);

            return (
              <div
                key={idx}
                className={`tier-frame tier-${tier} reel-tile reel-tier-${tier} ${
                  isWinTile ? 'reel-tile-winner' : ''
                } ${isDimmed ? 'reel-tile-dimmed' : ''}`}
              >
                <div className="reel-tile-inner">
                  {isWinTile && isRare && <span className="reel-shine" />}
                  <div className="reel-spot" />
                  <PetImage
                    thumb={pet.thumb}
                    alt={pet.name}
                    size={compact ? 54 : 68}
                    lazy={false}
                  />
                  <div className="reel-tile-name" title={pet.name}>
                    {pet.name}
                  </div>
                  <div className="reel-tile-val">
                    <GemAmount value={pet.value} iconSize={12} />
                  </div>
                  <div className={`reel-rarity-bar bar-${tier}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="case-reel-vignette" />
    </div>
  );
}
