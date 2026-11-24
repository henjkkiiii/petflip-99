import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Backpack,
  Bomb,
  CircleDot,
  Coins,
  Dices,
  Disc,
  Gift,
  Home,
  Layers,
  PackageOpen,
  Rocket,
  ShieldAlert,
  Spade,
  Swords,
  TrendingUp,
  User,
} from 'lucide-react';
import ps99 from '../data/ps99.json';
import { GEM, GEM_BAG } from '../lib/assets.js';
import { useAuth } from '../store/useAuth.js';
import { useBattles } from '../store/battles.js';
import { useSiteConfig } from '../store/siteConfig.js';
import { DAILY_COOLDOWN_MS, getLevel, useGame } from '../store/useGame.js';

const MAIN_LINKS = [
  { to: '/', label: 'Lobby', icon: Home },
  { to: '/cases', label: 'Crates', icon: PackageOpen },
  { to: '/battles', label: 'Case Battles', icon: Swords, badge: 'HOT' },
];

const GAME_LINKS = [
  { to: '/crash', label: 'Crash', icon: TrendingUp, live: true },
  { to: '/mines', label: 'Mines', icon: Bomb },
  { to: '/towers', label: 'Towers', icon: Layers },
  { to: '/plinko', label: 'Plinko', icon: CircleDot },
  { to: '/dice', label: 'Dice', icon: Dices },
  { to: '/limbo', label: 'Limbo', icon: Rocket },
  { to: '/coinflip', label: 'Coinflip', icon: Coins },
  { to: '/roulette', label: 'Roulette', icon: Disc, live: true },
  { to: '/blackjack', label: 'Blackjack', icon: Spade },
];

const ACCOUNT_LINKS = [
  { to: '/inventory', label: 'Inventory', icon: Backpack },
  { to: '/rewards', label: 'Rewards', icon: Gift },
  { to: '/profile', label: 'Profile', icon: User },
];

export function Sidebar() {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const isAdmin = Boolean(currentUserKey && accounts[currentUserKey]?.role === 'admin');

  const branding = useSiteConfig((s) => s.branding);
  const ui = useSiteConfig((s) => s.ui);
  const gamesEnabled = useSiteConfig((s) => s.games?.enabled || {});

  const rooms = useBattles((s) => s.rooms);
  const openBattlesCount = rooms.filter((r) => r.status === 'waiting').length;

  const lastDaily = useGame((s) => s.lastDaily);
  const xp = useGame((s) => s.xp);
  const claimedRewards = useGame((s) => s.claimedRewards);

  const level = getLevel(xp);
  const canDaily = Boolean(
    currentUserKey && (lastDaily === 0 || Date.now() - lastDaily >= DAILY_COOLDOWN_MS)
  );
  const hasMilestoneReady = Boolean(
    currentUserKey &&
      (ps99.economy?.levelRewards || []).some(
        (m) => level >= m.level && !claimedRewards.includes(m.level)
      )
  );
  const hasReadyReward = canDaily || hasMilestoneReady;

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar-logo">
        <div className="logo-gem-wrap">
          <img src={GEM} alt="PETFLIP 99" className="logo-gem" />
        </div>
        <div className="logo-text">
          <span className="logo-title">{branding?.siteName || 'PETFLIP'}</span>
          {branding?.siteSuffix && <span className="logo-99">{branding.siteSuffix}</span>}
        </div>
      </NavLink>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <div className="sidebar-heading">Explore</div>
          {MAIN_LINKS.map((item) => {
            const Icon = item.icon;
            const isBattles = item.to === '/battles';
            const badgeText = isBattles && openBattlesCount > 0 ? `${openBattlesCount} OPEN` : item.badge;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                title={item.label}
              >
                <span className="nav-icon">
                  <Icon size={17} />
                </span>
                <span className="nav-label">{item.label}</span>
                {badgeText && (
                  <span className={`nav-badge ${isBattles && openBattlesCount > 0 ? 'nav-badge-open' : ''}`}>
                    {badgeText}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-heading">Originals</div>
          {GAME_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                title={item.label}
              >
                <span className="nav-icon">
                  <Icon size={17} />
                </span>
                <span className="nav-label">{item.label}</span>
                {item.live && <span className="nav-live-pill">LIVE</span>}
              </NavLink>
            );
          })}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-heading">Account</div>
          {ACCOUNT_LINKS.map((item) => {
            const Icon = item.icon;
            const showClaim = item.to === '/rewards' && hasReadyReward;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                title={item.label}
              >
                <span className="nav-icon">
                  <Icon size={17} />
                </span>
                <span className="nav-label">{item.label}</span>
                {showClaim && <span className="nav-badge nav-badge-claim">CLAIM</span>}
              </NavLink>
            );
          })}

          {isAdmin && (
            <a
              href="/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
              title="Open Full Admin Dashboard in a new tab"
            >
              <span className="nav-icon">
                <ShieldAlert size={17} className="text-gold" />
              </span>
              <span className="nav-label">Admin Dashboard</span>
              <span className="nav-badge" style={{ background: 'rgba(255,197,49,0.2)', color: 'var(--gold)' }}>
                NEW TAB ↗
              </span>
            </a>
          )}
        </div>
      </div>

      {ui?.showPromoSidebar !== false && (
        <div className="sidebar-promo">
          <img src={GEM_BAG} alt="Daily Rewards" className="sidebar-promo-bag" />
          <div className="sidebar-promo-body">
            <div className="sidebar-promo-title">
              {hasReadyReward ? 'Reward Ready!' : 'Daily Rewards'}
            </div>
            <div className="sidebar-promo-sub">7-Day RAP Streak</div>
            <NavLink to="/rewards" className="btn btn-sm btn-gold" style={{ marginTop: 2 }}>
              {hasReadyReward ? 'Claim Now' : 'Open'}
            </NavLink>
          </div>
        </div>
      )}
    </aside>
  );
}
