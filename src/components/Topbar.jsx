import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpCircle,
  Flame,
  LogIn,
  LogOut,
  MessageSquare,
  Plus,
  ShieldAlert,
  UserPlus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getLevelProgress, useGame } from '../store/useGame.js';
import { useAuth } from '../store/useAuth.js';
import { useToast } from '../store/toast.js';
import { formatGems } from '../lib/format.js';
import { GemAmount } from './GemAmount.jsx';
import { GemIcon } from './GemIcon.jsx';
import { sound } from '../lib/sound.js';

export function Topbar({
  onOpenDeposit,
  onOpenWithdraw,
  onToggleChat,
  chatOpen,
}) {
  const balance = useGame((s) => s.balance);
  const xp = useGame((s) => s.xp);
  const winStreak = useGame((s) => s.winStreak);
  const muted = useGame((s) => s.settings.muted);
  const toggleMuted = useGame((s) => s.toggleMuted);

  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const logout = useAuth((s) => s.logout);
  const pushToast = useToast((s) => s.push);

  const account = currentUserKey ? accounts[currentUserKey] || null : null;
  const isAdmin = account?.role === 'admin';

  const prevBalRef = useRef(balance);
  const prevKeyRef = useRef(currentUserKey);
  const [deltas, setDeltas] = useState([]);
  const timersRef = useRef([]);

  useEffect(() => {
    if (prevKeyRef.current !== currentUserKey) {
      prevKeyRef.current = currentUserKey;
      prevBalRef.current = balance;
      setDeltas([]);
      return;
    }

    const diff = balance - prevBalRef.current;
    prevBalRef.current = balance;
    if (diff === 0) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDeltas((prev) => [...prev.slice(-2), { id, diff }]);
    const t = setTimeout(() => {
      setDeltas((prev) => prev.filter((d) => d.id !== id));
    }, 950);
    timersRef.current.push(t);
  }, [balance, currentUserKey]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const { level } = getLevelProgress(xp);
  const initial = (account?.username?.[0] || 'P').toUpperCase();

  const handleLogout = () => {
    sound.click();
    logout();
    pushToast('Signed out.', 'info');
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        {account ? (
          <>
            <div className="wallet-wrap">
              <div className="wallet" title="Your gem balance">
                <GemIcon size={18} />
                <GemAmount
                  value={balance}
                  animate
                  flash
                  showIcon={false}
                  className="wallet-amount"
                />
                <button
                  type="button"
                  className="wallet-plus"
                  onClick={() => {
                    sound.click();
                    onOpenDeposit();
                  }}
                  aria-label="Deposit gems"
                  title="Deposit Play Gems"
                >
                  <Plus size={18} strokeWidth={2.8} />
                </button>
              </div>

              <div className="balance-deltas" aria-hidden="true">
                {deltas.map((d) => (
                  <span
                    key={d.id}
                    className={`balance-delta ${d.diff > 0 ? 'up' : 'down'}`}
                  >
                    {d.diff > 0 ? '+' : '-'}
                    {formatGems(Math.abs(d.diff))}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                sound.click();
                onOpenWithdraw();
              }}
              aria-label="Withdraw gems"
            >
              <ArrowUpCircle size={15} />
              <span className="hide-xs">Withdraw</span>
            </button>

            {winStreak >= 2 && (
              <span
                className={`streak-pill ${winStreak >= 5 ? 'streak-hot' : ''}`}
                title={`${winStreak} wins in a row!`}
              >
                <Flame size={13} />
                <span>{winStreak}×</span>
              </span>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                sound.click();
                openAuthModal('login');
              }}
            >
              <LogIn size={15} />
              <span>Log In</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                sound.click();
                openAuthModal('register');
              }}
            >
              <UserPlus size={15} />
              <span>Sign Up</span>
            </button>
          </div>
        )}
      </div>

      <div className="topbar-right">
        {account && (
          <>
            {isAdmin && (
              <a
                href="/#/admin"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-gold hide-sm"
                title="Open Full Admin Dashboard in a new tab"
              >
                <ShieldAlert size={15} />
                <span>Admin ↗</span>
              </a>
            )}

            <Link to="/profile" className="user-pill" title="View profile & stats">
              <div className="user-avatar-circle">{initial}</div>
              <div className="user-meta hide-sm">
                <span className="user-name">{account.username}</span>
                {isAdmin ? (
                  <span className="role-badge role-badge-admin">ADMIN</span>
                ) : (
                  <span className="user-lvl-chip">Lvl {level}</span>
                )}
              </div>
            </Link>
          </>
        )}

        <button
          type="button"
          className="icon-btn"
          onClick={toggleMuted}
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        {account && (
          <button
            type="button"
            className="icon-btn"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={17} />
          </button>
        )}

        <button
          type="button"
          className={`icon-btn chat-toggle-btn ${chatOpen ? 'active' : ''}`}
          onClick={onToggleChat}
          aria-label="Toggle live chat"
          title="Toggle live chat"
        >
          <MessageSquare size={18} />
        </button>
      </div>
    </header>
  );
}
