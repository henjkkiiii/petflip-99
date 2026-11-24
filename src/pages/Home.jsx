import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bomb,
  CircleDot,
  Coins,
  Crown,
  Dices,
  Disc,
  Flame,
  Gift,
  Layers,
  PackageOpen,
  Rocket,
  Spade,
  Sparkles,
  Swords,
  TrendingUp,
  Users,
} from 'lucide-react';
import ps99 from '../data/ps99.json';
import { GEM, GEM_BAG, TNT, img } from '../lib/assets.js';
import { PetImage } from '../components/PetImage.jsx';
import { GemAmount } from '../components/GemAmount.jsx';
import { LiveBets } from '../components/LiveBets.jsx';
import {
  useGame,
  DAILY_COOLDOWN_MS,
  STREAK_EXPIRE_MS,
  getLevelProgress,
} from '../store/useGame.js';
import { useAuth } from '../store/useAuth.js';
import { useBattles } from '../store/battles.js';
import { getEffectiveCratePrice, useSiteConfig } from '../store/siteConfig.js';
import { formatGems } from '../lib/format.js';

const FEATURED_GAMES = [
  {
    to: '/crash',
    title: 'Crash',
    sub: 'Up to 1000×',
    tag: 'HOT',
    art: img(ps99.showcase[0]?.thumb),
    icon: TrendingUp,
    g: 'linear-gradient(160deg, #1e3a8a, #0f172a)',
    glow: '#3b82f6',
  },
  {
    to: '/mines',
    title: 'Mines',
    sub: '1–24 Mines',
    tag: 'HOT',
    art: TNT,
    icon: Bomb,
    g: 'linear-gradient(160deg, #7f1d1d, #1c1017)',
    glow: '#ef4444',
  },
  {
    to: '/plinko',
    title: 'Plinko',
    sub: '16-Row Drops',
    tag: 'HOT',
    art: GEM,
    icon: CircleDot,
    g: 'linear-gradient(160deg, #0e7490, #0b1324)',
    glow: '#22d3ee',
  },
  {
    to: '/cases',
    title: 'PS99 Crates',
    sub: 'Real Pet RAP',
    tag: 'HOT',
    art: '/crates/cosmic-galaxy.png',
    icon: PackageOpen,
    g: 'linear-gradient(160deg, #6d28d9, #1a1033)',
    glow: '#8b5cf6',
  },
  {
    to: '/battles',
    title: 'Case Battles',
    sub: 'Live PvP Unbox',
    tag: 'HOT',
    art: '/crates/titanic-vault.png',
    icon: Swords,
    g: 'linear-gradient(160deg, #9d174d, #1b0f1f)',
    glow: '#ec4899',
  },
  {
    to: '/towers',
    title: 'Towers',
    sub: 'Climb for Gems',
    tag: 'ORIGINAL',
    art: GEM_BAG,
    icon: Layers,
    g: 'linear-gradient(160deg, #065f46, #0b1a17)',
    glow: '#10b981',
  },
  {
    to: '/roulette',
    title: 'Roulette',
    sub: '2× & 14× Green',
    tag: 'ORIGINAL',
    art: img(ps99.showcase[1]?.thumb),
    icon: Disc,
    g: 'linear-gradient(160deg, #9f1239, #170d14)',
    glow: '#f43f5e',
  },
  {
    to: '/coinflip',
    title: 'Coinflip',
    sub: 'Instant Duel',
    tag: 'ORIGINAL',
    art: img(ps99.showcase[2]?.thumb),
    icon: Coins,
    g: 'linear-gradient(160deg, #a16207, #1a140a)',
    glow: '#eab308',
  },
  {
    to: '/dice',
    title: 'Dice',
    sub: 'Custom Odds',
    tag: 'ORIGINAL',
    art: img(ps99.showcase[3]?.thumb),
    icon: Dices,
    g: 'linear-gradient(160deg, #1d4ed8, #0c1226)',
    glow: '#60a5fa',
  },
  {
    to: '/limbo',
    title: 'Limbo',
    sub: 'High Target ×',
    tag: 'ORIGINAL',
    art: img(ps99.showcase[4]?.thumb),
    icon: Rocket,
    g: 'linear-gradient(160deg, #5b21b6, #120c24)',
    glow: '#a78bfa',
  },
  {
    to: '/blackjack',
    title: 'Blackjack',
    sub: 'Beat Dealer 21',
    tag: 'ORIGINAL',
    art: img(ps99.showcase[5]?.thumb),
    icon: Spade,
    g: 'linear-gradient(160deg, #166534, #0a160f)',
    glow: '#22c55e',
  },
];

export function Home() {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const lastDaily = useGame((s) => s.lastDaily);
  const dailyStreak = useGame((s) => s.dailyStreak);
  const xp = useGame((s) => s.xp);
  const winStreak = useGame((s) => s.winStreak);
  const claimedRewards = useGame((s) => s.claimedRewards);
  const rooms = useBattles((s) => s.rooms);

  const crateDiscountPct = useSiteConfig((s) => s.crateDiscountPct);
  const cratePriceOverrides = useSiteConfig((s) => s.cratePriceOverrides);
  const [playersOnline] = useState(() => 180 + Math.floor(Math.random() * 91));
  const [gamePlayers] = useState(() =>
    FEATURED_GAMES.map(() => 14 + Math.floor(Math.random() * 55))
  );

  const heroPets = ps99.showcase.slice(0, 4);
  const popularCrates = ps99.crates;
  const topDrop = ps99.showcase[0]?.value || 0;

  const now = Date.now();
  const elapsed = now - lastDaily;
  const canDaily = lastDaily === 0 || elapsed >= DAILY_COOLDOWN_MS;
  const activeStreak = lastDaily > 0 && elapsed > STREAK_EXPIRE_MS ? 0 : dailyStreak || 0;
  const nextDay = (activeStreak % 7) + 1;

  const progress = getLevelProgress(xp);
  const levelRewards = ps99.economy?.levelRewards || [];
  const claimableMilestone = levelRewards.find(
    (m) => progress.level >= m.level && !claimedRewards.includes(m.level)
  );
  const nextMilestone = levelRewards.find((m) => !claimedRewards.includes(m.level));
  const hasReadyReward = Boolean(currentUserKey && (canDaily || claimableMilestone));

  const liveBattles = rooms.filter((r) => r.status === 'waiting' || r.status === 'playing');
  const openBattlesCount = rooms.filter((r) => r.status === 'waiting').length;

  return (
    <div>
      <section className="hero-banner">
        <div className="hero-beam" />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div className="hero-kicker">
            <Sparkles size={13} />
            <span>Pet Simulator 99 Play-Gem Arcade</span>
          </div>
          <h1 className="hero-title">
            PET SIM 99 <span className="grad-text">GEM GAMES</span>
          </h1>
          <p className="hero-sub">
            Open {ps99.crates.length} custom PS99 Crates with real pet drops, challenge live
            players in Case Battles, and play Crash, Mines, Plinko, Towers &amp; more.
          </p>
          <div className="hero-actions">
            <Link to="/cases" className="btn btn-lg btn-primary">
              <PackageOpen size={18} />
              <span>Open Crates</span>
              <ArrowRight size={17} />
            </Link>
            <Link to="/battles" className="btn btn-lg btn-purple">
              <Swords size={18} />
              <span>{openBattlesCount > 0 ? `Battles (${openBattlesCount} Open)` : 'Case Battles'}</span>
            </Link>
            <Link to="/rewards" className="btn btn-lg btn-gold">
              <Gift size={18} />
              <span>{canDaily ? `Claim Day ${nextDay}` : 'VIP Rewards'}</span>
            </Link>
          </div>

          <div className="hero-stats">
            <div className="hero-stat-chip">
              <span className="hero-stat-label">Players Online</span>
              <span className="hero-stat-val text-green">{playersOnline}</span>
            </div>
            <div className="hero-stat-chip">
              <span className="hero-stat-label">Crates</span>
              <span className="hero-stat-val text-purple">{ps99.crates.length}</span>
            </div>
            <div className="hero-stat-chip">
              <span className="hero-stat-label">Top Drop</span>
              <span className="hero-stat-val text-gem">{formatGems(topDrop)}</span>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-pedestal" />
          <motion.img
            src={GEM_BAG}
            alt="PS99 Diamond Bag"
            className="hero-bag"
            animate={{ y: [0, -10, 0], rotate: [-2, 2, -2] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          {heroPets.map((pet, idx) => {
            const positions = [
              { top: 4, left: '6%', size: 68 },
              { top: 10, right: '6%', size: 64 },
              { bottom: 4, left: '10%', size: 64 },
              { bottom: 6, right: '8%', size: 70 },
            ];
            const pos = positions[idx];
            return (
              <motion.div
                key={pet.name}
                className="hero-float-pet"
                style={{ top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right }}
                animate={{
                  y: [0, idx % 2 === 0 ? -12 : 10, 0],
                  rotate: [
                    idx % 2 === 0 ? -5 : 5,
                    idx % 2 === 0 ? 4 : -4,
                    idx % 2 === 0 ? -5 : 5,
                  ],
                }}
                transition={{
                  duration: 3.2 + idx * 0.45,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                title={`${pet.name} (${formatGems(pet.value)})`}
              >
                <div className={`tier-frame tier-${pet.tier || 'huge'} hero-pet-badge`}>
                  <div className="hero-pet-badge-inner">
                    <PetImage thumb={pet.thumb} alt={pet.name} size={pos.size} lazy={false} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {currentUserKey && (
        <div className="card lobby-session-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '1 1 260px' }}>
            <span className="rewards-vip-rank-pill" style={{ padding: '4px 10px', fontSize: 12 }}>
              <Crown size={14} />
              <span>Lvl {progress.level}</span>
            </span>

            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                <span className="text-muted">
                  {nextMilestone
                    ? `Next Milestone: Lvl ${nextMilestone.level} (+${formatGems(nextMilestone.reward)})`
                    : `Progress to Level ${progress.level + 1}`}
                </span>
                <strong className="text-gem">{Math.round(progress.pct * 100)}%</strong>
              </div>
              <div className="lobby-xp-track">
                <div
                  className="lobby-xp-fill"
                  style={{ width: `${Math.max(4, Math.round(progress.pct * 100))}%` }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {winStreak >= 2 && (
              <span className={`streak-pill ${winStreak >= 5 ? 'streak-hot' : ''}`}>
                <Flame size={13} />
                <span>{winStreak}× Win Streak</span>
              </span>
            )}
            <Link
              to="/rewards"
              className={`btn btn-sm ${hasReadyReward ? 'btn-gold' : 'btn-outline'}`}
            >
              <Gift size={14} />
              <span>{hasReadyReward ? 'Claim Reward!' : 'VIP Progress'}</span>
            </Link>
          </div>
        </div>
      )}

      {/* Live Case Battles Spotlight */}
      <div className="card lobby-battles-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Swords size={18} className="text-gold" />
            <strong style={{ fontSize: 15 }}>Live Case Battles Arena</strong>
            {openBattlesCount > 0 && (
              <span className="game-tag" style={{ background: 'rgba(34,211,122,0.16)', color: 'var(--green)' }}>
                {openBattlesCount} Open Now
              </span>
            )}
          </div>
          <Link to="/battles" className="btn btn-sm btn-primary">
            {liveBattles.length > 0 ? 'All Battles' : 'Create 1v1 Battle'} <ArrowRight size={14} />
          </Link>
        </div>

        {liveBattles.length > 0 ? (
          <div className="lobby-battles-list">
            {liveBattles.slice(0, 3).map((room) => {
              const filled = room.players.filter(Boolean).length;
              return (
                <Link key={room.id} to={`/battles/${room.id}`} className="lobby-battle-pill">
                  <span
                    className="game-tag"
                    style={{ background: 'rgba(255,197,49,0.16)', color: 'var(--gold)' }}
                  >
                    {room.mode}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {room.crates.slice(0, 3).map((c, idx) => (
                      <PetImage key={idx} thumb={c.icon} alt={c.name} size={26} />
                    ))}
                  </div>
                  <span className="text-muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Users size={12} /> {filled}/{room.seatsCount}
                  </span>
                  <GemAmount value={room.cost} iconSize={13} className="text-gem" />
                  <span
                    className="btn btn-sm btn-green"
                    style={{ padding: '4px 10px', fontSize: 11.5 }}
                  >
                    {room.status === 'waiting' ? 'Join' : 'Watch'}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            No open battle rooms yet — start a 1v1 or 4-player battle for online players to join, or
            call bots anytime on empty seats.
          </div>
        )}
      </div>

      <div className="section-head">
        <h2>
          <Flame size={20} className="text-gold" />
          <span>PETFLIP Originals</span>
        </h2>
      </div>

      <div className="poster-grid">
        {FEATURED_GAMES.map((g, idx) => {
          const BgIcon = g.icon;
          return (
            <Link
              key={g.to}
              to={g.to}
              className="poster-card"
              style={{ '--g': g.g, '--glow': g.glow }}
            >
              <div className="poster-top-row">
                <span
                  className={`poster-tag ${
                    g.tag === 'HOT' ? 'poster-tag-hot' : 'poster-tag-orig'
                  }`}
                >
                  {g.tag}
                </span>
                <span className="poster-players">
                  <span className="poster-dot" />
                  {gamePlayers[idx]}
                </span>
              </div>
              <BgIcon className="poster-bg-icon" />
              <img src={g.art} alt={g.title} className="poster-art" />
              <div className="poster-bottom-row">
                <div>
                  <div className="poster-title">{g.title}</div>
                  <div className="poster-sub">{g.sub}</div>
                </div>
                <span className="poster-play-pill">PLAY →</span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="section-head">
        <h2>
          <PackageOpen size={20} className="text-purple" />
          <span>Popular Crates</span>
        </h2>
        <Link to="/cases" className="btn btn-sm btn-outline">
          View All {ps99.crates.length} <ArrowRight size={14} />
        </Link>
      </div>

      <div className="popular-eggs-row">
        {popularCrates.map((crate) => {
          const sortedItems = [...(crate.items || [])].sort(
            (a, b) => (b.value || 0) - (a.value || 0)
          );
          const topItem = sortedItems[0];
          const top3 = sortedItems.slice(0, 3);
          const topTier = topItem?.tier || 'normal';
          const effPrice = getEffectiveCratePrice(crate, {
            crateDiscountPct,
            cratePriceOverrides,
          });
          const maxMult = topItem
            ? Math.max(1, Math.round(topItem.value / Math.max(1, effPrice)))
            : 1;

          return (
            <Link
              key={crate.id}
              to={`/cases/${crate.id}`}
              className={`egg-card egg-card-tier-${topTier}`}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  gap: 4,
                }}
              >
                <span className={`tier-badge tier-badge-${topTier === 'normal' ? 'huge' : topTier}`}>
                  {crate.tag}
                </span>
                {crateDiscountPct > 0 ? (
                  <span className="tier-badge tier-badge-titanic">-{crateDiscountPct}%</span>
                ) : (
                  <span className="egg-card-maxmult">Up to {maxMult.toLocaleString()}×</span>
                )}
              </div>
              <img
                src={crate.icon}
                alt={crate.name}
                className="egg-card-icon egg-wobble"
                style={{ width: 88, height: 88 }}
              />
              <div className="egg-card-name" title={crate.name}>
                {crate.name}
              </div>
              <div className="egg-card-top3">
                {top3.map((it) => (
                  <PetImage key={it.name} thumb={it.thumb} alt={it.name} size={22} />
                ))}
              </div>
              <div className="text-gem">
                <GemAmount value={effPrice} iconSize={14} />
              </div>
            </Link>
          );
        })}
      </div>

      <div style={{ marginTop: 26 }}>
        <LiveBets />
      </div>
    </div>
  );
}
