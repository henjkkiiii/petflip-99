import React, { useState } from 'react';
import { ArrowLeftRight, Dices } from 'lucide-react';
import { rand } from '../lib/rng.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { BetInput } from '../components/BetInput.jsx';
import { GameLayout } from '../components/GameLayout.jsx';

export function Dice() {
  const placeBet = useGame((s) => s.placeBet);
  const payout = useGame((s) => s.payout);
  const recordBet = useGame((s) => s.recordBet);
  const pushToast = useToast((s) => s.push);

  const [betAmount, setBetAmount] = useState(1_000_000);
  const [target, setTarget] = useState(50);
  const [mode, setMode] = useState('over'); // 'over' | 'under'
  const [lastRoll, setLastRoll] = useState(null); // { value, win }
  const [rolling, setRolling] = useState(false);

  const winChance = mode === 'under' ? target : 100 - target;
  const multiplier = Number((96 / winChance).toFixed(2));
  const potentialPayout = Math.round(betAmount * multiplier);

  const roll = () => {
    if (rolling) return;
    if (!placeBet(betAmount)) return;
    sound.flip();
    setRolling(true);

    const rolled = Math.floor(rand() * 10000) / 100;
    const win = mode === 'under' ? rolled < target : rolled >= target;

    setLastRoll({ value: rolled, win });

    setTimeout(() => {
      setRolling(false);
      const winAmt = win ? Math.round(betAmount * multiplier) : 0;
      if (winAmt > 0) payout(winAmt);
      recordBet({
        game: 'Dice',
        amount: betAmount,
        multiplier: win ? multiplier : 0,
        payout: winAmt,
      });

      if (win) {
        if (multiplier >= 10) {
          sound.bigWin();
          fireConfetti(true);
        } else {
          sound.win();
        }
        pushToast(`Rolled ${rolled.toFixed(2)} — Won ${formatGems(winAmt)}!`, 'success');
      } else {
        sound.lose();
      }
    }, 360);
  };

  const toggleMode = () => {
    sound.click();
    setMode((m) => (m === 'over' ? 'under' : 'over'));
    setTarget((t) => 100 - t);
  };

  return (
    <GameLayout
      title="Dice"
      subtitle="Slide to pick your win chance and roll 0.00–100.00."
      icon={<Dices size={26} className="text-gem" />}
      controls={
        <>
          <BetInput value={betAmount} onChange={setBetAmount} disabled={rolling} />

          <button type="button" className="btn btn-outline" onClick={toggleMode} disabled={rolling}>
            <ArrowLeftRight size={16} />
            <span>Mode: Roll {mode === 'over' ? 'Over' : 'Under'} {target}</span>
          </button>

          <button
            type="button"
            className="btn btn-lg btn-green"
            disabled={rolling}
            onClick={roll}
          >
            Roll Dice
          </button>

          <div className="stat-box">
            <span className="text-muted">Payout on Win</span>
            <strong className="text-green">{formatGems(potentialPayout)}</strong>
          </div>

          <div className="stat-box">
            <span className="text-muted">House Edge</span>
            <strong>4%</strong>
          </div>
        </>
      }
      board={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div className="stat-box" style={{ flexDirection: 'column', gap: 4 }}>
              <span className="text-muted">Multiplier</span>
              <strong style={{ fontSize: 22 }} className="text-gem">
                {multiplier.toFixed(2)}×
              </strong>
            </div>
            <div className="stat-box" style={{ flexDirection: 'column', gap: 4 }}>
              <span className="text-muted">Roll {mode === 'over' ? 'Over' : 'Under'}</span>
              <strong style={{ fontSize: 22 }}>{target}</strong>
            </div>
            <div className="stat-box" style={{ flexDirection: 'column', gap: 4 }}>
              <span className="text-muted">Win Chance</span>
              <strong style={{ fontSize: 22 }} className="text-green">
                {winChance}%
              </strong>
            </div>
          </div>

          <div className="dice-bar-wrap">
            {lastRoll && (
              <div
                className={`dice-marker ${lastRoll.win ? 'win' : 'lose'}`}
                style={{ left: `${Math.min(97, Math.max(3, lastRoll.value))}%` }}
              >
                {lastRoll.value.toFixed(2)}
              </div>
            )}

            <div className="dice-track">
              <div
                className="dice-win-zone"
                style={
                  mode === 'under'
                    ? { left: 0, width: `${target}%` }
                    : { left: `${target}%`, right: 0 }
                }
              />
            </div>

            <input
              type="range"
              min={2}
              max={98}
              step={1}
              value={target}
              disabled={rolling}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="dice-slider"
              aria-label="Dice target"
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 12,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>
        </div>
      }
    />
  );
}
