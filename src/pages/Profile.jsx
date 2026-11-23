import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, LogIn, LogOut, RotateCcw, ShieldAlert, User, UserPlus } from 'lucide-react';
import { getLevelProgress, useGame } from '../store/useGame.js';
import { useAuth } from '../store/useAuth.js';
import { useToast } from '../store/toast.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { GemAmount } from '../components/GemAmount.jsx';
import { Modal } from '../components/Modal.jsx';

export function Profile() {
  const xp = useGame((s) => s.xp);
  const stats = useGame((s) => s.stats);
  const history = useGame((s) => s.history);
  const resetAccount = useGame((s) => s.resetAccount);

  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const logout = useAuth((s) => s.logout);
  const changePassword = useAuth((s) => s.changePassword);
  const pushToast = useToast((s) => s.push);

  const account = currentUserKey ? accounts[currentUserKey] || null : null;

  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passError, setPassError] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!account) {
    return (
      <div className="card" style={{ padding: 28, textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
        <User size={40} className="text-gem" style={{ margin: '0 auto 12px' }} />
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sign In to Your Account</h1>
        <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
          Create an account or sign in to save your gems, PS99 pet inventory, level XP, and bet
          history.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              sound.click();
              openAuthModal('login');
            }}
          >
            <LogIn size={16} /> Sign In
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              sound.click();
              openAuthModal('register');
            }}
          >
            <UserPlus size={16} /> Create Account
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = account.role === 'admin';
  const { level, pct, currentXp, neededXp } = getLevelProgress(xp);
  const winRate = stats.bets > 0 ? ((stats.wins / stats.bets) * 100).toFixed(1) : '0.0';

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPassError('');
    if (newPass !== confirmPass) {
      setPassError('New passwords do not match.');
      return;
    }
    setChangingPass(true);
    try {
      const res = await changePassword(curPass, newPass);
      if (!res.ok) {
        sound.lose();
        setPassError(res.error || 'Could not update password.');
      } else {
        sound.win();
        setCurPass('');
        setNewPass('');
        setConfirmPass('');
        pushToast('Password updated successfully!', 'success');
      }
    } finally {
      setChangingPass(false);
    }
  };

  const handleReset = () => {
    resetAccount();
    setConfirmReset(false);
    sound.click();
    pushToast('Account gameplay progress reset.', 'info');
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="page-title">
            <User size={28} className="text-gem" />
            <span>{account.username}</span>
          </h1>
          <span className={`role-badge ${isAdmin ? 'role-badge-admin' : 'role-badge-user'}`}>
            {isAdmin ? 'ADMIN' : 'PLAYER'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
            <Link to="/admin" className="btn btn-sm btn-gold">
              <ShieldAlert size={15} /> Admin Panel
            </Link>
          )}
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => {
              sound.click();
              logout();
              pushToast('Signed out.', 'info');
            }}
          >
            <LogOut size={15} /> Sign Out
          </button>
          <button
            type="button"
            className="btn btn-sm btn-red"
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw size={15} /> Reset Progress
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
              <div
                className="user-avatar-circle"
                style={{ width: 46, height: 46, fontSize: 18 }}
              >
                {(account.username?.[0] || 'P').toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{account.username}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  Member since{' '}
                  {account.createdAt
                    ? new Date(account.createdAt).toLocaleDateString()
                    : 'Today'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <strong>Level {level}</strong>
              <span className="text-muted">
                {currentXp} / {neededXp} XP
              </span>
            </div>
            <div
              style={{
                height: 12,
                borderRadius: 999,
                background: 'var(--bg-deep)',
                overflow: 'hidden',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  width: `${Math.round(pct * 100)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--gem), var(--purple))',
                }}
              />
            </div>
          </div>

          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13.5 }}>
              <KeyRound size={15} className="text-gem" />
              <span>Change Password</span>
            </div>

            {passError && (
              <div className="auth-error" style={{ marginBottom: 0 }}>
                <span>{passError}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
              <input
                type="password"
                className="input"
                value={curPass}
                onChange={(e) => setCurPass(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                required
              />
              <input
                type="password"
                className="input"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                required
              />
              <input
                type="password"
                className="input"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="Confirm new"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <button type="submit" disabled={changingPass} className="btn btn-sm btn-primary">
                {changingPass ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: 12,
          marginBottom: 22,
        }}
      >
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>Total Wagered</div>
          <div style={{ fontSize: 20, marginTop: 4 }}>
            <GemAmount value={stats.wagered} iconSize={16} />
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>Net Profit</div>
          <div
            style={{ fontSize: 20, marginTop: 4 }}
            className={stats.profit >= 0 ? 'text-green' : 'text-red'}
          >
            <GemAmount
              value={stats.profit}
              prefix={stats.profit > 0 ? '+' : ''}
              iconSize={16}
            />
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>Total Bets</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{stats.bets}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>Win Rate</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{winRate}%</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="text-muted" style={{ fontSize: 12 }}>Biggest Win</div>
          <div style={{ fontSize: 20, marginTop: 4 }} className="text-gold">
            <GemAmount value={stats.biggestWin} iconSize={16} />
          </div>
        </div>
      </div>

      <div className="card live-bets-card">
        <div className="live-bets-header">
          <div className="live-bets-title">Bet History (Last {history.length})</div>
        </div>

        <div className="live-bets-table-wrap">
          <table className="live-bets-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Bet</th>
                <th>Multiplier</th>
                <th>Payout</th>
                <th style={{ textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>
                    No bets played yet.
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <span className="game-tag">{h.game}</span>
                    </td>
                    <td>{formatGems(h.amount)}</td>
                    <td>{h.multiplier.toFixed(2)}×</td>
                    <td className={h.payout >= h.amount ? 'text-green' : 'text-red'}>
                      {formatGems(h.payout)}
                    </td>
                    <td style={{ textAlign: 'right' }} className="text-muted">
                      {new Date(h.time).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset Account Progress?"
      >
        <p className="text-muted" style={{ marginTop: 0 }}>
          This resets your gems to the starting amount and clears your inventory, XP, and bet
          history for <strong>{account.username}</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{ flex: 1 }}
            onClick={() => setConfirmReset(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-red"
            style={{ flex: 1 }}
            onClick={handleReset}
          >
            Yes, Reset
          </button>
        </div>
      </Modal>
    </div>
  );
}
