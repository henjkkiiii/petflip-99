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
  ShieldCheck,
  Spade,
  Swords,
  TrendingUp,
  User,
} from 'lucide-react';
import { GEM, GEM_BAG } from '../lib/assets.js';
import { sound } from '../lib/sound.js';
import { useAuth } from '../store/useAuth.js';

const MAIN_LINKS = [
  { to: '/', label: 'Lobby', icon: Home },
  { to: '/cases', label: 'Crates', icon: PackageOpen, badge: '5% EDGE' },
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

export function Sidebar({ onOpenFairness }) {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const isAdmin = Boolean(currentUserKey && accounts[currentUserKey]?.role === 'admin');

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar-logo">
        <div className="logo-gem-wrap">
          <img src={GEM} alt="PETFLIP 99" className="logo-gem" />
        </div>
        <div className="logo-text">
          <span className="logo-title">PETFLIP</span>
          <span className="logo-99">99</span>
        </div>
      </NavLink>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <div className="sidebar-heading">Explore</div>
          {MAIN_LINKS.map((item) => {
            const Icon = item.icon;
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
                {item.badge && <span className="nav-badge">{item.badge}</span>}
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
              </NavLink>
            );
          })}

          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              title="Admin Panel"
            >
              <span className="nav-icon">
                <ShieldAlert size={17} className="text-gold" />
              </span>
              <span className="nav-label">Admin Panel</span>
              <span className="nav-badge" style={{ background: 'rgba(255,197,49,0.2)', color: 'var(--gold)' }}>
                ADMIN
              </span>
            </NavLink>
          )}

          <button
            type="button"
            className="nav-link"
            onClick={() => {
              sound.click();
              onOpenFairness?.();
            }}
            title="Provably Fair"
          >
            <span className="nav-icon">
              <ShieldCheck size={17} />
            </span>
            <span className="nav-label">Provably Fair</span>
          </button>
        </div>
      </div>

      <div className="sidebar-promo">
        <img src={GEM_BAG} alt="Daily Rewards" className="sidebar-promo-bag" />
        <div className="sidebar-promo-body">
          <div className="sidebar-promo-title">Daily Rewards</div>
          <div className="sidebar-promo-sub">7-Day RAP Streak</div>
          <NavLink to="/rewards" className="btn btn-sm btn-gold" style={{ marginTop: 2 }}>
            Open
          </NavLink>
        </div>
      </div>
    </aside>
  );
}
