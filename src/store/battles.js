import { create } from 'zustand';
import ps99 from '../data/ps99.json';
import { apiPost } from '../lib/api.js';
import { useDrops } from './drops.js';

const CRATES_BY_ID = new Map((ps99.crates || []).map((c) => [c.id, c]));

let battleBridge = null;

export function setBattleBridge(bridge) {
  battleBridge = bridge || null;
}

function hydrateBattle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const crateIds = Array.isArray(raw.crateIds) ? raw.crateIds : [];
  const crates = crateIds.map((id) => CRATES_BY_ID.get(id)).filter(Boolean);
  return {
    ...raw,
    crates,
  };
}

async function flushBeforeMutation() {
  if (typeof battleBridge?.flushBeforeBattle === 'function') {
    await battleBridge.flushBeforeBattle();
  }
}

export const useBattles = create((set, get) => ({
  rooms: [],

  syncServerBattles(serverBattles) {
    if (!Array.isArray(serverBattles)) return;
    set({
      rooms: serverBattles.map(hydrateBattle).filter(Boolean),
    });
  },

  async createBattle({ mode, crateIds }) {
    const account = battleBridge?.getCurrentAccount?.();
    if (!account) {
      battleBridge?.openAuthModal?.('login');
      return { ok: false, error: 'Sign in or create an account to create a battle!' };
    }
    await flushBeforeMutation();
    const res = await apiPost('/api/battles/create', { mode, crateIds });
    if (res.ok) {
      if (Array.isArray(res.battles)) get().syncServerBattles(res.battles);
      if (res.account) battleBridge?.applyAccountFromServer?.(res);
    }
    return {
      ...res,
      battle: res.battle ? hydrateBattle(res.battle) : null,
    };
  },

  async joinBattle(battleId, seatIdx = null) {
    const account = battleBridge?.getCurrentAccount?.();
    if (!account) {
      battleBridge?.openAuthModal?.('login');
      return { ok: false, error: 'Sign in or create an account to join this battle!' };
    }
    await flushBeforeMutation();
    const res = await apiPost('/api/battles/join', { battleId, seatIdx });
    if (res.ok) {
      if (Array.isArray(res.battles)) get().syncServerBattles(res.battles);
      if (res.account) battleBridge?.applyAccountFromServer?.(res);
    }
    return {
      ...res,
      battle: res.battle ? hydrateBattle(res.battle) : null,
    };
  },

  async callBot(battleId, seatIdx = null, fillAll = false) {
    const res = await apiPost('/api/battles/call-bot', { battleId, seatIdx, fillAll });
    if (res.ok && Array.isArray(res.battles)) {
      get().syncServerBattles(res.battles);
    }
    return {
      ...res,
      battle: res.battle ? hydrateBattle(res.battle) : null,
    };
  },

  async leaveBattle(battleId) {
    await flushBeforeMutation();
    const res = await apiPost('/api/battles/leave', { battleId });
    if (res.ok) {
      if (Array.isArray(res.battles)) get().syncServerBattles(res.battles);
      if (res.account) battleBridge?.applyAccountFromServer?.(res);
    }
    return res;
  },

  async settleBattle(battleId) {
    const res = await apiPost('/api/battles/settle', { battleId });
    if (res.ok) {
      if (Array.isArray(res.battles)) get().syncServerBattles(res.battles);
      if (Array.isArray(res.drops)) useDrops.getState().syncServerDrops(res.drops);
      if (res.account) battleBridge?.applyAccountFromServer?.(res);
    }
    return {
      ...res,
      battle: res.battle ? hydrateBattle(res.battle) : null,
    };
  },
}));
