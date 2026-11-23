import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Crown, Swords, Zap } from 'lucide-react';
import { useBattles } from '../store/battles.js';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { useDrops } from '../store/drops.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { CaseReel } from '../components/CaseReel.jsx';
import { PetImage } from '../components/PetImage.jsx';
import { PetCard } from '../components/PetCard.jsx';
import { GemAmount } from '../components/GemAmount.jsx';

export function BattleRoom() {
  const { id } = useParams();
  const room = useBattles((s) => s.rooms.find((r) => r.id === id));
  const fillNextBotSeat = useBattles((s) => s.fillNextBotSeat);
  const startRoom = useBattles((s) => s.startRoom);
  const rollRoundOutcomes = useBattles((s) => s.rollRoundOutcomes);
  const commitRound = useBattles((s) => s.commitRound);
  const markSettled = useBattles((s) => s.markSettled);

  const addItems = useGame((s) => s.addItems);
  const recordBet = useGame((s) => s.recordBet);
  const pushToast = useToast((s) => s.push);

  const [fast, setFast] = useState(false);
  const [roundWinners, setRoundWinners] = useState(null); // array of picked pets for active round
  const [spinningRound, setSpinningRound] = useState(false);
  const doneSeatsRef = useRef(0);
  const roundWinnersRef = useRef(null);

  // Step 1: Fill empty bot seats gradually while waiting
  useEffect(() => {
    if (!room || room.status !== 'waiting') return;
    const hasEmpty = room.players.some((p) => p === null);
    if (!hasEmpty) {
      const t = setTimeout(() => startRoom(room.id), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      sound.click();
      fillNextBotSeat(room.id);
    }, 900);
    return () => clearTimeout(t);
  }, [room, fillNextBotSeat, startRoom]);

  // Step 2: When ready, transition to spinning
  useEffect(() => {
    if (!room || room.status !== 'ready') return;
    const t = setTimeout(() => startRoom(room.id), 650);
    return () => clearTimeout(t);
  }, [room, startRoom]);

  // Step 3: Trigger round spin whenever room.status === 'spinning' and not already spinning this round
  useEffect(() => {
    if (!room || room.status !== 'spinning' || spinningRound) return;
    const t = setTimeout(() => {
      const outcomes = rollRoundOutcomes(room.id, room.currentRound);
      doneSeatsRef.current = 0;
      roundWinnersRef.current = { roundIdx: room.currentRound, outcomes };
      setRoundWinners(outcomes);
      setSpinningRound(true);
    }, 350);
    return () => clearTimeout(t);
  }, [room, spinningRound, rollRoundOutcomes]);

  // Step 4: Settle finished battle once
  useEffect(() => {
    if (!room || room.status !== 'finished' || room.settled) return;
    markSettled(room.id);

    const winnerPlayer = room.players[room.winnerSeat];
    const userParticipating = room.players.some((p) => p?.isUser);
    if (!userParticipating) return;

    if (winnerPlayer?.isUser) {
      const allPulled = room.players.flatMap((p) => p?.pulls || []);
      const totalVal = allPulled.reduce((s, it) => s + it.value, 0);
      addItems(
        allPulled.map((pet) => ({
          uid: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: pet.name,
          thumb: pet.thumb,
          value: pet.value,
          tier: pet.tier,
          from: `Battle (${room.mode})`,
        }))
      );
      if (allPulled.length > 0) {
        const bestPet = [...allPulled].sort((a, b) => b.value - a.value)[0];
        const refCrate = room.crates?.[0];
        if (bestPet && refCrate) {
          useDrops.getState().pushDrop({
            user: useGame.getState().username,
            name: bestPet.name,
            thumb: bestPet.thumb,
            value: bestPet.value,
            tier: bestPet.tier,
            crateId: refCrate.id,
            crateName: refCrate.name,
            isUser: true,
          });
        }
      }
      recordBet({
        game: 'Battles',
        amount: room.cost,
        multiplier: totalVal / room.cost,
        payout: totalVal,
      });
      sound.bigWin();
      fireConfetti(true);
      pushToast(
        `VICTORY! Won ${allPulled.length} pets worth ${formatGems(totalVal)}!`,
        'success'
      );
    } else {
      recordBet({
        game: 'Battles',
        amount: room.cost,
        multiplier: 0,
        payout: 0,
      });
      sound.lose();
      pushToast(`${winnerPlayer?.name || 'Bot'} won the battle!`, 'error');
    }
  }, [room, markSettled, addItems, recordBet, pushToast]);

  const handleSeatReelDone = () => {
    if (!room || !roundWinnersRef.current) return;
    doneSeatsRef.current += 1;
    if (doneSeatsRef.current < room.seatsCount) return;

    const { roundIdx, outcomes } = roundWinnersRef.current;
    roundWinnersRef.current = null;
    setSpinningRound(false);
    setRoundWinners(null);
    commitRound(room.id, roundIdx, outcomes);
  };

  if (!room) {
    return (
      <div className="card" style={{ padding: 30, textAlign: 'center' }}>
        <h2>Battle room not found</h2>
        <p className="text-muted">Rooms are active only during your current session.</p>
        <Link to="/battles" className="btn btn-primary" style={{ marginTop: 12 }}>
          Back to Battles
        </Link>
      </div>
    );
  }

  const activeCrate = room.crates[room.currentRound] || room.crates[room.crates.length - 1];
  const totalPot = room.players.reduce((s, p) => s + (p?.total || 0), 0);

  return (
    <div>
      <div
        className="page-header"
        style={{ marginBottom: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/battles" className="btn btn-sm btn-ghost">
            <ArrowLeft size={15} /> Lobby
          </Link>
          <h1 className="page-title" style={{ fontSize: 24 }}>
            <Swords size={22} className="text-gold" />
            <span>{room.mode} Battle</span>
          </h1>
          <span className="game-tag">
            Round {Math.min(room.currentRound + 1, room.crates.length)} / {room.crates.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className={`btn btn-sm ${fast ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFast((f) => !f)}
          >
            <Zap size={14} /> Fast
          </button>
          <div className="balance-pill" style={{ fontSize: 13.5 }}>
            Pot: <GemAmount value={totalPot} iconSize={15} />
          </div>
        </div>
      </div>

      {/* Round Crates Strip */}
      <div
        className="card"
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          overflowX: 'auto',
          marginBottom: 16,
        }}
      >
        {room.crates.map((crate, idx) => {
          const isCurr = room.status !== 'finished' && idx === room.currentRound;
          const isPast = room.status === 'finished' || idx < room.currentRound;
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 10,
                border: `1px solid ${isCurr ? 'var(--gem)' : 'var(--border)'}`,
                background: isCurr ? 'rgba(56,217,255,0.12)' : 'var(--bg-deep)',
                opacity: isPast ? 0.55 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              <PetImage thumb={crate.icon} alt={crate.name} size={28} lazy={false} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                #{idx + 1}
              </span>
            </div>
          );
        })}
      </div>

      {/* Player Columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${room.seatsCount}, minmax(220px, 1fr))`,
          gap: 14,
          overflowX: 'auto',
        }}
      >
        {room.players.map((player, seatIdx) => {
          const isWinner = room.status === 'finished' && room.winnerSeat === seatIdx;
          const seatWinnerItem =
            roundWinners?.[seatIdx] || activeCrate.items[activeCrate.items.length - 1];

          return (
            <div
              key={seatIdx}
              className="card"
              style={{
                padding: 14,
                borderColor: isWinner
                  ? 'var(--gold)'
                  : player?.isUser
                  ? 'rgba(62,224,255,0.45)'
                  : 'var(--border)',
                boxShadow: isWinner ? '0 0 28px rgba(255,204,51,0.35)' : undefined,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {player ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: player.isUser
                          ? 'linear-gradient(135deg, var(--gem), var(--purple))'
                          : `hsl(${player.hue}, 65%, 45%)`,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 700,
                      }}
                    >
                      {player.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {player.name}{' '}
                        {player.isUser && <span className="you-tag">YOU</span>}
                      </div>
                      <div className="text-gem" style={{ fontSize: 13 }}>
                        <GemAmount value={player.total} iconSize={13} />
                      </div>
                    </div>
                  </div>
                  {isWinner && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--gold)',
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      <Crown size={16} /> WINNER
                    </span>
                  )}
                </motion.div>
              ) : (
                <div
                  style={{
                    height: 44,
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Waiting for player…
                </div>
              )}

              {room.status === 'spinning' && activeCrate && (
                <CaseReel
                  key={`seat-${seatIdx}-round-${room.currentRound}`}
                  items={activeCrate.items}
                  winner={seatWinnerItem}
                  spinning={spinningRound}
                  fast={fast}
                  compact
                  onDone={handleSeatReelDone}
                />
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: 8,
                }}
              >
                {(player?.pulls || []).map((pet, pIdx) => (
                  <PetCard key={pIdx} pet={pet} compact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
