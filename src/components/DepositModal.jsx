import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, Sparkles } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { GemIcon } from './GemIcon.jsx';
import { useGame } from '../store/useGame.js';
import { useAuth } from '../store/useAuth.js';
import { useSiteConfig } from '../store/siteConfig.js';
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
  'Connecting to PETFLIP mailbox bot…',
  'Verifying diamonds…',
  'Credited!',
];

export function DepositModal({ open, onClose }) {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const account = currentUserKey ? accounts[currentUserKey] || null : null;

  const allowDeposits = useSiteConfig((s) => s.allowDeposits);
  const deposit = useGame((s) => s.deposit);
  const pushToast = useToast((s) => s.push);

  const [robloxUser, setRobloxUser] = useState(account?.username || '');
  const [amountText, setAmountText] = useState('50M');
  const [phase, setPhase] = useState('idle'); // 'idle' | 'processing' | 'done'
  const [stepIdx, setStepIdx] = useState(0);

  const depositsBlocked = Boolean(account && !allowDeposits && account.role !== 'admin');

  useEffect(() => {
    if (open) {
      setRobloxUser(account?.username || '');
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

  const handleSubmit = (e) => {
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
    if (!robloxUser.trim()) {
      pushToast('Enter a Roblox username for the demo mailbox', 'error');
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

  return (
    <Modal open={open} onClose={phase === 'processing' ? undefined : onClose} title="Deposit Diamonds">
      <div className="demo-badge">
        <Sparkles size={13} />
        <span>DEMO – free play gems (no real Roblox items)</span>
      </div>

      {!account ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center', padding: '8px 0' }}>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            Sign in or create an account to deposit free demo gems into your wallet.
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
              Sign In
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
              Create Account
            </button>
          </div>
        </div>
      ) : depositsBlocked ? (
        <div className="auth-error" style={{ marginBottom: 0 }}>
          <ShieldAlert size={16} />
          <span>Free demo deposits are currently paused by an administrator.</span>
        </div>
      ) : phase === 'idle' ? (
        <form onSubmit={handleSubmit} className="modal-form">
          <label className="field-label">
            <span>Roblox Username</span>
            <input
              className="input"
              value={robloxUser}
              onChange={(e) => setRobloxUser(e.target.value)}
              placeholder="YourRobloxName"
            />
          </label>

          <label className="field-label">
            <span>Diamond Amount</span>
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
                className="btn btn-sm btn-outline"
                onClick={() => {
                  sound.click();
                  setAmountText(p.label);
                }}
              >
                <GemIcon size={13} />
                {p.label}
              </button>
            ))}
          </div>

          <button type="submit" className="btn btn-lg btn-green" style={{ width: '100%' }}>
            Deposit Play Gems
          </button>
        </form>
      ) : (
        <div className="mailbox-steps">
          <div className="mailbox-target">
            Sending to mailbox for <strong>{robloxUser}</strong> (
            {formatGems(parseGems(amountText) || 0)} gems)
          </div>

          {STEPS.map((label, idx) => {
            const done = phase === 'done' || stepIdx > idx;
            const active = phase === 'processing' && stepIdx === idx;
            return (
              <div
                key={label}
                className={`mailbox-step ${done ? 'done' : active ? 'active' : ''}`}
              >
                {done ? (
                  <CheckCircle2 size={20} className="text-green" />
                ) : active ? (
                  <Loader2 size={20} className="spin text-gem" />
                ) : (
                  <span className="step-dot" />
                )}
                <span>{label}</span>
              </div>
            );
          })}

          {phase === 'done' && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={onClose}
            >
              Awesome, Back to Games
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
