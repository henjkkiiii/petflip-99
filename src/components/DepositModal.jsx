import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Swords,
  X,
} from 'lucide-react';
import hugePets from '../data/huge-pets.json';
import { Modal } from './Modal.jsx';
import { GemIcon } from './GemIcon.jsx';
import { PetImage } from './PetImage.jsx';
import { useAuth } from '../store/useAuth.js';
import { useSiteConfig } from '../store/siteConfig.js';
import { useTrades } from '../store/trades.js';
import { useToast } from '../store/toast.js';
import { formatGems, parseGems } from '../lib/format.js';
import { fireConfetti } from '../lib/confetti.js';
import { sound } from '../lib/sound.js';

export function DepositModal({ open, onClose }) {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const account = currentUserKey ? accounts[currentUserKey] || null : null;

  const botSettings = useSiteConfig((s) => s.botSettings);
  const myTrades = useTrades((s) => s.myTrades);
  const requestTrade = useTrades((s) => s.requestTrade);
  const cancelTrade = useTrades((s) => s.cancelTrade);
  const pushToast = useToast((s) => s.push);

  const [robloxUser, setRobloxUser] = useState(account?.username || '');
  const [amountText, setAmountText] = useState('0');
  const [petSearch, setPetSearch] = useState('');
  const [selectedPets, setSelectedPets] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [trackedTradeId, setTrackedTradeId] = useState(null);
  const [completedTrade, setCompletedTrade] = useState(null);

  const filteredPets = useMemo(() => {
    const q = petSearch.trim().toLowerCase();
    return hugePets
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.tier.includes(q))
      .slice(0, 30);
  }, [petSearch]);

  const activeDeposit = myTrades.find(
    (t) => t.type === 'deposit' && (t.status === 'waiting' || t.status === 'processing')
  );

  useEffect(() => {
    if (activeDeposit?.id) {
      setTrackedTradeId(activeDeposit.id);
      setCompletedTrade(null);
    } else if (trackedTradeId) {
      const finished = myTrades.find((t) => t.id === trackedTradeId && t.status === 'completed');
      if (finished) {
        setCompletedTrade(finished);
        setTrackedTradeId(null);
        fireConfetti(false);
        sound.win();
      }
    }
  }, [activeDeposit?.id, trackedTradeId, myTrades]);

  useEffect(() => {
    if (open) {
      setRobloxUser((prev) => prev || account?.username || '');
      if (!activeDeposit) setCompletedTrade(null);
    }
  }, [open, account?.username]);

  const addPetToDeposit = (pet) => {
    if (selectedPets.length >= 12) {
      pushToast('Max 12 pets per deposit trade.', 'error');
      return;
    }
    sound.click();
    setSelectedPets((prev) => [...prev, pet]);
  };

  const removePetAt = (idx) => {
    sound.click();
    setSelectedPets((prev) => prev.filter((_, i) => i !== idx));
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
        pets: selectedPets.slice(0, 12),
      });
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not queue deposit trade.', 'error');
        return;
      }
      sound.win();
      setSelectedPets([]);
      pushToast('Deposit trade queued! Trade the bot in PS99 now.', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Deposit Diamonds & Pets" maxWidth={520}>
      {!account ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center', padding: '8px 0' }}>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            Sign in or create an account to deposit gems &amp; pets into your wallet.
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
      ) : completedTrade ? (
        <div className="modal-progress">
          <CheckCircle2 size={42} className="text-green" />
          <div style={{ fontWeight: 800, fontSize: 18 }}>Deposit Successful!</div>
          <div className="text-muted" style={{ fontSize: 13.5, textAlign: 'center' }}>
            {(completedTrade.actualGems || 0) > 0 && (
              <div>
                Credited{' '}
                <strong className="text-gem">
                  +{formatGems(completedTrade.actualGems)} Gems
                </strong>{' '}
                to your wallet
              </div>
            )}
            {(completedTrade.actualPetsCount || 0) > 0 && (
              <div>
                Added{' '}
                <strong className="text-gold">
                  +{completedTrade.actualPetsCount} Pet(s)
                </strong>{' '}
                to your Inventory
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
      ) : activeDeposit ? (
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
          {(activeDeposit.pets || []).length > 0 && (
            <div className="text-gold" style={{ fontSize: 12.5, fontWeight: 700 }}>
              Queued Pets ({activeDeposit.pets.length}/12):{' '}
              {activeDeposit.pets.map((p) => p.name).join(', ')}
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
          {activeDeposit.status === 'processing' ? (
            <div className="text-gold" style={{ fontSize: 12, fontWeight: 700 }}>
              Trade locked while bot is trading in-game
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-red"
              onClick={async () => {
                sound.click();
                const res = await cancelTrade(activeDeposit.id);
                if (res.ok) pushToast('Deposit trade cancelled.', 'info');
                else pushToast(res.error || 'Could not cancel.', 'error');
              }}
            >
              <X size={14} /> Cancel Queue
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleTradeRequest} className="modal-form">
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            {botSettings?.robloxUsername
              ? `Trade "${botSettings.robloxUsername}" in PS99 after queueing.`
              : 'Queue your Roblox username + gems/pets (max 12), then trade the bot in PS99.'}
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
                placeholder="0 or e.g. 50M"
              />
            </div>
          </label>

          <div className="field-label">
            <span>Pets to Deposit ({selectedPets.length}/12 max)</span>
            <input
              className="input"
              value={petSearch}
              onChange={(e) => setPetSearch(e.target.value)}
              placeholder="Search Huge, Titanic, or Gargantuan pet…"
            />
            {petSearch.trim() && (
              <div
                style={{
                  maxHeight: 130,
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
                {filteredPets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => addPetToDeposit(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '4px 6px',
                      borderRadius: 6,
                      fontSize: 12,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PetImage thumb={p.thumb} alt={p.name} size={22} />
                      <span>{p.name}</span>
                    </span>
                    <span className="text-gem" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {formatGems(p.value)} <Plus size={12} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedPets.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {selectedPets.map((p, idx) => (
                  <span
                    key={`${p.name}-${idx}`}
                    className="tier-badge tier-badge-huge"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    {p.name}
                    <button type="button" onClick={() => removePetAt(idx)} aria-label="Remove pet">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-lg btn-green" disabled={submitting}>
            <Swords size={16} />
            <span>{submitting ? 'Queueing…' : 'Queue Deposit Trade'}</span>
          </button>
        </form>
      )}
    </Modal>
  );
}
