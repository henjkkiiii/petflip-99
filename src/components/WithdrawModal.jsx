import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, ExternalLink, Loader2, Swords, X } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { GemIcon } from './GemIcon.jsx';
import { PetImage } from './PetImage.jsx';
import { useGame } from '../store/useGame.js';
import { useAuth } from '../store/useAuth.js';
import { useSiteConfig } from '../store/siteConfig.js';
import { useTrades } from '../store/trades.js';
import { useToast } from '../store/toast.js';
import { formatGems, parseGems } from '../lib/format.js';
import { fireConfetti } from '../lib/confetti.js';
import { sound } from '../lib/sound.js';

export function WithdrawModal({ open, onClose }) {
  const balance = useGame((s) => s.balance);
  const inventory = useGame((s) => s.inventory);
  const username = useGame((s) => s.username);
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const botSettings = useSiteConfig((s) => s.botSettings);
  const myTrades = useTrades((s) => s.myTrades);
  const requestTrade = useTrades((s) => s.requestTrade);
  const cancelTrade = useTrades((s) => s.cancelTrade);
  const pushToast = useToast((s) => s.push);

  const [robloxUser, setRobloxUser] = useState(username);
  const [amountText, setAmountText] = useState('0');
  const [petFilter, setPetFilter] = useState('');
  const [selectedUids, setSelectedUids] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [trackedTradeId, setTrackedTradeId] = useState(null);
  const [completedTrade, setCompletedTrade] = useState(null);

  const activeWithdraw = myTrades.find(
    (t) => t.type === 'withdraw' && (t.status === 'waiting' || t.status === 'processing')
  );

  useEffect(() => {
    if (activeWithdraw?.id) {
      setTrackedTradeId(activeWithdraw.id);
      setCompletedTrade(null);
    } else if (trackedTradeId) {
      const finished = myTrades.find((t) => t.id === trackedTradeId && t.status === 'completed');
      if (finished) {
        setCompletedTrade(finished);
        setTrackedTradeId(null);
        fireConfetti(false);
        sound.cashout();
      }
    }
  }, [activeWithdraw?.id, trackedTradeId, myTrades]);

  useEffect(() => {
    if (open) {
      setRobloxUser((prev) => (prev && prev !== 'Guest' ? prev : username));
      setAmountText(balance >= 10_000_000 ? '10M' : '0');
      setSelectedUids([]);
      if (!activeWithdraw) setCompletedTrade(null);
    }
  }, [open, username, balance]);

  const filteredInv = useMemo(() => {
    const q = petFilter.trim().toLowerCase();
    return (inventory || [])
      .filter((p) => !q || (p.name || '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [inventory, petFilter]);

  const togglePetUid = (uid) => {
    sound.click();
    setSelectedUids((prev) => {
      if (prev.includes(uid)) return prev.filter((id) => id !== uid);
      if (prev.length >= 12) {
        pushToast('Max 12 pets per withdraw trade.', 'error');
        return prev;
      }
      return [...prev, uid];
    });
  };

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
    const rawAmt = amountText.trim() === '' || amountText.trim() === '0' ? 0 : parseGems(amountText);
    const amt = Number.isFinite(rawAmt) && rawAmt > 0 ? rawAmt : 0;
    if (amt === 0 && selectedUids.length === 0) {
      pushToast('Enter gems (>= 1,000) or select at least 1 pet to withdraw.', 'error');
      return;
    }
    if (amt > 0 && amt < 1000) {
      pushToast('Minimum gem withdraw is 1,000 gems (or set 0 for pets-only).', 'error');
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
        petUids: selectedUids,
      });
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not queue withdraw trade.', 'error');
        return;
      }
      sound.cashout();
      setSelectedUids([]);
      pushToast('Withdraw trade queued! Trade the bot in PS99.', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Withdraw Diamonds & Pets" maxWidth={520}>
      {completedTrade ? (
        <div className="modal-progress">
          <CheckCircle2 size={42} className="text-green" />
          <div style={{ fontWeight: 800, fontSize: 18 }}>Withdraw Completed!</div>
          <div className="text-muted" style={{ fontSize: 13.5, textAlign: 'center' }}>
            Sent to <strong>{completedTrade.robloxUsername}</strong> in PS99:
            {(completedTrade.actualGems || completedTrade.amount || 0) > 0 && (
              <div>
                <strong className="text-gem">
                  {formatGems(completedTrade.actualGems || completedTrade.amount)} Gems
                </strong>
              </div>
            )}
            {(completedTrade.actualPetsCount || completedTrade.pets?.length || 0) > 0 && (
              <div>
                <strong className="text-gold">
                  {completedTrade.actualPetsCount || completedTrade.pets?.length} Pet(s)
                </strong>
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setCompletedTrade(null);
              onClose?.();
            }}
          >
            Back to Games
          </button>
        </div>
      ) : activeWithdraw ? (
        <div className="modal-progress">
          <Loader2 size={32} className="spin text-gold" />
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {activeWithdraw.status === 'processing'
              ? 'Bot is sending your items in-game…'
              : `Queued Withdraw: ${formatGems(activeWithdraw.amount || 0)} Gems${
                  (activeWithdraw.pets || []).length > 0
                    ? ` + ${activeWithdraw.pets.length} Pet(s)`
                    : ''
                }`}
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
          {(activeWithdraw.pets || []).length > 0 && (
            <div className="text-gold" style={{ fontSize: 12.5, fontWeight: 700 }}>
              Pets ({activeWithdraw.pets.length}/12):{' '}
              {activeWithdraw.pets.map((p) => p.name).join(', ')}
            </div>
          )}
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
              if (res.ok) pushToast('Withdraw cancelled & gems/pets refunded!', 'info');
            }}
          >
            <X size={14} /> Cancel &amp; Refund
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="text-muted" style={{ fontSize: 13 }}>
            Available: <strong className="text-gem">{formatGems(balance)}</strong> gems ·{' '}
            <strong>{inventory.length}</strong> pets
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
            <span>Gems to Withdraw (0 for pets-only)</span>
            <div className="input-icon-wrap">
              <GemIcon size={18} />
              <input
                className="input"
                style={{ paddingLeft: 38 }}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0 or e.g. 10M"
              />
            </div>
          </label>

          <div className="preset-row">
            {[
              { label: '0', val: 0 },
              { label: '25%', val: Math.max(0, Math.floor(balance * 0.25)) },
              { label: '50%', val: Math.max(0, Math.floor(balance * 0.5)) },
              { label: 'Max', val: Math.max(0, balance) },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                className="preset-btn"
                onClick={() => {
                  sound.click();
                  setAmountText(String(p.val));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {inventory.length > 0 && (
            <div className="field-label">
              <span>Pets from Inventory ({selectedUids.length}/12 max)</span>
              <input
                className="input"
                value={petFilter}
                onChange={(e) => setPetFilter(e.target.value)}
                placeholder="Filter your inventory pets…"
              />
              <div
                style={{
                  maxHeight: 145,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 6,
                }}
              >
                {filteredInv.map((p) => {
                  const picked = selectedUids.includes(p.uid);
                  return (
                    <button
                      key={p.uid}
                      type="button"
                      onClick={() => togglePetUid(p.uid)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '4px 6px',
                        borderRadius: 6,
                        fontSize: 12,
                        textAlign: 'left',
                        background: picked ? 'rgba(56, 217, 255, 0.14)' : 'transparent',
                        border: picked ? '1px solid rgba(56, 217, 255, 0.4)' : '1px solid transparent',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <PetImage thumb={p.thumb} alt={p.name} size={22} />
                        <span>{p.name}</span>
                      </span>
                      <span className="text-gem" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {formatGems(p.value)}
                        {picked && <Check size={13} className="text-green" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-lg btn-gold" disabled={submitting}>
            <Swords size={16} />
            <span>{submitting ? 'Queueing…' : 'Request Withdraw Trade'}</span>
          </button>
        </form>
      )}
    </Modal>
  );
}
