import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldAlert,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import { Modal } from './Modal.jsx';
import { GemIcon } from './GemIcon.jsx';
import { useGame } from '../store/useGame.js';
import { useAuth } from '../store/useAuth.js';
import { useSiteConfig } from '../store/siteConfig.js';
import { useTrades } from '../store/trades.js';
import { useToast } from '../store/toast.js';
import { formatGems, parseGems } from '../lib/format.js';
import { fireConfetti } from '../lib/confetti.js';
import { sound } from '../lib/sound.js';

const PRESETS = [
  { label: '10M', value: 10_000_000 },
  { label: '50M', value: 50_000_000 },
  { label: '250M', value: 250_000_000 },
  { label: '1B', value: 1_000_000_000 },
];

const STEPS = [
  'Connecting to PETFLIP demo…',
  'Verifying diamonds…',
  'Credited!',
];

export function DepositModal({ open, onClose }) {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const account = currentUserKey ? accounts[currentUserKey] || null : null;

  const allowDeposits = useSiteConfig((s) => s.allowDeposits);
  const botSettings = useSiteConfig((s) => s.botSettings);
  const deposit = useGame((s) => s.deposit);
  const myTrades = useTrades((s) => s.myTrades);
  const requestTrade = useTrades((s) => s.requestTrade);
  const cancelTrade = useTrades((s) => s.cancelTrade);
  const pushToast = useToast((s) => s.push);

  const [mode, setMode] = useState('trade'); // 'trade' | 'demo'
  const [robloxUser, setRobloxUser] = useState(account?.username || '');
  const [amountText, setAmountText] = useState('50M');
  const [phase, setPhase] = useState('idle');
  const [stepIdx, setStepIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const depositsBlocked = Boolean(account && !allowDeposits && account.role !== 'admin');
  const activeDeposit = myTrades.find(
    (t) => t.type === 'deposit' && (t.status === 'waiting' || t.status === 'processing')
  );

  useEffect(() => {
    if (open) {
      setRobloxUser((prev) => prev || account?.username || '');
      setPhase('idle');
      setStepIdx(0);
    }
  }, [open, account?.username]);

  useEffect(() => {
    if (phase !== 'processing') return undefined;
    let cancelled = false;
    const t1 = setTimeout(() => !cancelled && setStepIdx(1), 850);
    const t2 = setTimeout(() => !cancelled && setStepIdx(2), 1750);
    const t3 = setTimeout(() => {
      if (cancelled) return;
      const amt = parseGems(amountText);
      if (Number.isInteger(amt) && amt > 0 && deposit(amt)) {
        fireConfetti(false);
        sound.win();
        pushToast(`Deposited ${formatGems(amt)} play gems!`, 'success');
      }
      setPhase('done');
    }, 2400);

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase, amountText, deposit, pushToast]);

  const handleDemoSubmit = (e) => {
    e.preventDefault();
    if (!account) {
      onClose?.();
      openAuthModal('login');
      return;
    }
    if (depositsBlocked) {
      pushToast('Demo deposits are currently disabled by an admin.', 'error');
      return;
    }
    const amt = parseGems(amountText);
    if (!Number.isInteger(amt) || amt <= 0 || amt > 1e13) {
      pushToast('Enter a valid gem amount (e.g. 50M or 1B)', 'error');
      return;
    }
    sound.click();
    setStepIdx(0);
    setPhase('processing');
  };

  const handleTradeRequest = async (e) => {
    e.preventDefault();
    if (!account) {
      onClose?.();
      openAuthModal('login');
      return;
    }
    if (!robloxUser.trim() || robloxUser.trim().length < 3) {
      pushToast('Enter your exact Roblox username (3+ chars).', 'error');
      return;
    }
    const amt = parseGems(amountText);
    sound.click();
    setSubmitting(true);
    try {
      const res = await requestTrade({
        type: 'deposit',
        robloxUsername: robloxUser.trim(),
        amount: Number.isFinite(amt) && amt > 0 ? amt : 0,
      });
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not queue deposit trade.', 'error');
        return;
      }
      sound.win();
      pushToast('Deposit trade queued! Trade the bot in PS99 now.', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={phase === 'processing' ? undefined : onClose} title="Deposit Diamonds">
      {!account ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center', padding: '8px 0' }}>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            Sign in or create an account to deposit gems into your wallet.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ flex: 1 }}
              onClick={() => {
                onClose?.();
                openAuthModal('login');
              }}
            >
              Log In
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => {
                onClose?.();
                openAuthModal('register');
              }}
            >
              Sign Up
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="seg-group" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className={`seg-btn ${mode === 'trade' ? 'active' : ''}`}
              onClick={() => setMode('trade')}
            >
              <Swords size={14} /> In-Game Trade
            </button>
            <button
              type="button"
              className={`seg-btn ${mode === 'demo' ? 'active' : ''}`}
              onClick={() => setMode('demo')}
            >
              <Sparkles size={14} /> Free Demo
            </button>
          </div>

          {mode === 'trade' ? (
            activeDeposit ? (
              <div className="modal-progress">
                <Loader2 size={32} className="spin text-gem" />
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {activeDeposit.status === 'processing'
                    ? 'Trade Bot detected your trade!'
                    : 'Waiting for your in-game trade…'}
                </div>
                <div className="text-muted" style={{ fontSize: 13, textAlign: 'center' }}>
                  Roblox: <strong>{activeDeposit.robloxUsername}</strong>
                  {botSettings?.robloxUsername && (
                    <>
                      {' '}
                      → Trade <strong className="text-gold">{botSettings.robloxUsername}</strong> in PS99
                    </>
                  )}
                </div>
                {botSettings?.privateServerUrl && (
                  <a
                    href={botSettings.privateServerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-primary"
                  >
                    <ExternalLink size={14} /> Join Bot Server
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-red"
                  onClick={async () => {
                    sound.click();
                    const res = await cancelTrade(activeDeposit.id);
                    if (res.ok) pushToast('Deposit trade cancelled.', 'info');
                  }}
                >
                  <X size={14} /> Cancel Queue
                </button>
              </div>
            ) : (
              <form onSubmit={handleTradeRequest} className="modal-form">
                <div className="text-muted" style={{ fontSize: 12.5 }}>
                  {botSettings?.robloxUsername
                    ? `Trade "${botSettings.robloxUsername}" in PS99 after queueing.`
                    : 'Queue your Roblox username, then trade the bot account in PS99.'}
                </div>
                <label className="field-label">
                  <span>Your Exact Roblox Username</span>
                  <input
                    className="input"
                    value={robloxUser}
                    onChange={(e) => setRobloxUser(e.target.value)}
                    placeholder="ExactRobloxUsername"
                    required
                  />
                </label>
                <label className="field-label">
                  <span>Expected Gem Amount (optional)</span>
                  <div className="input-icon-wrap">
                    <GemIcon size={18} />
                    <input
                      className="input"
                      style={{ paddingLeft: 38 }}
                      value={amountText}
                      onChange={(e) => setAmountText(e.target.value)}
                      placeholder="e.g. 50M"
                    />
                  </div>
                </label>
                <div className="preset-row">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="preset-btn"
                      onClick={() => {
                        sound.click();
                        setAmountText(p.label);
                      }}
                    >
                      +{p.label}
                    </button>
                  ))}
                </div>
                <button type="submit" className="btn btn-lg btn-green" disabled={submitting}>
                  {submitting ? 'Queueing…' : 'Queue Deposit Trade'}
                </button>
              </form>
            )
          ) : depositsBlocked ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center', padding: '12px 4px' }}>
              <ShieldAlert size={30} className="text-red" style={{ margin: '0 auto' }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Demo Deposits Disabled</div>
              <div className="text-muted" style={{ fontSize: 13 }}>
                An admin has disabled free demo deposits. Use In-Game Trade instead!
              </div>
            </div>
          ) : phase === 'idle' ? (
            <form onSubmit={handleDemoSubmit} className="modal-form">
              <label className="field-label">
                <span>Demo Gem Amount</span>
                <div className="input-icon-wrap">
                  <GemIcon size={18} />
                  <input
                    className="input"
                    style={{ paddingLeft: 38 }}
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    placeholder="e.g. 50M"
                  />
                </div>
              </label>
              <div className="preset-row">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="preset-btn"
                    onClick={() => {
                      sound.click();
                      setAmountText(p.label);
                    }}
                  >
                    +{p.label}
                  </button>
                ))}
              </div>
              <button type="submit" className="btn btn-lg btn-green">
                Claim Demo Gems
              </button>
            </form>
          ) : phase === 'processing' ? (
            <div className="modal-progress">
              <Loader2 size={32} className="spin text-gem" />
              <div style={{ fontWeight: 600 }}>{STEPS[stepIdx]}</div>
            </div>
          ) : (
            <div className="modal-progress">
              <CheckCircle2 size={38} className="text-green" />
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                +{formatGems(parseGems(amountText))} Demo Gems Credited!
              </div>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Back to Games
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
