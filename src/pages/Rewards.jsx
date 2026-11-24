import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Gift,
  Lock,
  LogIn,
  RefreshCw,
  Sparkles,
  Ticket,
  TrendingUp,
} from 'lucide-react';
import ps99 from '../data/ps99.json';
import {
  DAILY_COOLDOWN_MS,
  STREAK_EXPIRE_MS,
  getLevel,
  useGame,
} from '../store/useGame.js';
import { useAuth } from '../store/useAuth.js';
import { useToast } from '../store/toast.js';
import { formatGems } from '../lib/format.js';
import { fetchLiveEconomy } from '../lib/rap.js';
import { fireConfetti } from '../lib/confetti.js';
import { sound } from '../lib/sound.js';
import { GemAmount } from '../components/GemAmount.jsx';
import { GemIcon } from '../components/GemIcon.jsx';

function formatDuration(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function Rewards() {
  const xp = useGame((s) => s.xp);
  const lastDaily = useGame((s) => s.lastDaily);
  const dailyStreak = useGame((s) => s.dailyStreak);
  const claimedRewards = useGame((s) => s.claimedRewards);
  const claimDaily = useGame((s) => s.claimDaily);
  const claimLevelReward = useGame((s) => s.claimLevelReward);

  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const redeemPromoCode = useAuth((s) => s.redeemPromoCode);
  const account = currentUserKey ? accounts[currentUserKey] || null : null;

  const pushToast = useToast((s) => s.push);

  const [economy, setEconomy] = useState(ps99.economy);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const level = getLevel(xp);

  const exclusiveNormalSet = useMemo(
    () =>
      new Set(
        (ps99.crates || []).flatMap((c) =>
          c.items.filter((i) => i.tier === 'normal').map((i) => i.name)
        )
      ),
    []
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - lastDaily;
  const remainingMs = lastDaily > 0 ? Math.max(0, DAILY_COOLDOWN_MS - elapsed) : 0;
  const canDaily = lastDaily === 0 || remainingMs === 0;
  const effectiveStreak =
    lastDaily > 0 && elapsed > STREAK_EXPIRE_MS ? 0 : dailyStreak || 0;
  const nextIdx = effectiveStreak % economy.dailyRewards.length;
  const currentReward = economy.dailyRewards[nextIdx];

  const benchmarks = economy.rapBenchmarks;

  const handleSyncRap = async () => {
    if (syncing) return;
    sound.click();
    setSyncing(true);
    try {
      const live = await fetchLiveEconomy(
        ps99.economy,
        ps99.crates?.[0]?.price || 0,
        exclusiveNormalSet
      );
      setEconomy(live);
      pushToast(
        `Synced live PS99 RAP! Cheapest Huge: ${formatGems(live.rapBenchmarks.cheapestHuge)}`,
        'success'
      );
    } catch {
      pushToast('Could not reach BIG Games RAP API right now; using cached RAP.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleDaily = () => {
    const res = claimDaily(economy.dailyRewards);
    if (res.ok) {
      if (res.pet) {
        sound.bigWin();
        fireConfetti(true);
        pushToast(
          `Claimed Day ${res.day}: +${formatGems(res.amount)} & Bonus ${res.pet.name}!`,
          'success'
        );
      } else {
        sound.win();
        fireConfetti(false);
        pushToast(`Claimed Day ${res.day} reward: +${formatGems(res.amount)} gems!`, 'success');
      }
    }
  };

  const handleRedeemPromo = async (e) => {
    e.preventDefault();
    setPromoError('');
    if (!account) {
      openAuthModal('login');
      return;
    }
    const clean = promoCode.trim().toUpperCase();
    if (!clean) {
      setPromoError('Enter a promo code first.');
      return;
    }
    if (redeeming) return;
    sound.click();
    setRedeeming(true);
    try {
      const res = await redeemPromoCode(clean);
      if (!res.ok) {
        sound.lose();
        setPromoError(res.error || 'Could not redeem promo code.');
      } else {
        sound.bigWin();
        fireConfetti(true);
        setPromoCode('');
        pushToast(`Redeemed "${res.code}" for +${formatGems(res.gems)} gems!`, 'success');
      }
    } finally {
      setRedeeming(false);
    }
  };

  const handleLevelClaim = (lvl, reward) => {
    if (claimLevelReward(lvl, reward)) {
      sound.bigWin();
      fireConfetti(true);
      pushToast(`Claimed Level ${lvl} reward (+${formatGems(reward)})!`, 'success');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Gift size={26} className="text-gold" />
            <span>Daily Rewards &amp; RAP Prizes</span>
          </h1>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            Small rewards calibrated automatically against real Pet Simulator 99 RAP values.
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-outline"
          disabled={syncing}
          onClick={handleSyncRap}
        >
          <RefreshCw size={15} className={syncing ? 'spin' : ''} />
          <span>{syncing ? 'Syncing RAP…' : 'Sync Live RAP'}</span>
        </button>
      </div>

      {/* 7-Day Daily Streak */}
      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div>
            <h2 style={{ fontSize: 19, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} className="text-gold" />
              <span>7-Day Daily Check-In</span>
            </h2>
            <div className="text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              Current streak: <strong className="text-gem">{effectiveStreak % 7}/7 days</strong> ·
              Resets if missed for 48h
            </div>
          </div>

          <button
            type="button"
            className="btn btn-lg btn-gold"
            disabled={!canDaily}
            onClick={handleDaily}
          >
            <Gift size={17} />
            <span>
              {canDaily
                ? `Claim Day ${currentReward.day} (+${formatGems(currentReward.gems)})`
                : `Next claim in ${formatDuration(remainingMs)}`}
            </span>
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(122px, 1fr))',
            gap: 10,
          }}
        >
          {economy.dailyRewards.map((item, idx) => {
            const completed = idx < (effectiveStreak % 7 === 0 && !canDaily && effectiveStreak > 0 ? 7 : effectiveStreak % 7);
            const isNext = idx === nextIdx && !completed;
            const isReady = isNext && canDaily;

            return (
              <div
                key={item.day}
                style={{
                  background: isReady
                    ? 'linear-gradient(160deg, rgba(255,197,49,0.18), rgba(79,107,255,0.12))'
                    : completed
                    ? 'rgba(34,211,122,0.1)'
                    : 'var(--bg-deep)',
                  border: `1px solid ${
                    isReady
                      ? 'var(--gold)'
                      : completed
                      ? 'rgba(34,211,122,0.45)'
                      : isNext
                      ? 'var(--primary)'
                      : 'var(--border)'
                  }`,
                  borderRadius: 12,
                  padding: '12px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  textAlign: 'center',
                  opacity: !completed && !isNext ? 0.7 : 1,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: isReady ? 'var(--gold)' : completed ? 'var(--green)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {completed ? (
                    <CheckCircle2 size={13} />
                  ) : !isNext ? (
                    <Lock size={12} />
                  ) : null}
                  <span>Day {item.day}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 15 }}>
                  <GemIcon size={16} />
                  <span>{formatGems(item.gems)}</span>
                </div>

                {item.bonusPet ? (
                  <span className="tier-badge tier-badge-huge">+ Bonus PS99 Pet</span>
                ) : (
                  <span className="text-muted" style={{ fontSize: 10.5 }}>
                    {completed ? 'Claimed' : isReady ? 'Ready!' : isNext ? 'Next up' : 'Locked'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live PS99 RAP Benchmarks */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <TrendingUp size={18} className="text-gem" />
            <span>Live PS99 RAP Pricing Reference</span>
          </div>
          <span className="text-muted" style={{ fontSize: 11.5 }}>
            Updated: {new Date(benchmarks.updatedAt).toLocaleString()}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: 10,
          }}
        >
          <div className="stat-box">
            <span className="text-muted">Cheapest Huge RAP</span>
            <GemAmount value={benchmarks.cheapestHuge} iconSize={14} className="text-gem" />
          </div>
          <div className="stat-box">
            <span className="text-muted">Median Huge RAP</span>
            <GemAmount value={benchmarks.medianHuge} iconSize={14} className="text-purple" />
          </div>
          <div className="stat-box">
            <span className="text-muted">Median Lootbox RAP</span>
            <GemAmount value={benchmarks.medianLootbox} iconSize={14} className="text-gold" />
          </div>
          <div className="stat-box">
            <span className="text-muted">Cheapest Crate</span>
            <GemAmount value={benchmarks.cheapestEgg} iconSize={14} />
          </div>
        </div>
      </div>

      {/* Redeem Promo Code */}
      <div className="card" style={{ padding: 20, marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ticket size={22} className="text-gold" />
          <div>
            <h2 style={{ fontSize: 19 }}>Redeem Promo Code</h2>
            <div className="text-muted" style={{ fontSize: 12.5 }}>
              Got a promo code from an admin or chat drop? Claim bonus gems below.
            </div>
          </div>
        </div>

        {promoError && (
          <div className="auth-error" style={{ marginBottom: 0 }}>
            <AlertCircle size={15} />
            <span>{promoError}</span>
          </div>
        )}

        {!account ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                sound.click();
                openAuthModal('login');
              }}
            >
              <LogIn size={16} /> Sign In to Redeem Codes
            </button>
          </div>
        ) : (
          <form onSubmit={handleRedeemPromo} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 220, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="Enter promo code (e.g. PETS250K)"
              maxLength={24}
              disabled={redeeming}
            />
            <button
              type="submit"
              className="btn btn-green"
              disabled={redeeming || !promoCode.trim()}
            >
              <Ticket size={16} />
              <span>{redeeming ? 'Redeeming…' : 'Redeem Code'}</span>
            </button>
          </form>
        )}
      </div>

      {/* Small Level Milestones */}
      <div className="section-head">
        <h2>
          <Award size={20} className="text-purple" />
          <span>Level Milestone Rewards (Your Level: {level})</span>
        </h2>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {economy.levelRewards.map((item) => {
          const unlocked = level >= item.level;
          const claimed = claimedRewards.includes(item.level);
          return (
            <div
              key={item.level}
              className="card"
              style={{
                padding: '13px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                  Level {item.level} — <span className="text-gem">{item.title}</span>
                </div>
                <div className="text-muted" style={{ fontSize: 12.5 }}>
                  Reward: <GemAmount value={item.reward} iconSize={13} />
                </div>
              </div>

              {claimed ? (
                <span className="game-tag" style={{ color: 'var(--green)' }}>
                  Claimed ✓
                </span>
              ) : (
                <button
                  type="button"
                  className={`btn btn-sm ${unlocked ? 'btn-green' : 'btn-outline'}`}
                  disabled={!unlocked}
                  onClick={() => handleLevelClaim(item.level, item.reward)}
                >
                  {unlocked ? 'Claim Reward' : `Reach Level ${item.level}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
