import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { shuffle } from '../lib/rng.js';
import { GEM, TNT } from '../lib/assets.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { BetInput } from '../components/BetInput.jsx';
import { GameLayout } from '../components/GameLayout.jsx';

const ROWS = 8;

const DIFFICULTIES = {
  easy: { label: 'Easy', cols: 4, bombs: 1 },
  medium: { label: 'Medium', cols: 3, bombs: 1 },
  hard: { label: 'Hard', cols: 2, bombs: 1 },
  expert: { label: 'Expert', cols: 3, bombs: 2 },
};

function rowMultiplier(rowNum, diffKey) {
  const { cols, bombs } = DIFFICULTIES[diffKey];
  const p = (cols - bombs) / cols;
  return Math.floor((0.96 / Math.pow(p, rowNum)) * 100) / 100;
}

export function Towers() {
  const placeBet = useGame((s) => s.placeBet);
  const payout = useGame((s) => s.payout);
  const recordBet = useGame((s) => s.recordBet);
  const pushToast = useToast((s) => s.push);

  const [betAmount, setBetAmount] = useState(1_000_000);
  const [diff, setDiff] = useState('medium');
  const [active, setActive] = useState(false);
  const [board, setBoard] = useState([]); // ROWS arrays of cols booleans (true = bomb)
  const [picks, setPicks] = useState([]); // chosen col per climbed row
  const [currentRow, setCurrentRow] = useState(0);
  const [finished, setFinished] = useState(false);
  const [lockedBet, setLockedBet] = useState(0);

  const cfg = DIFFICULTIES[diff];

  const startGame = () => {
    if (active) return;
    if (!placeBet(betAmount)) return;
    sound.click();

    const rows = Array.from({ length: ROWS }, () => {
      const cells = Array.from({ length: cfg.cols }, (_, i) => i < cfg.bombs);
      return shuffle(cells);
    });
    setBoard(rows);
    setPicks([]);
    setCurrentRow(0);
    setFinished(false);
    setLockedBet(betAmount);
    setActive(true);
  };

  const cashout = (climbedRows) => {
    if (climbedRows <= 0) return;
    const mult = rowMultiplier(climbedRows, diff);
    const winAmt = Math.round(lockedBet * mult);
    setActive(false);
    setFinished(true);
    payout(winAmt);
    recordBet({
      game: 'Towers',
      amount: lockedBet,
      multiplier: mult,
      payout: winAmt,
    });
    sound.cashout();
    if (mult >= 10) fireConfetti(true);
    pushToast(`Towers cashed @ ${mult.toFixed(2)}× (+${formatGems(winAmt)})`, 'success');
  };

  const clickCell = (rowIdx, colIdx) => {
    if (!active || rowIdx !== currentRow) return;
    const isBomb = board[rowIdx]?.[colIdx];
    const nextPicks = [...picks, colIdx];
    setPicks(nextPicks);

    if (isBomb) {
      setActive(false);
      setFinished(true);
      sound.explode();
      recordBet({
        game: 'Towers',
        amount: lockedBet,
        multiplier: 0,
        payout: 0,
      });
      pushToast('Tower collapsed! Hit a bomb.', 'error');
      return;
    }

    sound.gem();
    const climbed = rowIdx + 1;
    setCurrentRow(climbed);
    if (climbed >= ROWS) {
      cashout(climbed);
    }
  };

  const currentMult = picks.length > 0 && !finished ? rowMultiplier(picks.length, diff) : 1;
  const currentWin = Math.round(lockedBet * currentMult);

  return (
    <GameLayout
      title="Towers"
      subtitle="Climb from the bottom up — higher floors multiply your gems."
      icon={<Layers size={26} className="text-green" />}
      controls={
        <>
          <BetInput value={betAmount} onChange={setBetAmount} disabled={active} />

          <div className="field-label">
            <span>Difficulty</span>
            <div className="seg-group">
              {Object.entries(DIFFICULTIES).map(([key, d]) => (
                <button
                  key={key}
                  type="button"
                  disabled={active}
                  className={`seg-btn ${diff === key ? 'active' : ''}`}
                  onClick={() => {
                    sound.click();
                    setDiff(key);
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {!active ? (
            <button type="button" className="btn btn-lg btn-green" onClick={startGame}>
              Start Climb
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-lg btn-gold"
              disabled={currentRow === 0}
              onClick={() => cashout(currentRow)}
            >
              Cashout {currentRow > 0 ? formatGems(currentWin) : ''}
            </button>
          )}

          <div className="stat-box">
            <span className="text-muted">Current Floor</span>
            <strong>{active ? `${currentRow} / ${ROWS}` : '—'}</strong>
          </div>

          <div className="stat-box">
            <span className="text-muted">House Edge</span>
            <strong>4%</strong>
          </div>
        </>
      }
      board={
        <div className="towers-stack">
          {Array.from({ length: ROWS }, (_, r) => {
            const mult = rowMultiplier(r + 1, diff);
            const isActiveRow = active && r === currentRow;
            const pickedCol = picks[r];

            return (
              <div key={r} className={`towers-row ${isActiveRow ? 'active' : ''}`}>
                <div className="towers-mult">{mult.toFixed(2)}×</div>
                <div
                  className="towers-cells"
                  style={{ gridTemplateColumns: `repeat(${cfg.cols}, 1fr)` }}
                >
                  {Array.from({ length: cfg.cols }, (_, c) => {
                    const isPicked = pickedCol === c;
                    const isBomb = board[r]?.[c];
                    const showCell = finished || isPicked;

                    let cls = 'tower-cell';
                    if (showCell && board[r]) {
                      cls += isBomb ? ' bomb' : ' safe';
                    }

                    return (
                      <button
                        key={c}
                        type="button"
                        className={cls}
                        disabled={!isActiveRow}
                        onClick={() => clickCell(r, c)}
                      >
                        {showCell && board[r] ? (
                          isBomb ? (
                            <img
                              src={TNT}
                              alt="TNT"
                              style={{ width: 26, height: 26, objectFit: 'contain' }}
                            />
                          ) : (
                            <img src={GEM} alt="Gem" style={{ width: 22, height: 22 }} />
                          )
                        ) : isActiveRow ? (
                          <span style={{ fontSize: 12, color: 'var(--gem)', fontWeight: 700 }}>
                            PICK
                          </span>
                        ) : (
                          <span style={{ opacity: 0.2 }}>•</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      }
    />
  );
}
