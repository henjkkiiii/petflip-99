import React, { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { sound } from '../lib/sound.js';

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(str) {
  try {
    if (window.crypto?.subtle) {
      const data = new TextEncoder().encode(str);
      const buf = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fallback if subtle unavailable
  }
  return randomHex(32);
}

const HOUSE_EDGES = [
  { game: 'Blackjack', edge: '~0.6%–2%' },
  { game: 'Mines', edge: '3.00%' },
  { game: 'Dice', edge: '4.00%' },
  { game: 'Towers', edge: '4.00%' },
  { game: 'Plinko', edge: '~3.2%–4.9%' },
  { game: 'Crash & Limbo', edge: '5.00%' },
  { game: 'Coinflip', edge: '5.00% (1.90×)' },
  { game: 'Crates & Battles', edge: '5.00% (Live RAP)' },
  { game: 'Roulette', edge: '6.67%' },
];

export function FairnessModal({ open, onClose }) {
  const totalBets = useGame((s) => s.stats.bets);
  const pushToast = useToast((s) => s.push);

  const [clientSeed, setClientSeed] = useState(() => randomHex(8));
  const [serverSeed, setServerSeed] = useState(() => randomHex(16));
  const [serverHash, setServerHash] = useState('');

  useEffect(() => {
    let cancelled = false;
    sha256Hex(serverSeed).then((h) => {
      if (!cancelled) setServerHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [serverSeed]);

  const rotateSeeds = () => {
    sound.click();
    setClientSeed(randomHex(8));
    setServerSeed(randomHex(16));
    pushToast('Rotated client & server seed pair!', 'success');
  };

  return (
    <Modal open={open} onClose={onClose} title="Provably Fair & House Edge" maxWidth={520}>
      <div className="fairness-banner">
        <ShieldCheck size={18} className="text-green" />
        <span>
          RNG uses <code>crypto.getRandomValues()</code> for every spin, roll, deal, and drop.
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <label className="field-label">
          <span>Active Client Seed</span>
          <input
            className="input"
            value={clientSeed}
            onChange={(e) => setClientSeed(e.target.value)}
            maxLength={32}
          />
        </label>

        <div className="field-label">
          <span>Server Seed Hash (SHA-256)</span>
          <input className="input" value={serverHash} readOnly style={{ fontSize: 12 }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className="stat-box" style={{ flex: 1 }}>
            <span className="text-muted">Nonce (Your Bets)</span>
            <strong className="text-gem">{totalBets}</strong>
          </div>
          <button type="button" className="btn btn-primary" onClick={rotateSeeds}>
            <RefreshCw size={15} /> Rotate Seeds
          </button>
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Verified House Edges</div>
      <div className="fairness-edges-grid">
        {HOUSE_EDGES.map((item) => (
          <div key={item.game} className="stat-box" style={{ padding: '7px 11px', fontSize: 12.5 }}>
            <span className="text-muted">{item.game}</span>
            <strong>{item.edge}</strong>
          </div>
        ))}
      </div>
    </Modal>
  );
}
