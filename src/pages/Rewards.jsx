import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Crown,
  Flame,
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
  getLevelProgress,
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
import { Modal } from '../components/Modal.jsx';
import { PetCard } from '../components/PetCard.jsx';

function formatDuration(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function getVipRank(level) {
  if (level >= 35) return 'Gargantuan VIP';
  if (level >= 20) return 'Titanic High-Roller';
  if (level >= 10) return 'Huge Hunter';
  if (level >= 5) return 'Diamond VIP';
  if (level >= 2) return 'Gem Collector';
  return 'Starter Member';
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
  const [dailyClaimedModal, setDailyClaimedModal] = useState(null);

  const level = getLevel(xp);
  const progress = getLevelProgress(xp);
  const vipRank = getVipRank(level);

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

  const claimableMilestones = economy.levelRewards.filter(
    (item) => level >= item.level && !claimedRewards.includes(item.level)
  ).length;

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
      setDailyClaimedModal({
        day: res.day,
        amount: res.amount,
        pet: res.pet || null,
      });
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
            <span>VIP Rewards &amp; Promo Vault</span>
          </h1>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            Climb VIP levels, keep your 7-day streak alive for a Bonus PS99 Pet, and claim promo drops.
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

      {/* VIP Rank & XP Hero Banner */}
      <div className="rewards-vip-hero">
        <div className="rewards-vip-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="rewards-vip-rank-pill">
              <Crown size={15} />
              <span>{vipRank}</span>
            </span>
            <strong style={{ fontSize: 16 }}>Level {level}</strong>
          </div>

          <div className="rewards-vip-badges">
            <span className="game-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Flame size={13} className="text-gold" />
              <span>{effectiveStreak % 7}/7 Streak</span>
            </span>
            {claimableMilestones > 0 && (
              <span
                className="game-tag"
                style={{
                  background: 'rgba(34, 211, 122, 0.16)',
                  color: 'var(--green)',
                  borderColor: 'rgba(34, 211, 122, 0.4)',
                }}
              >
                {claimableMilestones} {claimableMilestones === 1 ? 'Milestone' : 'Milestones'} Ready!
              </span>
            )}
          </div>
        </div>

        <div className="rewards-xp-bar-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span className="text-muted">XP Progress to Level {level + 1}</span>
            <span className="text-gem" style={{ fontWeight: 700 }}>
              {Math.round(progress.pct * 100)}% ({formatGems(progress.currentXp)} /{' '}
              {formatGems(progress.neededXp)} XP)
            </span>
          </div>
          <div className="rewards-xp-bar-track">
            <div
              className="rewards-xp-bar-fill"
              style={{ width: `${Math.max(3, Math.round(progress.pct * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 7-Day Daily Streak */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
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
              Claim every 24h · Reach Day 7 for extra gems + a Bonus PS99 Pet!
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

        <div className="rewards-daily-grid">
          {economy.dailyRewards.map((item, idx) => {
            const completed =
              idx <
              (effectiveStreak % 7 === 0 && !canDaily && effectiveStreak > 0
                ? 7
                : effectiveStreak % 7);
            const isNext = idx === nextIdx && !completed;
            const isReady = isNext && canDaily;
            const isFinale = Boolean(item.bonusPet || item.day === 7);

            return (
              <div
                key={item.day}
                className={`rewards-day-card ${isReady ? 'ready' : ''} ${
                  completed ? 'claimed' : ''
                } ${isFinale ? 'day-grand-finale' : ''}`}
                style={{ opacity: !completed && !isNext && !isFinale ? 0.72 : 1 }}
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

      {/* Redeem Promo Code */}
      <div className="card rewards-promo-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ticket size={22} className="text-gold" />
          <div>
            <h2 style={{ fontSize: 19 }}>Promo Code Vault</h2>
            <div className="text-muted" style={{ fontSize: 12.5 }}>
              Got a promo code from an admin or chat drop? Redeem instant bonus gems below.
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
          <form onSubmit={handleRedeemPromo} className="rewards-promo-form">
            <input
              className="input rewards-promo-input"
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

      {/* Level Milestones */}
      <div className="section-head">
        <h2>
          <Award size={20} className="text-purple" />
          <span>Level Milestone Rewards (Your Level: {level})</span>
        </h2>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 22 }}>
        {economy.levelRewards.map((item) => {
          const unlocked = level >= item.level;
          const claimed = claimedRewards.includes(item.level);
          const pct = Math.min(100, Math.round((level / Math.max(1, item.level)) * 100));
          return (
            <div key={item.level} className="card rewards-milestone-card">
              <div style={{ flex: '1 1 220px' }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                  Level {item.level} — <span className="text-gem">{item.title}</span>
                </div>
                <div className="text-muted" style={{ fontSize: 12.5 }}>
                  Reward: <GemAmount value={item.reward} iconSize={13} /> · Progress: Lvl{' '}
                  {Math.min(level, item.level)} / {item.level}
                </div>
                <div className="rewards-ms-bar-track">
                  <div className="rewards-ms-bar-fill" style={{ width: `${pct}%` }} />
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

      {/* Live PS99 RAP Reference (Compact) */}
      <div className="card" style={{ padding: 16 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
            <TrendingUp size={17} className="text-gem" />
            <span>Live PS99 RAP Reference</span>
          </div>
          <span className="text-muted" style={{ fontSize: 11.5 }}>
            Updated: {new Date(benchmarks.updatedAt).toLocaleString()}
          </span>
        </div>

        <div className="rewards-rap-grid">
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

      {/* Daily Claim Celebration Modal */}
      <Modal
        open={Boolean(dailyClaimedModal)}
        onClose={() => setDailyClaimedModal(null)}
        title={dailyClaimedModal ? `Day ${dailyClaimedModal.day} Reward Claimed!` : 'Reward Claimed'}
        maxWidth={420}
      >
        {dailyClaimedModal && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <div className="demo-badge" style={{ marginBottom: 0 }}>
              <Sparkles size={14} /> Daily Streak Reward
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }} className="text-gem">
              +{formatGems(dailyClaimedModal.amount)} Play Gems
            </div>
            {dailyClaimedModal.pet && (
              <div style={{ width: '100%', maxWidth: 210 }}>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  Day 7 Bonus PS99 Pet Added to Inventory:
                </div>
                <PetCard pet={dailyClaimedModal.pet} compact />
              </div>
            )}
            <button
              type="button"
              className="btn btn-lg btn-green"
              style={{ width: '100%' }}
              onClick={() => setDailyClaimedModal(null)}
            >
              Awesome!
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
