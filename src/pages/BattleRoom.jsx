import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Crown, LogOut, Swords, UserPlus, Zap } from 'lucide-react';
import { useBattles } from '../store/battles.js';
import { useAuth } from '../store/useAuth.js';
import { useToast } from '../store/toast.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { CaseReel } from '../components/CaseReel.jsx';
import { PetImage } from '../components/PetImage.jsx';
import { PetCard } from '../components/PetCard.jsx';
import { GemAmount } from '../components/GemAmount.jsx';

export function BattleRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const room = useBattles((s) => s.rooms.find((r) => r.id === id));
  const joinBattle = useBattles((s) => s.joinBattle);
  const callBot = useBattles((s) => s.callBot);
  const leaveBattle = useBattles((s) => s.leaveBattle);
  const settleBattle = useBattles((s) => s.settleBattle);

  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const pushToast = useToast((s) => s.push);

  const [fast, setFast] = useState(false);
  const [revealedRounds, setRevealedRounds] = useState(0);
  const [playbackRound, setPlaybackRound] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [activeRoundWinners, setActiveRoundWinners] = useState(null);
  const [playbackDone, setPlaybackDone] = useState(false);
  const [busyAction, setBusyAction] = useState('');

  const initForIdRef = useRef(null);
  const doneSeatsRef = useRef(0);
  const celebratedIdRef = useRef(null);
  const roomRef = useRef(room);
  roomRef.current = room;

  // Reset local playback state when switching rooms
  useEffect(() => {
    initForIdRef.current = null;
    doneSeatsRef.current = 0;
    celebratedIdRef.current = null;
    setRevealedRounds(0);
    setPlaybackRound(0);
    setIsSpinning(false);
    setActiveRoundWinners(null);
    setPlaybackDone(false);
    setBusyAction('');
  }, [id]);

  // If entering an already-finished battle, show completed results immediately
  useEffect(() => {
    if (!room || initForIdRef.current === room.id) return;
    initForIdRef.current = room.id;
    if (room.status === 'finished') {
      const totalRounds = room.crates.length;
      setRevealedRounds(totalRounds);
      setPlaybackRound(Math.max(0, totalRounds - 1));
      setPlaybackDone(true);
      setIsSpinning(false);
      setActiveRoundWinners(null);
      celebratedIdRef.current = room.id;
    }
  }, [room]);

  // Trigger next round playback sequentially without being disrupted by 2s state polls
  useEffect(() => {
    if (!room) return;
    if (room.status !== 'playing' && room.status !== 'finished') return;
    if (playbackDone || isSpinning) return;
    if (revealedRounds >= room.crates.length) return;

    const t = setTimeout(() => {
      const latest = roomRef.current;
      if (!latest) return;
      const locked = latest.players.map((p) => p?.pulls?.[revealedRounds] || null);
      doneSeatsRef.current = 0;
      setPlaybackRound(revealedRounds);
      setActiveRoundWinners(locked);
      setIsSpinning(true);
    }, 350);

    return () => clearTimeout(t);
  }, [room?.status, room?.crates?.length, playbackDone, isSpinning, revealedRounds]);

  const handleSeatReelDone = async () => {
    const curRoom = roomRef.current;
    if (!curRoom || !isSpinning) return;
    doneSeatsRef.current += 1;
    if (doneSeatsRef.current !== curRoom.seatsCount) return;

    const nextRevealed = playbackRound + 1;
    setIsSpinning(false);
    setActiveRoundWinners(null);
    setRevealedRounds(nextRevealed);

    if (nextRevealed >= curRoom.crates.length) {
      setPlaybackDone(true);
      const settleRes = await settleBattle(curRoom.id);
      const finalRoom = settleRes?.battle || roomRef.current || curRoom;
      if (celebratedIdRef.current !== finalRoom.id) {
        celebratedIdRef.current = finalRoom.id;
        const mySeat = currentUserKey
          ? finalRoom.players.findIndex((p) => p && !p.isBot && p.userKey === currentUserKey)
          : -1;
        if (mySeat !== -1) {
          const winnerPlayer = finalRoom.players[finalRoom.winnerSeat];
          if (finalRoom.winnerSeat === mySeat) {
            const allPulled = finalRoom.players.flatMap((p) => p?.pulls || []);
            const totalVal = allPulled.reduce((s, it) => s + (Number(it.value) || 0), 0);
            sound.bigWin();
            fireConfetti(true);
            pushToast(
              `VICTORY! Won ${allPulled.length} pets worth ${formatGems(totalVal)}!`,
              'success'
            );
          } else {
            sound.lose();
            pushToast(`${winnerPlayer?.name || 'Opponent'} won the battle!`, 'error');
          }
        }
      }
    }
  };

  const handleJoinSeat = async (seatIdx) => {
    if (!room || busyAction) return;
    if (!currentUserKey) {
      pushToast('Sign in or create an account to join this battle!', 'info');
      openAuthModal('login');
      return;
    }
    sound.click();
    setBusyAction(`join-${seatIdx}`);
    try {
      const res = await joinBattle(room.id, seatIdx);
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not join seat.', 'error');
      } else {
        pushToast(`Joined seat #${seatIdx + 1}!`, 'success');
      }
    } finally {
      setBusyAction('');
    }
  };

  const handleCallBot = async (seatIdx) => {
    if (!room || busyAction) return;
    sound.click();
    setBusyAction(`bot-${seatIdx}`);
    try {
      const res = await callBot(room.id, seatIdx, false);
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not call bot.', 'error');
      }
    } finally {
      setBusyAction('');
    }
  };

  const handleFillAllBots = async () => {
    if (!room || busyAction) return;
    sound.click();
    setBusyAction('fill-bots');
    try {
      const res = await callBot(room.id, null, true);
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not fill remaining slots.', 'error');
      }
    } finally {
      setBusyAction('');
    }
  };

  const handleLeaveOrCancel = async () => {
    if (!room || busyAction) return;
    sound.click();
    setBusyAction('leave');
    try {
      const res = await leaveBattle(room.id);
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not leave battle.', 'error');
        return;
      }
      pushToast(
        res.cancelled
          ? 'Battle cancelled — entry gems refunded.'
          : 'Left battle — entry gems refunded.',
        'info'
      );
      navigate('/battles');
    } finally {
      setBusyAction('');
    }
  };

  if (!room) {
    return (
      <div className="card" style={{ padding: 30, textAlign: 'center' }}>
        <h2>Battle room not found</h2>
        <p className="text-muted">
          This room may have been cancelled or cleared. Any entry gems from cancelled waiting
          battles are refunded automatically.
        </p>
        <Link to="/battles" className="btn btn-primary" style={{ marginTop: 12 }}>
          Back to Battles
        </Link>
      </div>
    );
  }

  const isCreator = Boolean(currentUserKey && room.creatorKey === currentUserKey);
  const isAdmin = Boolean(currentUserKey && accounts[currentUserKey]?.role === 'admin');
  const canCallBots = isCreator || isAdmin;
  const mySeatIdx = currentUserKey
    ? room.players.findIndex((p) => p && !p.isBot && p.userKey === currentUserKey)
    : -1;
  const emptySeatsCount = room.players.filter((p) => p === null).length;

  const activeCrate = room.crates[playbackRound] || room.crates[room.crates.length - 1];
  const shownPot = room.players.reduce((sum, p) => {
    if (!p) return sum;
    const pulls = (p.pulls || []).slice(0, revealedRounds);
    return sum + pulls.reduce((s, it) => s + (Number(it.value) || 0), 0);
  }, 0);

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/battles" className="btn btn-sm btn-ghost">
            <ArrowLeft size={15} /> Lobby
          </Link>
          <h1 className="page-title" style={{ fontSize: 24 }}>
            <Swords size={22} className="text-gold" />
            <span>{room.mode} Battle</span>
          </h1>
          <span className="game-tag">
            {room.status === 'waiting'
              ? `${room.seatsCount - emptySeatsCount}/${room.seatsCount} Players`
              : `Round ${Math.min(playbackRound + 1, room.crates.length)} / ${room.crates.length}`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {room.status === 'waiting' && canCallBots && emptySeatsCount > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={Boolean(busyAction)}
              onClick={handleFillAllBots}
            >
              <Bot size={14} /> {busyAction === 'fill-bots' ? 'Filling…' : 'Fill with Bots'}
            </button>
          )}
          {room.status === 'waiting' && (canCallBots || mySeatIdx !== -1) && (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              style={
                canCallBots
                  ? { color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.35)' }
                  : undefined
              }
              disabled={Boolean(busyAction)}
              onClick={handleLeaveOrCancel}
            >
              <LogOut size={14} />{' '}
              {busyAction === 'leave'
                ? 'Refunding…'
                : canCallBots
                  ? 'Cancel & Refund'
                  : 'Leave & Refund'}
            </button>
          )}
          <button
            type="button"
            className={`btn btn-sm ${fast ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFast((f) => !f)}
          >
            <Zap size={14} /> Fast
          </button>
          <div className="balance-pill" style={{ fontSize: 13.5 }}>
            Pot: <GemAmount value={shownPot} iconSize={15} />
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
          const isCurr = room.status !== 'waiting' && !playbackDone && idx === playbackRound;
          const isPast = playbackDone || idx < revealedRounds;
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
              <span style={{ fontSize: 12, fontWeight: 700 }}>#{idx + 1}</span>
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
          const isMe = Boolean(player && !player.isBot && currentUserKey && player.userKey === currentUserKey);
          const isWinner = playbackDone && room.winnerSeat === seatIdx;
          const visiblePulls =
            room.status === 'waiting' ? [] : (player?.pulls || []).slice(0, revealedRounds);
          const shownTotal = visiblePulls.reduce((s, it) => s + (Number(it.value) || 0), 0);
          const seatWinnerItem =
            activeRoundWinners?.[seatIdx] || activeCrate?.items?.[activeCrate.items.length - 1];

          return (
            <div
              key={seatIdx}
              className="card"
              style={{
                padding: 14,
                borderColor: isWinner
                  ? 'var(--gold)'
                  : isMe
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
                        background: isMe
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
                      <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span>{player.name}</span>
                        {isMe && <span className="you-tag">YOU</span>}
                        {player.isBot && (
                          <span
                            className="game-tag"
                            style={{ fontSize: 10, padding: '1px 6px', opacity: 0.85 }}
                          >
                            BOT
                          </span>
                        )}
                      </div>
                      <div className="text-gem" style={{ fontSize: 13 }}>
                        <GemAmount value={shownTotal} iconSize={13} />
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
                    minHeight: 112,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: 12,
                    borderRadius: 12,
                    background: 'var(--bg-deep)',
                    border: '1px dashed var(--border-light)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Open Seat #{seatIdx + 1}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    Waiting for real player…
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    {mySeatIdx === -1 && room.status === 'waiting' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={Boolean(busyAction)}
                        onClick={() => handleJoinSeat(seatIdx)}
                      >
                        <UserPlus size={14} />{' '}
                        {busyAction === `join-${seatIdx}`
                          ? 'Joining…'
                          : `Join (${formatGems(room.cost)})`}
                      </button>
                    )}
                    {canCallBots && room.status === 'waiting' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        disabled={Boolean(busyAction)}
                        onClick={() => handleCallBot(seatIdx)}
                      >
                        <Bot size={14} />{' '}
                        {busyAction === `bot-${seatIdx}` ? 'Calling…' : 'Call Bot'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!playbackDone &&
                (room.status === 'playing' || room.status === 'finished') &&
                activeCrate &&
                seatWinnerItem && (
                  <CaseReel
                    key={`seat-${seatIdx}-round-${playbackRound}`}
                    items={activeCrate.items}
                    winner={seatWinnerItem}
                    spinning={isSpinning}
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
                {visiblePulls.map((pet, pIdx) => (
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
