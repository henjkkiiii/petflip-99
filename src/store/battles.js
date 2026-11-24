import { create } from 'zustand';
import ps99 from '../data/ps99.json';
import { randomBotName } from '../lib/bots.js';
import { randInt, weightedPick } from '../lib/rng.js';
import { getEffectiveCratePrice, useSiteConfig } from './siteConfig.js';

const CRATES = ps99.crates;

function pickLobbyCrates() {
  const count = randInt(2, 4);
  const chosen = [];
  // Pick from affordable/mid crates (first 7) so lobby battles stay accessible
  const pool = CRATES.slice(0, Math.min(CRATES.length, 7));
  for (let i = 0; i < count; i++) {
    chosen.push(pool[randInt(0, pool.length - 1)]);
  }
  return chosen;
}

function makeBot(seat) {
  return {
    seat,
    name: randomBotName(),
    isUser: false,
    isBot: true,
    hue: randInt(180, 330),
    pulls: [],
    total: 0,
  };
}

function createBotRoom(index = 0) {
  const modes = [
    { mode: '1v1', seats: 2 },
    { mode: '1v1v1', seats: 3 },
    { mode: '1v1v1v1', seats: 4 },
  ];
  const picked = modes[index % modes.length];
  const crates = pickLobbyCrates();
  const cfg = useSiteConfig.getState();
  const cost = crates.reduce((s, c) => s + getEffectiveCratePrice(c, cfg), 0);
  const players = Array.from({ length: picked.seats }, (_, s) => (s === 0 ? makeBot(0) : null));
  if (picked.seats > 2 && Math.random() < 0.5) {
    players[1] = makeBot(1);
  }
  return {
    id: `battle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    mode: picked.mode,
    seatsCount: picked.seats,
    crates,
    cost,
    players,
    status: 'waiting',
    currentRound: 0,
    winnerSeat: null,
    settled: false,
    createdAt: Date.now(),
  };
}

export const useBattles = create((set, get) => ({
  rooms: [createBotRoom(0), createBotRoom(1), createBotRoom(2), createBotRoom(0)],

  refreshLobby() {
    set((state) => {
      const activeUserRooms = state.rooms.filter(
        (r) => r.players.some((p) => p?.isUser) && r.status !== 'finished'
      );
      const freshBots = [createBotRoom(0), createBotRoom(1), createBotRoom(2), createBotRoom(0)];
      return { rooms: [...activeUserRooms, ...freshBots].slice(0, 8) };
    });
  },

  createRoom({ mode, crates, username }) {
    const seatsCount = mode === '1v1' ? 2 : mode === '1v1v1' ? 3 : 4;
    const cfg = useSiteConfig.getState();
    const cost = crates.reduce((s, c) => s + getEffectiveCratePrice(c, cfg), 0);
    const id = `battle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const players = Array.from({ length: seatsCount }, (_, idx) =>
      idx === 0
        ? {
            seat: 0,
            name: username,
            isUser: true,
            isBot: false,
            hue: 190,
            pulls: [],
            total: 0,
          }
        : null
    );
    const room = {
      id,
      mode,
      seatsCount,
      crates,
      cost,
      players,
      status: 'waiting',
      currentRound: 0,
      winnerSeat: null,
      settled: false,
      createdAt: Date.now(),
    };
    set((state) => ({
      rooms: [room, ...state.rooms],
    }));
    return room;
  },

  joinRoom(roomId, username) {
    const room = get().rooms.find((r) => r.id === roomId);
    if (!room) return false;
    if (room.players.some((p) => p?.isUser)) return true;
    const emptyIdx = room.players.findIndex((p) => p === null);
    if (emptyIdx === -1) return false;

    set((state) => ({
      rooms: state.rooms.map((r) => {
        if (r.id !== roomId) return r;
        const nextPlayers = [...r.players];
        nextPlayers[emptyIdx] = {
          seat: emptyIdx,
          name: username,
          isUser: true,
          isBot: false,
          hue: 190,
          pulls: [],
          total: 0,
        };
        return { ...r, players: nextPlayers };
      }),
    }));
    return true;
  },

  fillNextBotSeat(roomId) {
    set((state) => ({
      rooms: state.rooms.map((r) => {
        if (r.id !== roomId) return r;
        const emptyIdx = r.players.findIndex((p) => p === null);
        if (emptyIdx === -1) return r;
        const nextPlayers = [...r.players];
        nextPlayers[emptyIdx] = makeBot(emptyIdx);
        const allFilled = nextPlayers.every(Boolean);
        return {
          ...r,
          players: nextPlayers,
          status: allFilled ? 'ready' : r.status,
        };
      }),
    }));
  },

  startRoom(roomId) {
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId && r.status !== 'spinning' && r.status !== 'finished'
          ? { ...r, status: 'spinning', currentRound: 0 }
          : r
      ),
    }));
  },

  rollRoundOutcomes(roomId, roundIdx) {
    const room = get().rooms.find((r) => r.id === roomId);
    if (!room) return [];
    const crate = room.crates[roundIdx];
    if (!crate) return [];
    return room.players.map(() => weightedPick(crate.items, 'chance'));
  },

  commitRound(roomId, roundIdx, pickedItems) {
    set((state) => ({
      rooms: state.rooms.map((r) => {
        if (r.id !== roomId) return r;
        const updatedPlayers = r.players.map((p, idx) => {
          if (!p) return p;
          const item = pickedItems[idx];
          if (!item) return p;
          return {
            ...p,
            pulls: [...p.pulls, item],
            total: p.total + item.value,
          };
        });
        const isLast = roundIdx >= r.crates.length - 1;
        let winnerSeat = null;
        if (isLast) {
          let best = -1;
          let tiedSeats = [];
          updatedPlayers.forEach((p, idx) => {
            if (!p) return;
            if (p.total > best) {
              best = p.total;
              tiedSeats = [idx];
            } else if (p.total === best) {
              tiedSeats.push(idx);
            }
          });
          if (tiedSeats.length > 0) {
            winnerSeat = tiedSeats[randInt(0, tiedSeats.length - 1)];
          }
        }
        return {
          ...r,
          players: updatedPlayers,
          currentRound: isLast ? roundIdx : roundIdx + 1,
          status: isLast ? 'finished' : 'spinning',
          winnerSeat,
        };
      }),
    }));
  },

  markSettled(roomId) {
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, settled: true } : r)),
    }));
  },
}));
