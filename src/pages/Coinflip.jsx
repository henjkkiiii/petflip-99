import React, { useEffect, useRef, useState } from 'react';
import { Coins, RefreshCw } from 'lucide-react';
import ps99 from '../data/ps99.json';
import { GEM } from '../lib/assets.js';
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
import { PetImage } from '../components/PetImage.jsx';

function makeLobbyGames() {
  const amounts = [1_000_000, 5_000_000, 15_000_000, 50_000_000, 100_000_000];
  const count = randInt(4, 6);
  return Array.from({ length: count }, (_, idx) => ({
    id: `cf-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    creator: randomBotName(),
    bet: amounts[randInt(0, amounts.length - 1)],
    side: rand() < 0.5 ? 'diamond' : 'huge',
  }));
}

export function Coinflip() {
  const placeBet = useGame((s) => s.placeBet);
  const payout = useGame((s) => s.payout);
  const recordBet = useGame((s) => s.recordBet);
  const username = useGame((s) => s.username);
  const pushToast = useToast((s) => s.push);

  const [betAmount, setBetAmount] = useState(5_000_000);
  const [chosenSide, setChosenSide] = useState('diamond');
  const [lobby, setLobby] = useState(() => makeLobbyGames());
  const [activeMatch, setActiveMatch] = useState(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const timersRef = useRef([]);

  const hugeCoinPet = ps99.showcase.find((p) => p.tier === 'huge') || ps99.showcase[0];

  useEffect(() => {
    const interval = setInterval(() => {
      setLobby((prev) => {
        if (prev.length >= 6) return [...prev.slice(1), ...makeLobbyGames().slice(0, 1)];
        return makeLobbyGames();
      });
    }, 12000);
    return () => {
      clearInterval(interval);
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const runFlip = ({ bet, userSide, opponentName }) => {
    const win = rand() < 0.5;
    const outcome = win ? userSide : userSide === 'diamond' ? 'huge' : 'diamond';

    setActiveMatch({
      bet,
      userSide,
      opponentName,
      status: 'flipping',
      outcome: null,
      win: null,
    });

    sound.flip();
    const extraSpins = 360 * 6;
    const targetFaceDeg = outcome === 'diamond' ? 0 : 180;
    setRotationDeg((prev) => {
      const base = prev - (prev % 360);
      return base + extraSpins + targetFaceDeg;
    });

    const t = setTimeout(() => {
      const winAmt = win ? Math.round(bet * 1.9) : 0;
      if (winAmt > 0) payout(winAmt);
      recordBet({
        game: 'Coinflip',
        amount: bet,
        multiplier: win ? 1.9 : 0,
        payout: winAmt,
      });

      setActiveMatch({
        bet,
        userSide,
        opponentName,
        status: 'done',
        outcome,
        win,
      });

      sound.coin();
      if (win) {
        sound.win();
        if (bet >= 50_000_000) fireConfetti(true);
        pushToast(`Won Coinflip (+${formatGems(winAmt)})!`, 'success');
      } else {
        sound.lose();
        pushToast(`${opponentName} won the flip!`, 'error');
      }
    }, 2850);
    timersRef.current.push(t);
  };

  const createGame = () => {
    if (activeMatch && activeMatch.status !== 'done') return;
    if (!placeBet(betAmount)) return;
    sound.click();

    setActiveMatch({
      bet: betAmount,
      userSide: chosenSide,
      opponentName: null,
      status: 'waiting',
      outcome: null,
      win: null,
    });

    const delay = 1000 + rand() * 1800;
    const t = setTimeout(() => {
      runFlip({
        bet: betAmount,
        userSide: chosenSide,
        opponentName: randomBotName(),
      });
    }, delay);
    timersRef.current.push(t);
  };

  const joinBotGame = (game) => {
    if (activeMatch && activeMatch.status !== 'done') return;
    if (!placeBet(game.bet)) return;
    sound.click();
    setLobby((prev) => prev.filter((g) => g.id !== game.id));
    const userSide = game.side === 'diamond' ? 'huge' : 'diamond';
    runFlip({
      bet: game.bet,
      userSide,
      opponentName: game.creator,
    });
  };

  const busy = activeMatch && activeMatch.status !== 'done';

  return (
    <GameLayout
      title="Coinflip"
      subtitle="Diamond vs Huge — 3D 50/50 coin toss paying 1.90×!"
      icon={<Coins size={26} className="text-gold" />}
      controls={
        <>
          <BetInput value={betAmount} onChange={setBetAmount} disabled={busy} />

          <div className="field-label">
            <span>Pick Your Side</span>
            <div className="seg-group">
              <button
                type="button"
                disabled={busy}
                className={`seg-btn ${chosenSide === 'diamond' ? 'active' : ''}`}
                onClick={() => {
                  sound.click();
                  setChosenSide('diamond');
                }}
              >
                💎 Diamond
              </button>
              <button
                type="button"
                disabled={busy}
                className={`seg-btn ${chosenSide === 'huge' ? 'active' : ''}`}
                onClick={() => {
                  sound.click();
                  setChosenSide('huge');
                }}
              >
                🐾 Huge
              </button>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-lg btn-gold"
            disabled={busy}
            onClick={createGame}
          >
            Create Coinflip (1.90×)
          </button>

          <div className="stat-box">
            <span className="text-muted">Win Payout</span>
            <strong className="text-green">{formatGems(Math.round(betAmount * 1.9))}</strong>
          </div>

          <div className="stat-box">
            <span className="text-muted">House Edge</span>
            <strong>5%</strong>
          </div>
        </>
      }
      board={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="coin-stage">
            <div
              className="coin-3d"
              style={{ transform: `rotateY(${rotationDeg}deg)` }}
            >
              <div className="coin-face coin-front">
                <img src={GEM} alt="Diamond" style={{ width: 64, height: 64 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#03202e' }}>
                  DIAMOND
                </span>
              </div>
              <div className="coin-face coin-back">
                <PetImage thumb={hugeCoinPet?.thumb} alt="Huge" size={66} lazy={false} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>HUGE</span>
              </div>
            </div>

            <div style={{ marginTop: 16, textAlign: 'center', minHeight: 28 }}>
              {!activeMatch && (
                <span className="text-muted">Create a coinflip or join an open bot match below</span>
              )}
              {activeMatch?.status === 'waiting' && (
                <span className="text-gem" style={{ fontWeight: 700 }}>
                  Waiting for opponent to join ({username} on {activeMatch.userSide.toUpperCase()})…
                </span>
              )}
              {activeMatch?.status === 'flipping' && (
                <span style={{ fontWeight: 700 }}>
                  {username} ({activeMatch.userSide.toUpperCase()}) vs {activeMatch.opponentName}!
                </span>
              )}
              {activeMatch?.status === 'done' && (
                <span
                  className={activeMatch.win ? 'text-green' : 'text-red'}
                  style={{ fontWeight: 700, fontSize: 16 }}
                >
                  {activeMatch.outcome.toUpperCase()} landed —{' '}
                  {activeMatch.win
                    ? `You won ${formatGems(Math.round(activeMatch.bet * 1.9))}!`
                    : `${activeMatch.opponentName} won!`}
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-deep)',
              border: '2px solid var(--border)',
              borderRadius: 14,
              padding: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <strong style={{ fontSize: 14 }}>Open Bot Coinflips</strong>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setLobby(makeLobbyGames())}
              >
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {lobby.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{g.side === 'diamond' ? '💎' : '🐾'}</span>
                    <strong>{g.creator}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <GemAmount value={g.bet} iconSize={14} />
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={busy}
                      onClick={() => joinBotGame(g)}
                    >
                      Join ({g.side === 'diamond' ? 'Huge' : 'Diamond'})
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}
