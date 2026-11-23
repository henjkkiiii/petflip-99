import React, { useEffect, useRef, useState } from 'react';
import { Rocket } from 'lucide-react';
import { crashPoint } from '../lib/rng.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { BetInput } from '../components/BetInput.jsx';
import { GameLayout } from '../components/GameLayout.jsx';

export function Limbo() {
  const placeBet = useGame((s) => s.placeBet);
  const payout = useGame((s) => s.payout);
  const recordBet = useGame((s) => s.recordBet);
  const pushToast = useToast((s) => s.push);

  const [betAmount, setBetAmount] = useState(1_000_000);
  const [targetText, setTargetText] = useState('2.00');
  const [displayMult, setDisplayMult] = useState(1.0);
  const [resultState, setResultState] = useState(null); // null | 'win' | 'lose'
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const rafRef = useRef(null);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const target = Math.min(1000, Math.max(1.01, Number(targetText) || 2));
  const winChance = Number((95 / target).toFixed(2));

  const play = () => {
    if (running) return;
    if (target < 1.01 || target > 1000) {
      pushToast('Target multiplier must be between 1.01 and 1000', 'error');
      return;
    }
    if (!placeBet(betAmount)) return;
    sound.flip();
    setRunning(true);
    setResultState(null);

    const rolled = crashPoint();
    const won = rolled >= target;
    const duration = 800;
    const start = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = 1 + (rolled - 1) * eased;
      setDisplayMult(val);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplayMult(rolled);
        setRunning(false);
        setResultState(won ? 'win' : 'lose');
        setHistory((prev) => [{ val: rolled, won }, ...prev].slice(0, 12));

        const winAmt = won ? Math.round(betAmount * target) : 0;
        if (winAmt > 0) payout(winAmt);
        recordBet({
          game: 'Limbo',
          amount: betAmount,
          multiplier: won ? target : 0,
          payout: winAmt,
        });

        if (won) {
          if (target >= 10) {
            sound.bigWin();
            fireConfetti(true);
          } else {
            sound.win();
          }
          pushToast(`Limbo hit ${rolled.toFixed(2)}×! Won ${formatGems(winAmt)}`, 'success');
        } else {
          sound.lose();
        }
      }
    };

    rafRef.current = requestAnimationFrame(step);
  };

  return (
    <GameLayout
      title="Limbo"
      subtitle="Pick a target multiplier up to 1,000× and beat the crash roll."
      icon={<Rocket size={26} className="text-purple" />}
      controls={
        <>
          <BetInput value={betAmount} onChange={setBetAmount} disabled={running} />

          <label className="field-label">
            <span>Target Multiplier (1.01–1000)</span>
            <input
              className="input"
              type="number"
              min="1.01"
              max="1000"
              step="0.1"
              value={targetText}
              disabled={running}
              onChange={(e) => setTargetText(e.target.value)}
            />
          </label>

          <button
            type="button"
            className="btn btn-lg btn-purple"
            disabled={running}
            onClick={play}
          >
            Launch Limbo
          </button>

          <div className="stat-box">
            <span className="text-muted">Win Chance</span>
            <strong className="text-gem">{winChance}%</strong>
          </div>

          <div className="stat-box">
            <span className="text-muted">Target Payout</span>
            <strong className="text-green">{formatGems(Math.round(betAmount * target))}</strong>
          </div>

          <div className="stat-box">
            <span className="text-muted">House Edge</span>
            <strong>5%</strong>
          </div>
        </>
      }
      board={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            minHeight: 320,
          }}
        >
          {history.length > 0 && (
            <div className="crash-history-strip" style={{ maxWidth: '100%' }}>
              {history.map((h, i) => (
                <span
                  key={i}
                  className={`crash-pill ${h.won ? 'crash-pill-green' : 'crash-pill-red'}`}
                >
                  {h.val.toFixed(2)}×
                </span>
              ))}
            </div>
          )}

          <div
            className="font-display"
            style={{
              fontSize: 'clamp(52px, 8vw, 88px)',
              color:
                resultState === 'win'
                  ? 'var(--green)'
                  : resultState === 'lose'
                  ? 'var(--red)'
                  : 'var(--text)',
              textShadow:
                resultState === 'win'
                  ? '0 0 28px rgba(52, 209, 122, 0.5)'
                  : resultState === 'lose'
                  ? '0 0 28px rgba(255, 77, 109, 0.45)'
                  : '0 4px 18px rgba(0,0,0,0.4)',
            }}
          >
            {displayMult.toFixed(2)}×
          </div>

          <div className="text-muted" style={{ fontWeight: 600 }}>
            Target to beat: <strong className="text-gem">{target.toFixed(2)}×</strong>
          </div>
        </div>
      }
    />
  );
}
