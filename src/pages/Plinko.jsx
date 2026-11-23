import React, { useEffect, useRef, useState } from 'react';
import { CircleDot } from 'lucide-react';
import { rand } from '../lib/rng.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useGame } from '../store/useGame.js';
import { BetInput } from '../components/BetInput.jsx';
import { GameLayout } from '../components/GameLayout.jsx';

const TABLES = {
  8: {
    low: [5.5, 2.0, 1.1, 0.95, 0.5, 0.95, 1.1, 2.0, 5.5],
    medium: [12.5, 2.9, 1.25, 0.7, 0.4, 0.7, 1.25, 2.9, 12.5],
    high: [28, 3.9, 1.45, 0.3, 0.2, 0.3, 1.45, 3.9, 28],
  },
  12: {
    low: [9.5, 2.9, 1.6, 1.35, 1.1, 0.95, 0.5, 0.95, 1.1, 1.35, 1.6, 2.9, 9.5],
    medium: [31, 10.5, 3.8, 1.9, 1.05, 0.6, 0.3, 0.6, 1.05, 1.9, 3.8, 10.5, 31],
    high: [160, 23, 7.8, 1.9, 0.7, 0.2, 0.2, 0.2, 0.7, 1.9, 7.8, 23, 160],
  },
  16: {
    low: [15, 8.5, 2.0, 1.4, 1.35, 1.15, 1.05, 0.95, 0.5, 0.95, 1.05, 1.15, 1.35, 1.4, 2.0, 8.5, 15],
    medium: [105, 39, 9.5, 4.8, 2.8, 1.4, 1.0, 0.5, 0.3, 0.5, 1.0, 1.4, 2.8, 4.8, 9.5, 39, 105],
    high: [980, 125, 25, 8.8, 3.9, 1.95, 0.2, 0.2, 0.2, 0.2, 0.2, 1.95, 3.9, 8.8, 25, 125, 980],
  },
};

function bucketColor(idx, total) {
  const half = (total - 1) / 2;
  const dist = Math.abs(idx - half) / Math.max(1, half); // 0 center -> 1 edge
  // Yellow/Gold at center (#ffcc33) -> Red at edges (#ff3d5c)
  const r = 255;
  const g = Math.round(204 - dist * 145);
  const b = Math.round(51 + dist * 42);
  return `rgb(${r}, ${g}, ${b})`;
}

export function Plinko() {
  const placeBet = useGame((s) => s.placeBet);
  const payout = useGame((s) => s.payout);
  const recordBet = useGame((s) => s.recordBet);

  const [betAmount, setBetAmount] = useState(1_000_000);
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState('medium');
  const [activeCount, setActiveCount] = useState(0);
  const [recentHits, setRecentHits] = useState([]);

  const canvasRef = useRef(null);
  const ballsRef = useRef([]);
  const pulseRef = useRef({});
  const pegPulseRef = useRef({});
  const rowsRef = useRef(rows);
  const riskRef = useRef(risk);
  rowsRef.current = rows;
  riskRef.current = risk;

  useEffect(() => {
    let rafId = null;
    let alive = true;

    const render = (now) => {
      if (!alive) return;
      rafId = requestAnimationFrame(render);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;

      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const R = rowsRef.current;
      const mults = TABLES[R][riskRef.current];
      const topPad = 32;
      const botPad = 52;
      const usableH = h - topPad - botPad;
      const rowGap = usableH / (R + 0.5);
      const maxCols = R + 2;
      const colGap = Math.min(38, (w - 44) / maxCols);
      const centerX = w / 2;
      const pegRadius = R === 16 ? 3.5 : R === 12 ? 4.5 : 5.5;

      const pegPos = (r, c) => {
        const count = r + 3;
        const x = centerX + (c - (count - 1) / 2) * colGap;
        const y = topPad + r * rowGap;
        return { x, y };
      };

      // Draw pegs with optional hit pulse glow
      for (let r = 0; r < R; r++) {
        const count = r + 3;
        for (let c = 0; c < count; c++) {
          const { x, y } = pegPos(r, c);
          const pTime = pegPulseRef.current[`${r}-${c}`] || 0;
          const pAge = now - pTime;
          const pulsing = pTime > 0 && pAge < 260;

          if (pulsing) {
            const pNorm = 1 - pAge / 260;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, pegRadius + 5 * (1 - pNorm), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(56, 217, 255, ${0.42 * pNorm})`;
            ctx.fill();
            ctx.restore();
          }

          ctx.fillStyle = pulsing ? '#38d9ff' : '#c8d2ff';
          ctx.beginPath();
          ctx.arc(x, y, pegRadius + (pulsing ? 1 : 0), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Update & draw falling balls
      const stepMs = R === 16 ? 135 : 155;
      const remainingBalls = [];
      for (const ball of ballsRef.current) {
        if (ball.startTime === null) {
          ball.startTime = now;
        }
        const elapsed = Math.max(0, now - ball.startTime);
        const stepFloat = elapsed / stepMs;
        const rawStepIdx = Math.floor(stepFloat);

        if (rawStepIdx >= ball.steps.length - 1) {
          // Landed!
          const mult = ball.mult;
          const winAmt = Math.round(ball.bet * mult);
          pulseRef.current[ball.bucket] = now;
          if (winAmt > 0) payout(winAmt);
          recordBet({
            game: 'Plinko',
            amount: ball.bet,
            multiplier: mult,
            payout: winAmt,
          });
          if (mult >= 10) {
            sound.bigWin();
            fireConfetti(true);
          } else if (mult >= 1) {
            sound.win();
          } else {
            sound.tick();
          }
          setRecentHits((prev) => [{ id: ball.id, mult }, ...prev].slice(0, 8));
          continue;
        }

        remainingBalls.push(ball);
        const stepIdx = Math.min(ball.steps.length - 2, Math.max(0, rawStepIdx));
        const from = ball.steps[stepIdx];
        const to = ball.steps[stepIdx + 1];

        if (stepIdx > (ball.lastStep ?? 0)) {
          ball.lastStep = stepIdx;
          sound.peg();
          const hitRow = stepIdx - 1;
          if (hitRow >= 0 && hitRow < R) {
            const hitCol = Math.round(from.colOffset + (hitRow + 2) / 2);
            pegPulseRef.current[`${hitRow}-${hitCol}`] = now;
          }
        }

        const t = Math.min(1, Math.max(0, stepFloat - stepIdx));
        const fromX = centerX + from.colOffset * colGap;
        const toX = centerX + to.colOffset * colGap;
        const fromY = topPad + (from.row - 0.5) * rowGap;
        const toY = topPad + (to.row - 0.5) * rowGap;

        const bx = fromX + (toX - fromX) * (1 - Math.pow(1 - t, 1.5));
        const bounce = Math.sin(t * Math.PI) * (rowGap * 0.28);
        const by = fromY + (toY - fromY) * (t * t * 0.6 + t * 0.4) - bounce;

        ball.trail = [...(ball.trail || []), { x: bx, y: by }].slice(-5);

        // Subtle glowing cyan trail
        for (let ti = 0; ti < ball.trail.length - 1; ti++) {
          const pt = ball.trail[ti];
          const alpha = ((ti + 1) / ball.trail.length) * 0.35;
          const rad = (pegRadius + 2.5) * ((ti + 1) / ball.trail.length);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(56, 217, 255, ${alpha})`;
          ctx.fill();
        }

        // Ball glow
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, pegRadius + 3.4, 0, Math.PI * 2);
        ctx.fillStyle = '#38d9ff';
        ctx.shadowColor = '#38d9ff';
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.restore();
      }

      if (remainingBalls.length !== ballsRef.current.length) {
        ballsRef.current = remainingBalls;
        setActiveCount(remainingBalls.length);
      }

      // Draw multiplier buckets along bottom
      const bCount = mults.length;
      const bY = topPad + R * rowGap + 4;
      const bW = Math.max(18, colGap - 4);
      const bH = 28;

      for (let i = 0; i < bCount; i++) {
        const bx = centerX + (i - (bCount - 1) / 2) * colGap;
        const pTime = pulseRef.current[i] || 0;
        const age = now - pTime;
        const pulseY = age < 320 ? Math.sin((age / 320) * Math.PI) * 6 : 0;

        ctx.save();
        ctx.fillStyle = bucketColor(i, bCount);
        ctx.beginPath();
        ctx.roundRect(bx - bW / 2, bY + pulseY, bW, bH, 6);
        ctx.fill();

        ctx.fillStyle = '#140c00';
        ctx.font = `700 ${R === 16 ? 9 : 10.5}px Poppins, Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${mults[i]}×`, bx, bY + pulseY + bH / 2);
        ctx.restore();
      }

      ctx.restore();
    };

    rafId = requestAnimationFrame(render);
    return () => {
      alive = false;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [payout, recordBet]);

  const dropBall = () => {
    if (!placeBet(betAmount)) return;
    sound.click();

    const R = rows;
    let rights = 0;
    const steps = [{ row: 0, colOffset: 0 }];

    for (let r = 0; r < R; r++) {
      const goRight = rand() >= 0.5;
      if (goRight) rights++;
      const offset = steps[steps.length - 1].colOffset + (goRight ? 0.5 : -0.5);
      steps.push({ row: r + 1, colOffset: offset });
    }
    // Final drop into bucket
    steps.push({ row: R + 0.65, colOffset: steps[steps.length - 1].colOffset });

    const mult = TABLES[R][risk][rights];
    ballsRef.current.push({
      id: `${Date.now()}-${Math.random()}`,
      bet: betAmount,
      bucket: rights,
      mult,
      steps,
      startTime: null,
      lastStep: 0,
      trail: [],
    });
    setActiveCount(ballsRef.current.length);
  };

  return (
    <GameLayout
      title="Plinko"
      subtitle="Drop gem balls through pegs — multiple balls allowed!"
      icon={<CircleDot size={26} className="text-gem" />}
      controls={
        <>
          <BetInput value={betAmount} onChange={setBetAmount} />

          <div className="field-label">
            <span>Rows</span>
            <div className="seg-group">
              {[8, 12, 16].map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={activeCount > 0}
                  className={`seg-btn ${rows === r ? 'active' : ''}`}
                  onClick={() => {
                    sound.click();
                    setRows(r);
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="field-label">
            <span>Risk</span>
            <div className="seg-group">
              {['low', 'medium', 'high'].map((rk) => (
                <button
                  key={rk}
                  type="button"
                  disabled={activeCount > 0}
                  className={`seg-btn ${risk === rk ? 'active' : ''}`}
                  onClick={() => {
                    sound.click();
                    setRisk(rk);
                  }}
                >
                  {rk[0].toUpperCase() + rk.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="btn btn-lg btn-primary" onClick={dropBall}>
            Drop Gem Ball ({formatGems(betAmount)})
          </button>

          <div className="stat-box">
            <span className="text-muted">Max Multiplier</span>
            <strong className="text-gold">{TABLES[rows][risk][0]}×</strong>
          </div>

          <div className="stat-box">
            <span className="text-muted">House Edge</span>
            <strong>~4%</strong>
          </div>
        </>
      }
      board={
        <div>
          {recentHits.length > 0 && (
            <div className="crash-history-strip" style={{ justifyContent: 'flex-end' }}>
              {recentHits.map((h) => (
                <span
                  key={h.id}
                  className={`crash-pill ${
                    h.mult >= 10
                      ? 'crash-pill-gold'
                      : h.mult >= 1
                      ? 'crash-pill-green'
                      : 'crash-pill-red'
                  }`}
                >
                  {h.mult}×
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              background: 'var(--bg-deep)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              height: 410,
              overflow: 'hidden',
            }}
          >
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
      }
    />
  );
}
