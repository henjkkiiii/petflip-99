import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Coins, Eye, Swords, X } from 'lucide-react';
import ps99 from '../data/ps99.json';
import { GEM } from '../lib/assets.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useAuth } from '../store/useAuth.js';
import { useCoinflips } from '../store/coinflips.js';
import { useToast } from '../store/toast.js';
import { BetInput } from '../components/BetInput.jsx';
import { GameLayout } from '../components/GameLayout.jsx';
import { GemAmount } from '../components/GemAmount.jsx';
import { PetImage } from '../components/PetImage.jsx';

export function Coinflip() {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const myAccount = currentUserKey ? accounts[currentUserKey] || null : null;
  const isAdmin = myAccount?.role === 'admin';

  const rooms = useCoinflips((s) => s.rooms);
  const createCoinflip = useCoinflips((s) => s.createCoinflip);
  const joinCoinflip = useCoinflips((s) => s.joinCoinflip);
  const callBot = useCoinflips((s) => s.callBot);
  const leaveCoinflip = useCoinflips((s) => s.leaveCoinflip);
  const settleCoinflip = useCoinflips((s) => s.settleCoinflip);

  const pushToast = useToast((s) => s.push);

  const [betAmount, setBetAmount] = useState(5_000_000);
  const [chosenSide, setChosenSide] = useState('diamond');
  const [activeId, setActiveId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [rotationDeg, setRotationDeg] = useState(0);

  const animatedIdsRef = useRef(new Set());
  const settledIdsRef = useRef(new Set());

  const hugeCoinPet = ps99.showcase.find((p) => p.tier === 'huge') || ps99.showcase[0];

  // Auto-select the user's active room if none is selected
  useEffect(() => {
    if (activeId && rooms.some((r) => r.id === activeId)) return;
    const mine = rooms.find(
      (r) =>
        r.status !== 'finished' &&
        (r.players || []).some((p) => p && !p.isBot && p.userKey === currentUserKey)
    );
    if (mine) {
      setActiveId(mine.id);
    }
  }, [rooms, activeId, currentUserKey]);

  const activeMatch = useMemo(
    () => (activeId ? rooms.find((r) => r.id === activeId) || null : null),
    [rooms, activeId]
  );

  // Trigger 3D coin flip animation & server settlement when a match enters 'flipping'
  useEffect(() => {
    if (!activeMatch || activeMatch.status !== 'flipping' || !activeMatch.outcome) return;
    if (animatedIdsRef.current.has(activeMatch.id)) return;
    animatedIdsRef.current.add(activeMatch.id);

    sound.flip();
    const extraSpins = 360 * 6;
    const targetFaceDeg = activeMatch.outcome === 'diamond' ? 0 : 180;
    setRotationDeg((prev) => {
      const base = prev - (prev % 360);
      return base + extraSpins + targetFaceDeg;
    });

    const elapsed = Math.max(0, Date.now() - (activeMatch.startedAt || Date.now()));
    const waitMs = Math.max(250, 2850 - elapsed);

    const timer = setTimeout(async () => {
      if (settledIdsRef.current.has(activeMatch.id)) return;
      settledIdsRef.current.add(activeMatch.id);

      const res = await settleCoinflip(activeMatch.id);
      const finalCf = res.coinflip || activeMatch;
      const mySeat = (finalCf.players || []).findIndex(
        (p) => p && !p.isBot && p.userKey === currentUserKey
      );
      sound.coin();
      if (mySeat !== -1) {
        if (mySeat === finalCf.winnerIdx) {
          sound.win();
          if (finalCf.bet >= 50_000_000) fireConfetti(true);
          pushToast(`Won Coinflip 1v1 (+${formatGems(finalCf.payout)})!`, 'success');
        } else {
          sound.lose();
          pushToast(`${finalCf.winnerName} won the Coinflip!`, 'error');
        }
      }
    }, waitMs);

    return () => clearTimeout(timer);
  }, [activeMatch, currentUserKey, settleCoinflip, pushToast]);

  const handleCreate = async () => {
    if (submitting) return;
    sound.click();
    setSubmitting(true);
    try {
      const res = await createCoinflip({ bet: betAmount, side: chosenSide });
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not create Coinflip 1v1.', 'error');
        return;
      }
      if (res.coinflip?.id) setActiveId(res.coinflip.id);
      pushToast('Coinflip 1v1 created! Waiting for opponent or Call Bot.', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (cf) => {
    if (submitting) return;
    sound.click();
    setSubmitting(true);
    try {
      const res = await joinCoinflip(cf.id);
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not join Coinflip.', 'error');
        return;
      }
      setActiveId(cf.id);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCallBot = async (cf) => {
    if (submitting) return;
    sound.click();
    setSubmitting(true);
    try {
      const res = await callBot(cf.id);
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not call bot.', 'error');
        return;
      }
      setActiveId(cf.id);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeave = async (cf) => {
    if (submitting) return;
    sound.click();
    setSubmitting(true);
    try {
      const res = await leaveCoinflip(cf.id);
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not cancel Coinflip.', 'error');
        return;
      }
      if (activeId === cf.id) setActiveId(null);
      pushToast('Coinflip cancelled & bet refunded!', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  const p0 = activeMatch?.players?.[0] || null;
  const p1 = activeMatch?.players?.[1] || null;
  const canControlActive = Boolean(
    activeMatch &&
      activeMatch.status === 'waiting' &&
      (activeMatch.creatorKey === currentUserKey || isAdmin)
  );
  const canJoinActive = Boolean(
    activeMatch &&
      activeMatch.status === 'waiting' &&
      currentUserKey &&
      activeMatch.creatorKey !== currentUserKey
  );

  const openRooms = rooms.filter((r) => r.status === 'waiting');

  return (
    <GameLayout
      title="Coinflip 1v1"
      subtitle="Diamond vs Huge — Real PvP 1v1 coin toss paying 1.76× (or Call Bot!)"
      icon={<Coins size={26} className="text-gold" />}
      controls={
        <>
          <BetInput value={betAmount} onChange={setBetAmount} disabled={submitting} />

          <div className="field-label">
            <span>Pick Your Side</span>
            <div className="seg-group">
              <button
                type="button"
                disabled={submitting}
                className={`seg-btn ${chosenSide === 'diamond' ? 'active' : ''}`}
                onClick={() => {
                  sound.click();
                  setChosenSide('diamond');
                }}
              >
                💎 Diamond
              </button>
              <button
                type="button"
                disabled={submitting}
                className={`seg-btn ${chosenSide === 'huge' ? 'active' : ''}`}
                onClick={() => {
                  sound.click();
                  setChosenSide('huge');
                }}
              >
                🐾 Huge
              </button>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-lg btn-gold"
            disabled={submitting}
            onClick={handleCreate}
          >
            <Swords size={17} />
            <span>Create 1v1 (1.76×)</span>
          </button>

          <div className="stat-box">
            <span className="text-muted">Win Payout</span>
            <strong className="text-green">{formatGems(Math.round(betAmount * 1.76))}</strong>
          </div>
        </>
      }
      board={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="coin-stage">
            <div className="coin-3d" style={{ transform: `rotateY(${rotationDeg}deg)` }}>
              <div className="coin-face coin-front">
                <img src={GEM} alt="Diamond" style={{ width: 64, height: 64 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#03202e' }}>DIAMOND</span>
              </div>
              <div className="coin-face coin-back">
                <PetImage thumb={hugeCoinPet?.thumb} alt="Huge" size={66} lazy={false} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>HUGE</span>
              </div>
            </div>

            <div style={{ marginTop: 16, textAlign: 'center', minHeight: 28 }}>
              {!activeMatch && (
                <span className="text-muted">
                  Create a 1v1 Coinflip or join an open room below
                </span>
              )}
              {activeMatch?.status === 'waiting' && p0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <span className="text-gem" style={{ fontWeight: 700 }}>
                    {p0.name} ({p0.side.toUpperCase()}) vs Open Seat — <GemAmount value={activeMatch.bet} iconSize={13} />
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {canControlActive && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-gold"
                          disabled={submitting}
                          onClick={() => handleCallBot(activeMatch)}
                        >
                          <Bot size={14} /> Call Bot
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-red"
                          disabled={submitting}
                          onClick={() => handleLeave(activeMatch)}
                        >
                          <X size={14} /> Cancel &amp; Refund
                        </button>
                      </>
                    )}
                    {canJoinActive && (
                      <button
                        type="button"
                        className="btn btn-sm btn-green"
                        disabled={submitting}
                        onClick={() => handleJoin(activeMatch)}
                      >
                        Join 1v1 ({formatGems(activeMatch.bet)})
                      </button>
                    )}
                  </div>
                </div>
              )}
              {activeMatch?.status === 'flipping' && p0 && p1 && (
                <span style={{ fontWeight: 700 }}>
                  {p0.name} ({p0.side.toUpperCase()}) vs {p1.name} ({p1.side.toUpperCase()}) — Flipping!
                </span>
              )}
              {activeMatch?.status === 'finished' && activeMatch.outcome && (
                <span
                  className={
                    activeMatch.players?.[activeMatch.winnerIdx]?.userKey === currentUserKey
                      ? 'text-green'
                      : 'text-gold'
                  }
                  style={{ fontWeight: 700, fontSize: 16 }}
                >
                  {activeMatch.outcome.toUpperCase()} landed — {activeMatch.winnerName} won{' '}
                  {formatGems(activeMatch.payout)}!
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13.5 }}>
                Coinflip 1v1 Rooms ({openRooms.length} Open)
              </strong>
              <span className="text-muted" style={{ fontSize: 12 }}>
                Live PvP · Call Bot anytime
              </span>
            </div>

            {rooms.length === 0 ? (
              <div
                className="text-muted"
                style={{
                  textAlign: 'center',
                  padding: '18px 12px',
                  fontSize: 13,
                  background: 'var(--panel-2)',
                  borderRadius: 10,
                }}
              >
                No Coinflip 1v1 rooms yet — create one on the left!
              </div>
            ) : (
              rooms.slice(0, 12).map((cf) => {
                const c0 = cf.players?.[0];
                const c1 = cf.players?.[1];
                const isCreatorOrAdmin = Boolean(
                  currentUserKey && (cf.creatorKey === currentUserKey || isAdmin)
                );
                return (
                  <div
                    key={cf.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'var(--panel-2)',
                      border:
                        activeId === cf.id
                          ? '1px solid var(--gold)'
                          : '1px solid var(--border)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span
                        className={`tier-badge ${
                          c0?.side === 'diamond' ? 'tier-badge-huge' : 'tier-badge-titanic'
                        }`}
                      >
                        {c0?.side === 'diamond' ? '💎 DIAMOND' : '🐾 HUGE'}
                      </span>
                      <strong>{c0?.name || cf.creatorName}</strong>
                      <span className="text-muted" style={{ fontSize: 12 }}>
                        vs
                      </span>
                      {c1 ? (
                        <strong>
                          {c1.isBot ? '🤖 ' : ''}
                          {c1.name}
                        </strong>
                      ) : (
                        <span className="text-gem" style={{ fontSize: 12.5, fontWeight: 600 }}>
                          Open Seat
                        </span>
                      )}
                      {cf.status === 'finished' && (
                        <span className="text-green" style={{ fontSize: 12, fontWeight: 700 }}>
                          · {cf.winnerName} won!
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <GemAmount value={cf.bet} iconSize={14} />

                      {cf.status === 'waiting' && isCreatorOrAdmin && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-gold"
                            disabled={submitting}
                            onClick={() => handleCallBot(cf)}
                          >
                            <Bot size={13} /> Call Bot
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-red"
                            disabled={submitting}
                            onClick={() => handleLeave(cf)}
                          >
                            Cancel
                          </button>
                        </>
                      )}

                      {cf.status === 'waiting' && !isCreatorOrAdmin && (
                        <button
                          type="button"
                          className="btn btn-sm btn-green"
                          disabled={submitting}
                          onClick={() => handleJoin(cf)}
                        >
                          Join 1v1
                        </button>
                      )}

                      {cf.status !== 'waiting' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            sound.click();
                            setActiveId(cf.id);
                          }}
                        >
                          <Eye size={13} /> View
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      }
    />
  );
}
