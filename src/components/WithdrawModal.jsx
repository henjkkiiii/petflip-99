import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Swords, X } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { GemIcon } from './GemIcon.jsx';
import { useGame } from '../store/useGame.js';
import { useAuth } from '../store/useAuth.js';
import { useSiteConfig } from '../store/siteConfig.js';
import { useTrades } from '../store/trades.js';
import { useToast } from '../store/toast.js';
import { formatGems, parseGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';

export function WithdrawModal({ open, onClose }) {
  const balance = useGame((s) => s.balance);
  const username = useGame((s) => s.username);
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const botSettings = useSiteConfig((s) => s.botSettings);
  const myTrades = useTrades((s) => s.myTrades);
  const requestTrade = useTrades((s) => s.requestTrade);
  const cancelTrade = useTrades((s) => s.cancelTrade);
  const pushToast = useToast((s) => s.push);

  const [robloxUser, setRobloxUser] = useState(username);
  const [amountText, setAmountText] = useState('10M');
  const [submitting, setSubmitting] = useState(false);

  const activeWithdraw = myTrades.find(
    (t) => t.type === 'withdraw' && (t.status === 'waiting' || t.status === 'processing')
  );

  useEffect(() => {
    if (open) {
      setRobloxUser((prev) => (prev && prev !== 'Guest' ? prev : username));
      setAmountText(balance >= 10_000_000 ? '10M' : formatGems(Math.max(0, balance)));
    }
  }, [open, username, balance]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUserKey) {
      onClose?.();
      openAuthModal('login');
      return;
    }
    if (!robloxUser.trim() || robloxUser.trim().length < 3) {
      pushToast('Enter your exact Roblox username (3+ chars).', 'error');
      return;
    }
    const amt = parseGems(amountText);
    if (!Number.isInteger(amt) || amt < 1000) {
      pushToast('Minimum withdraw is 1,000 gems.', 'error');
      return;
    }
    if (amt > balance) {
      pushToast('Withdraw amount exceeds your gem balance.', 'error');
      return;
    }
    sound.click();
    setSubmitting(true);
    try {
      const res = await requestTrade({
        type: 'withdraw',
        robloxUsername: robloxUser.trim(),
        amount: amt,
      });
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not queue withdraw trade.', 'error');
        return;
      }
      sound.cashout();
      pushToast(`Queued ${formatGems(amt)} withdraw! Trade the bot in PS99.`, 'success');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Withdraw Diamonds (In-Game Trade)">
      {activeWithdraw ? (
        <div className="modal-progress">
          <Loader2 size={32} className="spin text-gold" />
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {activeWithdraw.status === 'processing'
              ? 'Bot is sending your gems in-game…'
              : `Queued Withdraw: ${formatGems(activeWithdraw.amount)} Gems`}
          </div>
          <div className="text-muted" style={{ fontSize: 13, textAlign: 'center' }}>
            Roblox: <strong>{activeWithdraw.robloxUsername}</strong>
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
              const res = await cancelTrade(activeWithdraw.id);
              if (res.ok) pushToast('Withdraw cancelled & gems refunded!', 'info');
            }}
          >
            <X size={14} /> Cancel &amp; Refund
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="text-muted" style={{ fontSize: 13 }}>
            Available balance: <strong className="text-gem">{formatGems(balance)}</strong> gems
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
            <span>Withdraw Amount</span>
            <div className="input-icon-wrap">
              <GemIcon size={18} />
              <input
                className="input"
                style={{ paddingLeft: 38 }}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="e.g. 10M"
                required
              />
            </div>
          </label>

          <div className="preset-row">
            {[0.25, 0.5, 1].map((frac) => {
              const val = Math.max(1000, Math.floor(balance * frac));
              return (
                <button
                  key={frac}
                  type="button"
                  className="preset-btn"
                  onClick={() => {
                    sound.click();
                    setAmountText(String(val));
                  }}
                >
                  {frac === 1 ? 'Max' : `${frac * 100}%`}
                </button>
              );
            })}
          </div>

          <button type="submit" className="btn btn-lg btn-gold" disabled={submitting}>
            <Swords size={16} />
            <span>{submitting ? 'Queueing…' : 'Request Withdraw Trade'}</span>
          </button>
        </form>
      )}
    </Modal>
  );
}
