import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import ps99 from '../data/ps99.json';
import { img } from '../lib/assets.js';
import { crashPoint, rand, randInt } from '../lib/rng.js';
import { randomBotName } from '../lib/bots.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { BetInput } from '../components/BetInput.jsx';
import { GameLayout } from '../components/GameLayout.jsx';
import { GemAmount } from '../components/GemAmount.jsx';

const BETTING_MS = 7000;
const CRASHED_PAUSE_MS = 3000;

function makeBotPlayers() {
  const count = randInt(8, 14);
  return Array.from({ length: count }, (_, idx) => {
    const base = [100_000, 500_000, 2_000_000, 10_000_000, 25_000_000, 75_000_000][
      randInt(0, 5)
    ];
    return {
      id: `bot-${idx}-${Date.now()}`,
      name: randomBotName(),
      bet: Math.round(base * (0.7 + rand() * 0.8)),
      target: Number((1.15 + Math.pow(rand(), 2) * 8).toFixed(2)),
      cashedAt: null,
    };
  });
}

export function Crash() {
  const placeBet = useGame((s) => s.placeBet);
  const payout = useGame((s) => s.payout);
  const recordBet = useGame((s) => s.recordBet);
  const username = useGame((s) => s.username);
  const pushToast = useToast((s) => s.push);

  const [betAmount, setBetAmount] = useState(1_000_000);
  const [autoCashoutText, setAutoCashoutText] = useState('2.00');
  const [phase, setPhase] = useState('betting'); // 'betting' | 'flying' | 'crashed'
  const [countdownPct, setCountdownPct] = useState(100);
  const [mult, setMult] = useState(1.0);
  const [history, setHistory] = useState(() =>
    Array.from({ length: 15 }, () => crashPoint())
  );
  const [bots, setBots] = useState(() => makeBotPlayers());
  const [activeBet, setActiveBet] = useState(null); // { amount, autoCashout, cashedAt }

  const canvasRef = useRef(null);
  const petImgRef = useRef(null);
  const particlesRef = useRef([]);
  const crashRingRef = useRef(null);
  const stateRef = useRef({
    phase: 'betting',
    phaseStart: performance.now(),
    crashAt: crashPoint(),
    mult: 1.0,
    bots: bots,
    activeBet: null,
  });

  const riderPet = useMemo(() => {
    const huges = ps99.showcase.filter((p) => p.tier === 'huge');
    return huges[0] || ps99.showcase[0];
  }, []);

  // Preload PS99 Huge pet image for canvas rocket
  useEffect(() => {
    if (!riderPet?.thumb) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = img(riderPet.thumb);
    image.onload = () => {
      petImgRef.current = image;
    };
  }, [riderPet]);

  const handleCashout = () => {
    const st = stateRef.current;
    if (st.phase !== 'flying' || !st.activeBet || st.activeBet.cashedAt) return;
    const cashMult = Math.max(1.0, Number(st.mult.toFixed(2)));
    const winAmount = Math.round(st.activeBet.amount * cashMult);
    st.activeBet = { ...st.activeBet, cashedAt: cashMult };
    setActiveBet(st.activeBet);

    payout(winAmount);
    recordBet({
      game: 'Crash',
      amount: st.activeBet.amount,
      multiplier: cashMult,
      payout: winAmount,
    });
    sound.cashout();
    if (cashMult >= 10) fireConfetti(true);
    pushToast(`Cashed out @ ${cashMult.toFixed(2)}× (+${formatGems(winAmount)})`, 'success');
  };

  useEffect(() => {
    let rafId = null;
    let alive = true;

    const st = stateRef.current;
    st.phase = 'betting';
    st.phaseStart = performance.now();
    st.crashAt = crashPoint();

    const drawCanvas = (elapsedFlyMs, currentPhase) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // Axes & subtle grid
      const padL = 44;
      const padB = 34;
      const padT = 26;
      const padR = 32;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      ctx.strokeStyle = 'rgba(62, 224, 255, 0.1)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        const y = padT + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(150, 160, 209, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, h - padB);
      ctx.lineTo(w - padR, h - padB);
      ctx.stroke();

      if (currentPhase === 'betting') {
        particlesRef.current = [];
        crashRingRef.current = null;
        ctx.restore();
        return;
      }

      const nowFrame = performance.now();

      const totalSec = Math.max(4, elapsedFlyMs / 1000);
      const maxMult = Math.max(2, st.mult * 1.15);

      const points = [];
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const t = (elapsedFlyMs * i) / steps;
        const m = Math.exp(0.00006 * t);
        const x = padL + ((t / 1000) / totalSec) * plotW;
        const normY = Math.min(1, (m - 1) / (maxMult - 1));
        const y = h - padB - Math.pow(normY, 0.85) * plotH;
        points.push({ x, y });
      }

      // Area glow under curve
      const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
      if (currentPhase === 'crashed') {
        grad.addColorStop(0, 'rgba(255, 77, 109, 0.35)');
        grad.addColorStop(1, 'rgba(255, 77, 109, 0.0)');
      } else {
        grad.addColorStop(0, 'rgba(62, 224, 255, 0.35)');
        grad.addColorStop(1, 'rgba(155, 92, 255, 0.0)');
      }

      ctx.beginPath();
      ctx.moveTo(padL, h - padB);
      for (const p of points) ctx.lineTo(p.x, p.y);
      const last = points[points.length - 1];
      ctx.lineTo(last.x, h - padB);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Main glowing curve
      ctx.beginPath();
      points.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.lineWidth = 4;
      ctx.strokeStyle = currentPhase === 'crashed' ? '#ff4d6d' : '#3ee0ff';
      ctx.shadowColor = currentPhase === 'crashed' ? '#ff4d6d' : '#3ee0ff';
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Thruster flame particles & Huge Pet medallion at curve tip
      if (last) {
        if (currentPhase === 'flying') {
          particlesRef.current.push({
            x: last.x - 4 + (Math.random() - 0.5) * 6,
            y: last.y + 4 + (Math.random() - 0.5) * 6,
            vx: -1.3 - Math.random() * 1.4,
            vy: 0.7 + Math.random() * 1.2,
            born: nowFrame,
            color: Math.random() < 0.62 ? '#38d9ff' : '#8b5cf6',
          });
          if (particlesRef.current.length > 26) {
            particlesRef.current.shift();
          }
        }

        const aliveParticles = [];
        for (const pt of particlesRef.current) {
          const age = nowFrame - pt.born;
          if (age > 450) continue;
          pt.x += pt.vx;
          pt.y += pt.vy;
          const life = 1 - age / 450;
          ctx.save();
          ctx.globalAlpha = life * 0.85;
          ctx.fillStyle = pt.color;
          ctx.shadowColor = pt.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4.5 * life, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          aliveParticles.push(pt);
        }
        particlesRef.current = aliveParticles;

        if (currentPhase === 'crashed' && crashRingRef.current) {
          const ringAge = nowFrame - crashRingRef.current.start;
          if (ringAge < 550) {
            const p = ringAge / 550;
            ctx.save();
            ctx.beginPath();
            ctx.arc(last.x, last.y, 12 + p * 54, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff4757';
            ctx.globalAlpha = 1 - p;
            ctx.lineWidth = 4 * (1 - p) + 1;
            ctx.stroke();
            ctx.restore();
          }
        }

        ctx.save();
        ctx.translate(last.x, last.y);
        if (currentPhase === 'crashed') {
          ctx.rotate(0.42);
          ctx.globalAlpha = 0.78;
        } else {
          ctx.rotate(-0.12 + Math.sin(nowFrame / 120) * 0.06);
        }

        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fillStyle = '#12151f';
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, 20.5, 0, Math.PI * 2);
        ctx.clip();
        if (petImgRef.current) {
          ctx.drawImage(petImgRef.current, -21, -21, 42, 42);
        } else {
          ctx.fillStyle = currentPhase === 'crashed' ? '#ff4757' : '#ffc531';
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = currentPhase === 'crashed' ? '#ff4757' : '#38d9ff';
        ctx.shadowColor = currentPhase === 'crashed' ? '#ff4757' : '#38d9ff';
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    };

    const loop = (now) => {
      if (!alive) return;
      const elapsed = now - st.phaseStart;

      if (st.phase === 'betting') {
        const pct = Math.max(0, 100 - (elapsed / BETTING_MS) * 100);
        setCountdownPct(pct);
        drawCanvas(0, 'betting');
        if (elapsed >= BETTING_MS) {
          st.phase = 'flying';
          st.phaseStart = now;
          st.mult = 1.0;
          setPhase('flying');
          setMult(1.0);
          sound.flip();
        }
      } else if (st.phase === 'flying') {
        const nextMult = Math.exp(0.00006 * elapsed);
        if (nextMult >= st.crashAt) {
          st.mult = st.crashAt;
          st.phase = 'crashed';
          st.phaseStart = now;
          crashRingRef.current = { start: performance.now() };
          setMult(st.crashAt);
          setPhase('crashed');
          setHistory((h) => [st.crashAt, ...h].slice(0, 15));
          sound.explode();

          // Record loss if user bet and didn't cash out
          if (st.activeBet && !st.activeBet.cashedAt) {
            recordBet({
              game: 'Crash',
              amount: st.activeBet.amount,
              multiplier: 0,
              payout: 0,
            });
          }
          drawCanvas(elapsed, 'crashed');
        } else {
          st.mult = nextMult;
          setMult(nextMult);

          // Bot auto cashouts
          let botsChanged = false;
          const updatedBots = st.bots.map((b) => {
            if (!b.cashedAt && nextMult >= b.target) {
              botsChanged = true;
              return { ...b, cashedAt: b.target };
            }
            return b;
          });
          if (botsChanged) {
            st.bots = updatedBots;
            setBots(updatedBots);
          }

          // User auto cashout
          if (
            st.activeBet &&
            !st.activeBet.cashedAt &&
            st.activeBet.autoCashout >= 1.01 &&
            nextMult >= st.activeBet.autoCashout
          ) {
            const target = st.activeBet.autoCashout;
            const winAmount = Math.round(st.activeBet.amount * target);
            st.activeBet = { ...st.activeBet, cashedAt: target };
            setActiveBet(st.activeBet);
            payout(winAmount);
            recordBet({
              game: 'Crash',
              amount: st.activeBet.amount,
              multiplier: target,
              payout: winAmount,
            });
            sound.cashout();
            if (target >= 10) fireConfetti(true);
            pushToast(`Auto-cashed @ ${target.toFixed(2)}× (+${formatGems(winAmount)})`, 'success');
          }

          drawCanvas(elapsed, 'flying');
        }
      } else if (st.phase === 'crashed') {
        const flyDur = Math.log(Math.max(1, st.crashAt)) / 0.00006;
        drawCanvas(flyDur, 'crashed');
        if (elapsed >= CRASHED_PAUSE_MS) {
          const freshBots = makeBotPlayers();
          st.phase = 'betting';
          st.phaseStart = now;
          st.crashAt = crashPoint();
          st.mult = 1.0;
          st.bots = freshBots;
          st.activeBet = null;
          setPhase('betting');
          setMult(1.0);
          setCountdownPct(100);
          setBots(freshBots);
          setActiveBet(null);
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [payout, pushToast, recordBet]);

  const handlePlaceBet = () => {
    if (phase !== 'betting' || activeBet) return;
    if (!placeBet(betAmount)) return;
    sound.click();
    const auto = Number(autoCashoutText);
    const betObj = {
      amount: betAmount,
      autoCashout: Number.isFinite(auto) && auto >= 1.01 ? auto : 0,
      cashedAt: null,
    };
    stateRef.current.activeBet = betObj;
    setActiveBet(betObj);
  };

  const multColor =
    phase === 'crashed'
      ? 'var(--red)'
      : mult >= 10
      ? 'var(--gold)'
      : mult >= 2
      ? 'var(--green)'
      : 'var(--gem)';

  const liveWin = activeBet && !activeBet.cashedAt ? Math.round(activeBet.amount * mult) : 0;

  return (
    <GameLayout
      title="Crash"
      subtitle="Huge pet rides the gem rocket — cash out before it crashes!"
      icon={<TrendingUp size={26} className="text-gem" />}
      controls={
        <>
          <BetInput
            value={betAmount}
            onChange={setBetAmount}
            disabled={phase !== 'betting' || !!activeBet}
          />

          <label className="field-label">
            <span>Auto Cashout (optional, ≥ 1.01×)</span>
            <input
              className="input"
              type="number"
              step="0.05"
              min="0"
              value={autoCashoutText}
              disabled={phase !== 'betting' || !!activeBet}
              onChange={(e) => setAutoCashoutText(e.target.value)}
              placeholder="e.g. 2.00"
            />
          </label>

          {phase === 'flying' && activeBet && !activeBet.cashedAt ? (
            <button
              type="button"
              className="btn btn-lg btn-green"
              onClick={handleCashout}
            >
              Cashout {formatGems(liveWin)}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-lg btn-primary"
              disabled={phase !== 'betting' || !!activeBet}
              onClick={handlePlaceBet}
            >
              {activeBet
                ? activeBet.cashedAt
                  ? `Cashed @ ${activeBet.cashedAt.toFixed(2)}×`
                  : 'Bet Locked In!'
                : phase === 'betting'
                ? 'Place Bet'
                : 'Wait for Next Round…'}
            </button>
          )}
        </>
      }
      board={
        <div>
          <div className="crash-history-strip">
            {history.map((pt, i) => (
              <span
                key={i}
                className={`crash-pill ${
                  pt >= 10
                    ? 'crash-pill-gold'
                    : pt >= 2
                    ? 'crash-pill-green'
                    : 'crash-pill-red'
                }`}
              >
                {pt.toFixed(2)}×
              </span>
            ))}
          </div>

          <div className="crash-stage">
            <div className="crash-canvas-wrap">
              <canvas ref={canvasRef} className="crash-canvas" />
              <div className="crash-overlay">
                {phase === 'betting' && (
                  <>
                    <div className="text-muted" style={{ fontWeight: 700, fontSize: 15 }}>
                      NEXT ROUND STARTING…
                    </div>
                    <div className="crash-countdown-bar">
                      <div
                        className="crash-countdown-fill"
                        style={{ width: `${countdownPct}%` }}
                      />
                    </div>
                  </>
                )}

                {phase === 'flying' && (
                  <div className="crash-mult-big" style={{ color: multColor }}>
                    {mult.toFixed(2)}×
                  </div>
                )}

                {phase === 'crashed' && (
                  <>
                    <div className="crash-mult-big" style={{ color: 'var(--red)' }}>
                      CRASHED @ {mult.toFixed(2)}×
                    </div>
                    <div className="text-muted" style={{ marginTop: 6, fontWeight: 700 }}>
                      Starting new round…
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="crash-players">
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>
                Players ({bots.length + (activeBet ? 1 : 0)})
              </div>

              {activeBet && (
                <div
                  className={`crash-player-row ${
                    activeBet.cashedAt
                      ? 'cashed'
                      : phase === 'crashed'
                      ? 'lost'
                      : ''
                  }`}
                  style={{ border: '1px solid rgba(62,224,255,0.4)' }}
                >
                  <span>
                    <strong className="text-gem">YOU</strong> ({username})
                  </span>
                  <span>
                    {activeBet.cashedAt ? (
                      `${activeBet.cashedAt.toFixed(2)}×`
                    ) : (
                      <GemAmount value={activeBet.amount} iconSize={12} />
                    )}
                  </span>
                </div>
              )}

              {bots.map((b) => (
                <div
                  key={b.id}
                  className={`crash-player-row ${
                    b.cashedAt ? 'cashed' : phase === 'crashed' ? 'lost' : ''
                  }`}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.name}
                  </span>
                  <span>
                    {b.cashedAt ? (
                      `${b.cashedAt.toFixed(2)}×`
                    ) : (
                      <GemAmount value={b.bet} iconSize={12} />
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}
