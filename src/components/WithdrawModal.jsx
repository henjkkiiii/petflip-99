import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { GemIcon } from './GemIcon.jsx';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { formatGems, parseGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';

const STEPS = [
  'Connecting to PETFLIP mailbox bot…',
  'Packing diamonds for mailbox…',
  'Sent to your in-game mailbox (demo)',
];

export function WithdrawModal({ open, onClose }) {
  const balance = useGame((s) => s.balance);
  const username = useGame((s) => s.username);
  const withdraw = useGame((s) => s.withdraw);
  const pushToast = useToast((s) => s.push);

  const [robloxUser, setRobloxUser] = useState(username);
  const [amountText, setAmountText] = useState('10M');
  const [phase, setPhase] = useState('idle');
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setRobloxUser(username);
      setAmountText(balance >= 10_000_000 ? '10M' : formatGems(Math.max(0, balance)));
      setPhase('idle');
      setStepIdx(0);
    }
  }, [open, username, balance]);

  useEffect(() => {
    if (phase !== 'processing') return;
    let cancelled = false;
    const t1 = setTimeout(() => !cancelled && setStepIdx(1), 850);
    const t2 = setTimeout(() => !cancelled && setStepIdx(2), 1700);
    const t3 = setTimeout(() => {
      if (cancelled) return;
      const amt = parseGems(amountText);
      if (withdraw(amt)) {
        sound.cashout();
        pushToast(`Withdrew ${formatGems(amt)} gems (demo)`, 'info');
      } else {
        pushToast('Insufficient balance for withdrawal', 'error');
      }
      setPhase('done');
    }, 2350);

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase, amountText, withdraw, pushToast]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!robloxUser.trim()) {
      pushToast('Enter a Roblox username', 'error');
      return;
    }
    const amt = parseGems(amountText);
    if (!Number.isInteger(amt) || amt <= 0) {
      pushToast('Enter a valid gem amount', 'error');
      return;
    }
    if (amt > balance) {
      pushToast('Withdraw amount exceeds your gem balance', 'error');
      return;
    }
    sound.click();
    setStepIdx(0);
    setPhase('processing');
  };

  return (
    <Modal open={open} onClose={phase === 'processing' ? undefined : onClose} title="Withdraw Diamonds">
      <div className="demo-badge">
        <Sparkles size={13} />
        <span>DEMO – play-money withdrawal simulation</span>
      </div>

      {phase === 'idle' && (
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="text-muted" style={{ fontSize: 13 }}>
            Available balance: <strong className="text-gem">{formatGems(balance)}</strong> gems
          </div>

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
            <span>Withdraw Amount</span>
            <div className="input-icon-wrap">
              <GemIcon size={18} />
              <input
                className="input"
                style={{ paddingLeft: 38 }}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="e.g. 10M"
              />
            </div>
          </label>

          <div className="preset-row">
            {[0.25, 0.5, 1].map((frac) => {
              const val = Math.max(1, Math.floor(balance * frac));
              return (
                <button
                  key={frac}
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={balance <= 0}
                  onClick={() => {
                    sound.click();
                    setAmountText(formatGems(val));
                  }}
                >
                  {frac === 1 ? 'All' : `${frac * 100}%`}
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            className="btn btn-lg btn-primary"
            style={{ width: '100%' }}
            disabled={balance <= 0}
          >
            Send to Mailbox (Demo)
          </button>
        </form>
      )}

      {(phase === 'processing' || phase === 'done') && (
        <div className="mailbox-steps">
          <div className="mailbox-target">
            Delivering to <strong>{robloxUser}</strong> ({formatGems(parseGems(amountText) || 0)} gems)
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
              className="btn btn-outline"
              style={{ width: '100%', marginTop: 8 }}
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
