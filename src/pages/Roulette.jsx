import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Disc } from 'lucide-react';
import { rand, randInt } from '../lib/rng.js';
import { randomBotName } from '../lib/bots.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { BetInput } from '../components/BetInput.jsx';
import { GameLayout } from '../components/GameLayout.jsx';
import { GemAmount } from '../components/GemAmount.jsx';

// 15 slots: 1 gold (0), 7 red, 7 purple
const WHEEL_SLOTS = [
  { color: 'gold', label: '14×' },
  { color: 'red', label: '1' },
  { color: 'purple', label: '8' },
  { color: 'red', label: '2' },
  { color: 'purple', label: '9' },
  { color: 'red', label: '3' },
  { color: 'purple', label: '10' },
  { color: 'red', label: '4' },
  { color: 'purple', label: '11' },
  { color: 'red', label: '5' },
  { color: 'purple', label: '12' },
  { color: 'red', label: '6' },
  { color: 'purple', label: '13' },
  { color: 'red', label: '7' },
  { color: 'purple', label: '14' },
];

const SLOT_W = 74;
const SLOT_GAP = 6;
const STEP = SLOT_W + SLOT_GAP;
const CYCLES = 7;
const BETTING_MS = 15000;
const SPIN_MS = 5000;
const RESULT_PAUSE_MS = 2200;

function makeBotBets() {
  const bets = { red: [], gold: [], purple: [] };
  const count = randInt(8, 15);
  const pools = [250_000, 1_000_000, 5_000_000, 15_000_000, 50_000_000];
  for (let i = 0; i < count; i++) {
    const r = rand();
    const color = r < 0.44 ? 'red' : r < 0.88 ? 'purple' : 'gold';
    bets[color].push({
      id: `${i}-${Date.now()}`,
      name: randomBotName(),
      amount: pools[randInt(0, pools.length - 1)],
    });
  }
  return bets;
}

export function Roulette() {
  const placeBet = useGame((s) => s.placeBet);
  const payout = useGame((s) => s.payout);
  const recordBet = useGame((s) => s.recordBet);
  const username = useGame((s) => s.username);
  const pushToast = useToast((s) => s.push);

  const [betAmount, setBetAmount] = useState(1_000_000);
  const [phase, setPhase] = useState('betting'); // 'betting' | 'spinning' | 'result'
  const [timeLeft, setTimeLeft] = useState(15);
  const [userBets, setUserBets] = useState({ red: 0, gold: 0, purple: 0 });
  const [botBets, setBotBets] = useState(() => makeBotBets());
  const [history, setHistory] = useState(() =>
    Array.from({ length: 20 }, () => WHEEL_SLOTS[randInt(0, 14)].color)
  );
  const [lastWinner, setLastWinner] = useState(null);
  const [translateX, setTranslateX] = useState(0);
  const [transitionCss, setTransitionCss] = useState('none');

  const vpRef = useRef(null);
  const trackRef = useRef(null);
  const userBetsRef = useRef(userBets);
  userBetsRef.current = userBets;

  const repeatedSlots = useMemo(() => {
    const arr = [];
    for (let c = 0; c < CYCLES; c++) {
      for (const s of WHEEL_SLOTS) arr.push(s);
    }
    return arr;
  }, []);

  useEffect(() => {
    let alive = true;
    let countdownInt = null;
    let phaseTimer = null;
    let pauseTimer = null;
    let tickRaf = null;

    const startBettingPhase = () => {
      if (!alive) return;
      const freshBots = makeBotBets();
      setPhase('betting');
      setTimeLeft(15);
      setLastWinner(null);
      setUserBets({ red: 0, gold: 0, purple: 0 });
      setBotBets(freshBots);
      setTransitionCss('none');
      setTranslateX(0);

      const started = Date.now();
      countdownInt = setInterval(() => {
        if (!alive) return;
        const rem = Math.max(0, (BETTING_MS - (Date.now() - started)) / 1000);
        setTimeLeft(rem);
      }, 100);

      phaseTimer = setTimeout(() => {
        if (!alive) return;
        clearInterval(countdownInt);
        startSpinPhase();
      }, BETTING_MS);
    };

    const startSpinPhase = () => {
      if (!alive) return;
      setPhase('spinning');
      const winIdx = randInt(0, WHEEL_SLOTS.length - 1);
      const winner = WHEEL_SLOTS[winIdx];
      const targetIndex = 4 * WHEEL_SLOTS.length + winIdx;

      requestAnimationFrame(() => {
        if (!alive) return;
        const vpW = vpRef.current?.clientWidth || 720;
        const centerOffset = vpW / 2 - SLOT_W / 2;
        const jitter = (rand() - 0.5) * (SLOT_W * 0.55);
        const targetX = -(targetIndex * STEP - centerOffset + jitter);

        if (trackRef.current) void trackRef.current.offsetWidth;
        setTransitionCss(`transform ${SPIN_MS}ms cubic-bezier(0.12, 0.85, 0.16, 1)`);
        setTranslateX(targetX);

        let lastSlotIdx = -1;
        const watchTicks = () => {
          if (!alive) return;
          if (trackRef.current && vpRef.current) {
            const vpR = vpRef.current.getBoundingClientRect();
            const trR = trackRef.current.getBoundingClientRect();
            const idx = Math.floor((vpR.left + vpR.width / 2 - trR.left) / STEP);
            if (idx !== lastSlotIdx && idx >= 0) {
              lastSlotIdx = idx;
              sound.tick();
            }
          }
          tickRaf = requestAnimationFrame(watchTicks);
        };
        tickRaf = requestAnimationFrame(watchTicks);

        phaseTimer = setTimeout(() => {
          if (!alive) return;
          if (tickRaf) cancelAnimationFrame(tickRaf);
          setPhase('result');
          setLastWinner(winner);
          setHistory((h) => [winner.color, ...h].slice(0, 20));

          const bets = userBetsRef.current;
          const totalBet = bets.red + bets.gold + bets.purple;
          if (totalBet > 0) {
            const mult = winner.color === 'gold' ? 14 : 2;
            const winAmt = Math.round(bets[winner.color] * mult);
            const effMult = winAmt / totalBet;
            if (winAmt > 0) payout(winAmt);
            recordBet({
              game: 'Roulette',
              amount: totalBet,
              multiplier: effMult,
              payout: winAmt,
            });
            if (winAmt > 0) {
              if (winner.color === 'gold' || effMult >= 10) {
                sound.bigWin();
                fireConfetti(true);
              } else {
                sound.win();
              }
              pushToast(
                `Roulette landed ${winner.color.toUpperCase()}! Won ${formatGems(winAmt)}`,
                'success'
              );
            } else {
              sound.lose();
            }
          }

          pauseTimer = setTimeout(() => {
            if (alive) startBettingPhase();
          }, RESULT_PAUSE_MS);
        }, SPIN_MS + 80);
      });
    };

    startBettingPhase();

    return () => {
      alive = false;
      if (countdownInt) clearInterval(countdownInt);
      if (phaseTimer) clearTimeout(phaseTimer);
      if (pauseTimer) clearTimeout(pauseTimer);
      if (tickRaf) cancelAnimationFrame(tickRaf);
    };
  }, [payout, pushToast, recordBet]);

  const placeColorBet = (color) => {
    if (phase !== 'betting') return;
    if (!placeBet(betAmount)) return;
    sound.click();
    setUserBets((prev) => ({ ...prev, [color]: prev[color] + betAmount }));
  };

  const colTotal = (color) =>
    userBets[color] + botBets[color].reduce((s, b) => s + b.amount, 0);

  return (
    <GameLayout
      title="Roulette"
      subtitle="Bet Red (2×), Purple (2×), or Gold (14×) every 15 seconds."
      icon={<Disc size={26} className="text-red" />}
      controls={
        <>
          <BetInput
            value={betAmount}
            onChange={setBetAmount}
            disabled={phase !== 'betting'}
          />

          <div style={{ display: 'grid', gap: 8 }}>
            <button
              type="button"
              className="btn btn-lg btn-red"
              disabled={phase !== 'betting'}
              onClick={() => placeColorBet('red')}
            >
              Bet Red (2×)
            </button>
            <button
              type="button"
              className="btn btn-lg btn-gold"
              disabled={phase !== 'betting'}
              onClick={() => placeColorBet('gold')}
            >
              Bet Gold (14×)
            </button>
            <button
              type="button"
              className="btn btn-lg btn-purple"
              disabled={phase !== 'betting'}
              onClick={() => placeColorBet('purple')}
            >
              Bet Purple (2×)
            </button>
          </div>

          <div className="stat-box">
            <span className="text-muted">Your Round Bets</span>
            <strong>
              {formatGems(userBets.red + userBets.gold + userBets.purple)}
            </strong>
          </div>

          <div className="stat-box">
            <span className="text-muted">House Edge</span>
            <strong>6.67%</strong>
          </div>
        </>
      }
      board={
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {phase === 'betting' && (
                <span>
                  Rolling in <span className="text-gem">{timeLeft.toFixed(1)}s</span>
                </span>
              )}
              {phase === 'spinning' && <span className="text-gold">Spinning wheel…</span>}
              {phase === 'result' && lastWinner && (
                <span
                  className={
                    lastWinner.color === 'gold'
                      ? 'text-gold'
                      : lastWinner.color === 'red'
                      ? 'text-red'
                      : 'text-gem'
                  }
                >
                  Landed on {lastWinner.color.toUpperCase()} ({lastWinner.label})!
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {history.map((c, idx) => (
                <span
                  key={idx}
                  title={c}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    display: 'inline-block',
                    background:
                      c === 'gold'
                        ? 'var(--gold)'
                        : c === 'red'
                        ? 'var(--red)'
                        : 'var(--purple)',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="roulette-reel-wrap">
            <div className="case-reel-marker" />
            <div ref={vpRef} style={{ overflow: 'hidden' }}>
              <div
                ref={trackRef}
                className="roulette-track"
                style={{
                  transform: `translate3d(${translateX}px, 0, 0)`,
                  transition: transitionCss,
                }}
              >
                {repeatedSlots.map((slot, idx) => (
                  <div key={idx} className={`roulette-slot slot-${slot.color}`}>
                    {slot.color === 'gold' ? '★' : slot.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="roulette-cols">
            {[
              { key: 'red', title: 'Red 2×', color: 'var(--red)' },
              { key: 'gold', title: 'Gold 14×', color: 'var(--gold)' },
              { key: 'purple', title: 'Purple 2×', color: 'var(--purple)' },
            ].map((col) => (
              <div
                key={col.key}
                className="roulette-col"
                style={{
                  borderColor:
                    phase === 'result' && lastWinner?.color === col.key
                      ? col.color
                      : 'var(--border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    fontWeight: 700,
                    color: col.color,
                  }}
                >
                  <span>{col.title}</span>
                  <GemAmount value={colTotal(col.key)} iconSize={13} />
                </div>

                <div style={{ display: 'grid', gap: 5, fontSize: 12.5 }}>
                  {userBets[col.key] > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: 'var(--gem)',
                        fontWeight: 700,
                      }}
                    >
                      <span>{username} (YOU)</span>
                      <GemAmount value={userBets[col.key]} iconSize={12} />
                    </div>
                  )}
                  {botBets[col.key].map((b) => (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>{b.name}</span>
                      <span>{formatGems(b.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      }
    />
  );
}
