import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Spade } from 'lucide-react';
import { shuffle } from '../lib/rng.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { BetInput } from '../components/BetInput.jsx';
import { GameLayout } from '../components/GameLayout.jsx';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function buildShoe() {
  const shoe = [];
  for (let d = 0; d < 6; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ suit, rank, id: `${d}-${suit}-${rank}-${Math.random()}` });
      }
    }
  }
  return shuffle(shoe);
}

function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') {
      aces++;
      total += 11;
    } else if (['K', 'Q', 'J'].includes(c.rank)) {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, isSoft: aces > 0 };
}

function PlayingCard({ card, hidden }) {
  if (hidden) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -16, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="playing-card hidden"
      >
        <span style={{ fontSize: 24 }}>💎</span>
      </motion.div>
    );
  }
  const isRed = card.suit === '♥' || card.suit === '♦';
  return (
    <motion.div
      initial={{ opacity: 0, y: -16, rotateY: 90 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ duration: 0.25 }}
      className={`playing-card ${isRed ? 'red' : ''}`}
    >
      <div style={{ fontSize: 15, lineHeight: 1 }}>{card.rank}</div>
      <div style={{ fontSize: 28, textAlign: 'center', lineHeight: 1 }}>{card.suit}</div>
      <div style={{ fontSize: 15, textAlign: 'right', lineHeight: 1 }}>{card.rank}</div>
    </motion.div>
  );
}

export function Blackjack() {
  const placeBet = useGame((s) => s.placeBet);
  const payout = useGame((s) => s.payout);
  const recordBet = useGame((s) => s.recordBet);
  const pushToast = useToast((s) => s.push);

  const shoeRef = useRef(buildShoe());
  const [betAmount, setBetAmount] = useState(1_000_000);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'player' | 'dealer' | 'done'
  const [playerCards, setPlayerCards] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
  const [holeHidden, setHoleHidden] = useState(true);
  const [lockedBet, setLockedBet] = useState(0);
  const [outcomeMsg, setOutcomeMsg] = useState('');

  const drawCard = () => {
    if (shoeRef.current.length < 52) {
      shoeRef.current = buildShoe();
    }
    return shoeRef.current.pop();
  };

  const settleHand = (pCards, dCards, stake, isBlackjackWin = false) => {
    const pVal = handValue(pCards).total;
    const dVal = handValue(dCards).total;
    let winAmt = 0;
    let mult = 0;
    let msg = '';

    if (pVal > 21) {
      msg = 'Bust! Dealer wins.';
    } else if (isBlackjackWin && dVal !== 21) {
      mult = 2.5;
      winAmt = Math.round(stake * 2.5);
      msg = `BLACKJACK! Won ${formatGems(winAmt)} (3:2)!`;
    } else if (dVal === 21 && dCards.length === 2 && !(pVal === 21 && pCards.length === 2)) {
      msg = 'Dealer has Blackjack!';
    } else if (dVal > 21 || pVal > dVal) {
      mult = 2;
      winAmt = stake * 2;
      msg = `You win ${formatGems(winAmt)}!`;
    } else if (pVal === dVal) {
      mult = 1;
      winAmt = stake;
      msg = 'Push — bet returned.';
    } else {
      msg = 'Dealer wins.';
    }

    if (winAmt > 0) payout(winAmt);
    recordBet({
      game: 'Blackjack',
      amount: stake,
      multiplier: mult,
      payout: winAmt,
    });

    setOutcomeMsg(msg);
    setPhase('done');

    if (mult >= 2.5) {
      sound.bigWin();
      fireConfetti(true);
      pushToast(msg, 'success');
    } else if (mult === 2) {
      sound.win();
      pushToast(msg, 'success');
    } else if (mult === 1) {
      sound.tick();
      pushToast(msg, 'info');
    } else {
      sound.lose();
    }
  };

  const deal = () => {
    if (phase === 'player' || phase === 'dealer') return;
    if (!placeBet(betAmount)) return;
    sound.deal();

    const p1 = drawCard();
    const d1 = drawCard();
    const p2 = drawCard();
    const d2 = drawCard();
    const pHand = [p1, p2];
    const dHand = [d1, d2];

    setPlayerCards(pHand);
    setDealerCards(dHand);
    setLockedBet(betAmount);
    setOutcomeMsg('');

    const pTotal = handValue(pHand).total;
    const dTotal = handValue(dHand).total;

    if (pTotal === 21 || dTotal === 21) {
      setHoleHidden(false);
      settleHand(pHand, dHand, betAmount, pTotal === 21);
    } else {
      setHoleHidden(true);
      setPhase('player');
    }
  };

  const runDealerTurn = (pHand, dHand, stake) => {
    setPhase('dealer');
    setHoleHidden(false);
    sound.deal();

    const currentDealer = [...dHand];
    const step = () => {
      const val = handValue(currentDealer).total;
      if (val < 17) {
        currentDealer.push(drawCard());
        setDealerCards([...currentDealer]);
        sound.deal();
        setTimeout(step, 420);
      } else {
        settleHand(pHand, currentDealer, stake, false);
      }
    };
    setTimeout(step, 420);
  };

  const hit = () => {
    if (phase !== 'player') return;
    sound.deal();
    const next = [...playerCards, drawCard()];
    setPlayerCards(next);
    const val = handValue(next).total;
    if (val > 21) {
      setHoleHidden(false);
      settleHand(next, dealerCards, lockedBet, false);
    } else if (val === 21) {
      runDealerTurn(next, dealerCards, lockedBet);
    }
  };

  const stand = () => {
    if (phase !== 'player') return;
    runDealerTurn(playerCards, dealerCards, lockedBet);
  };

  const doubleDown = () => {
    if (phase !== 'player' || playerCards.length !== 2) return;
    if (!placeBet(lockedBet)) return;
    sound.deal();
    const nextBet = lockedBet * 2;
    setLockedBet(nextBet);
    const next = [...playerCards, drawCard()];
    setPlayerCards(next);
    const val = handValue(next).total;
    if (val > 21) {
      setHoleHidden(false);
      settleHand(next, dealerCards, nextBet, false);
    } else {
      runDealerTurn(next, dealerCards, nextBet);
    }
  };

  const pScore = handValue(playerCards);
  const dScore = holeHidden && dealerCards.length > 0
    ? handValue([dealerCards[0]])
    : handValue(dealerCards);

  const busy = phase === 'player' || phase === 'dealer';

  return (
    <GameLayout
      title="Blackjack"
      subtitle="6-deck shoe · Dealer stands on all 17s · Blackjack pays 3:2"
      icon={<Spade size={26} className="text-gem" />}
      controls={
        <>
          <BetInput value={betAmount} onChange={setBetAmount} disabled={busy} />

          {phase === 'idle' || phase === 'done' ? (
            <button type="button" className="btn btn-lg btn-green" onClick={deal}>
              Deal Cards
            </button>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <button
                type="button"
                className="btn btn-lg btn-primary"
                disabled={phase !== 'player'}
                onClick={hit}
              >
                Hit
              </button>
              <button
                type="button"
                className="btn btn-lg btn-gold"
                disabled={phase !== 'player'}
                onClick={stand}
              >
                Stand
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={phase !== 'player' || playerCards.length !== 2}
                onClick={doubleDown}
              >
                Double ({formatGems(lockedBet)})
              </button>
            </div>
          )}

          {lockedBet > 0 && (
            <div className="stat-box">
              <span className="text-muted">Active Bet</span>
              <strong>{formatGems(lockedBet)}</strong>
            </div>
          )}

          <div className="stat-box">
            <span className="text-muted">House Edge</span>
            <strong>~0.6%–2%</strong>
          </div>
        </>
      }
      board={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              Dealer {dealerCards.length > 0 && `(${dScore.total}${holeHidden ? '+' : ''})`}
            </div>
            <div className="cards-row">
              {dealerCards.length === 0 ? (
                <div className="text-muted">Press Deal Cards to start a hand</div>
              ) : (
                dealerCards.map((c, idx) => (
                  <PlayingCard key={c.id} card={c} hidden={holeHidden && idx === 1} />
                ))
              )}
            </div>
          </div>

          <div
            style={{
              minHeight: 34,
              display: 'flex',
              alignItems: 'center',
              fontWeight: 700,
              fontSize: 17,
            }}
          >
            {outcomeMsg && (
              <span
                className={
                  outcomeMsg.includes('win') || outcomeMsg.includes('BLACKJACK')
                    ? 'text-green'
                    : outcomeMsg.includes('Push')
                    ? 'text-gold'
                    : 'text-red'
                }
              >
                {outcomeMsg}
              </span>
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              Your Hand{' '}
              {playerCards.length > 0 &&
                `(${pScore.total}${pScore.isSoft && pScore.total <= 21 ? ' Soft' : ''})`}
            </div>
            <div className="cards-row">
              {playerCards.map((c) => (
                <PlayingCard key={c.id} card={c} hidden={false} />
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}
