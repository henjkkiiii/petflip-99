import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bomb, Sparkles } from 'lucide-react';
import { shuffle, randInt } from '../lib/rng.js';
import { GEM, TNT } from '../lib/assets.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { BetInput } from '../components/BetInput.jsx';
import { GameLayout } from '../components/GameLayout.jsx';

function calcMinesMult(picks, minesCount) {
  if (picks <= 0) return 1;
  let prod = 1;
  for (let i = 0; i < picks; i++) {
    prod *= (25 - i) / (25 - minesCount - i);
  }
  return Math.floor(0.88 * prod * 100) / 100;
}

export function Mines() {
  const placeBet = useGame((s) => s.placeBet);
  const payout = useGame((s) => s.payout);
  const recordBet = useGame((s) => s.recordBet);
  const pushToast = useToast((s) => s.push);

  const [betAmount, setBetAmount] = useState(1_000_000);
  const [minesCount, setMinesCount] = useState(3);
  const [active, setActive] = useState(false);
  const [board, setBoard] = useState([]); // array of 25 booleans (true = bomb)
  const [revealed, setRevealed] = useState([]); // array of picked tile indices
  const [finished, setFinished] = useState(false);
  const [lockedBet, setLockedBet] = useState(0);
  const [shake, setShake] = useState(false);
  const [explodedIdx, setExplodedIdx] = useState(null);
  const shakeTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, []);

  const safePicked = useMemo(
    () => revealed.filter((idx) => !board[idx]).length,
    [revealed, board]
  );

  const currentMult = useMemo(
    () => calcMinesMult(safePicked, minesCount),
    [safePicked, minesCount]
  );
  const nextMult = useMemo(
    () => calcMinesMult(safePicked + 1, minesCount),
    [safePicked, minesCount]
  );

  const currentPayout = Math.round(lockedBet * currentMult);
  const currentProfit = currentPayout - lockedBet;

  const startGame = () => {
    if (active) return;
    if (!placeBet(betAmount)) return;
    sound.click();
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    const cells = Array.from({ length: 25 }, (_, i) => i < minesCount);
    setBoard(shuffle(cells));
    setRevealed([]);
    setFinished(false);
    setShake(false);
    setExplodedIdx(null);
    setLockedBet(betAmount);
    setActive(true);
  };

  const finishWin = (picksCount) => {
    const mult = calcMinesMult(picksCount, minesCount);
    const winAmt = Math.round(lockedBet * mult);
    setActive(false);
    setFinished(true);
    payout(winAmt);
    recordBet({
      game: 'Mines',
      amount: lockedBet,
      multiplier: mult,
      payout: winAmt,
    });
    sound.cashout();
    if (mult >= 10) fireConfetti(true);
    pushToast(`Mines cashed out ${mult.toFixed(2)}× (+${formatGems(winAmt)})!`, 'success');
  };

  const clickTile = (idx) => {
    if (!active || revealed.includes(idx)) return;
    const nextRevealed = [...revealed, idx];
    setRevealed(nextRevealed);

    if (board[idx]) {
      setActive(false);
      setFinished(true);
      setExplodedIdx(idx);
      setShake(true);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => setShake(false), 450);

      sound.explode();
      recordBet({
        game: 'Mines',
        amount: lockedBet,
        multiplier: 0,
        payout: 0,
      });
      pushToast('BOOM! You hit TNT!', 'error');
      return;
    }

    sound.gem();
    const nextSafe = safePicked + 1;
    if (nextSafe >= 25 - minesCount) {
      finishWin(nextSafe);
    }
  };

  const pickRandom = () => {
    if (!active) return;
    const available = [];
    for (let i = 0; i < 25; i++) {
      if (!revealed.includes(i)) available.push(i);
    }
    if (available.length === 0) return;
    clickTile(available[randInt(0, available.length - 1)]);
  };

  return (
    <GameLayout
      title="Mines"
      subtitle="Reveal PS99 diamonds and cash out before hitting hidden TNT."
      icon={<Bomb size={24} className="text-red" />}
      controls={
        <>
          <BetInput value={betAmount} onChange={setBetAmount} disabled={active} />

          <label className="field-label">
            <span>Mines (1–24)</span>
            <select
              className="input"
              value={minesCount}
              disabled={active}
              onChange={(e) => setMinesCount(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'Mine' : 'Mines'}
                </option>
              ))}
            </select>
          </label>

          {!active ? (
            <button type="button" className="btn btn-lg btn-green" onClick={startGame}>
              Start Mines
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-lg btn-gold"
                disabled={safePicked === 0}
                onClick={() => finishWin(safePicked)}
              >
                Cashout {safePicked > 0 ? formatGems(currentPayout) : ''}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={pickRandom}
              >
                <Sparkles size={16} />
                <span>Random Tile</span>
              </button>
            </>
          )}

          <div className="stat-box">
            <span className="text-muted">Next Tile</span>
            <strong className="text-gem">{nextMult.toFixed(2)}×</strong>
          </div>

          <div className="stat-box">
            <span className="text-muted">Current Profit</span>
            <strong className={currentProfit > 0 ? 'text-green' : 'text-muted'}>
              {active && safePicked > 0 ? `+${formatGems(currentProfit)}` : '0'}
            </strong>
          </div>
        </>
      }
      board={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
          <div className="mines-hud">
            <div className="mines-hud-chip">
              <span className="text-muted">Gems Found</span>
              <strong>
                {safePicked} / {25 - minesCount}
              </strong>
            </div>
            <div className="mines-hud-chip">
              <span className="text-muted">Current Mult</span>
              <strong className="text-gem">
                {active && safePicked > 0 ? currentMult.toFixed(2) : '1.00'}×
              </strong>
            </div>
            <div className="mines-hud-chip">
              <span className="text-muted">Live Payout</span>
              <strong className={active && safePicked > 0 ? 'text-green' : 'text-muted'}>
                {active && safePicked > 0 ? formatGems(currentPayout) : '—'}
              </strong>
            </div>
          </div>

          <div className={`mines-grid ${shake ? 'board-shake' : ''}`}>
          {Array.from({ length: 25 }, (_, idx) => {
            const wasPicked = revealed.includes(idx);
            const showAll = finished;
            const isRevealed = wasPicked || showAll;
            const isBomb = board[idx];

            let cls = 'mine-tile';
            if (isRevealed) {
              cls += ' revealed';
              cls += isBomb ? ' bomb' : ' safe';
              if (!wasPicked && showAll) cls += ' dimmed';
            }

            return (
              <button
                key={idx}
                type="button"
                className={cls}
                disabled={!active || wasPicked}
                onClick={() => clickTile(idx)}
                aria-label={`Mine tile ${idx + 1}`}
              >
                {explodedIdx === idx && <span className="explosion-flash" />}
                {isRevealed ? (
                  <div className="mine-tile-face">
                    {isBomb ? (
                      <img
                        src={TNT}
                        alt="TNT"
                        style={{ width: '72%', height: '72%', objectFit: 'contain' }}
                      />
                    ) : (
                      <img
                        src={GEM}
                        alt="Diamond"
                        style={{ width: '58%', height: '58%', objectFit: 'contain' }}
                      />
                    )}
                  </div>
                ) : (
                  <span style={{ opacity: 0.22, fontSize: 15 }}>✦</span>
                )}
              </button>
            );
          })}
        </div>
        </div>
      }
    />
  );
}
