import { create } from 'zustand';
import { apiPost } from '../lib/api.js';

let coinflipBridge = null;

export function setCoinflipBridge(bridge) {
  coinflipBridge = bridge || null;
}

async function flushBeforeMutation() {
  if (typeof coinflipBridge?.flushBeforeCoinflip === 'function') {
    await coinflipBridge.flushBeforeCoinflip();
  }
}

export const useCoinflips = create((set, get) => ({
  rooms: [],

  syncServerCoinflips(serverCoinflips) {
    if (!Array.isArray(serverCoinflips)) return;
    set({ rooms: serverCoinflips });
  },

  async createCoinflip({ bet, side }) {
    const account = coinflipBridge?.getCurrentAccount?.();
    if (!account) {
      coinflipBridge?.openAuthModal?.('login');
      return { ok: false, error: 'Sign in or create an account to create a Coinflip 1v1!' };
    }
    await flushBeforeMutation();
    const res = await apiPost('/api/coinflips/create', { bet, side });
    if (res.ok) {
      if (Array.isArray(res.coinflips)) get().syncServerCoinflips(res.coinflips);
      if (res.account) coinflipBridge?.applyAccountFromServer?.(res);
    }
    return res;
  },

  async joinCoinflip(coinflipId) {
    const account = coinflipBridge?.getCurrentAccount?.();
    if (!account) {
      coinflipBridge?.openAuthModal?.('login');
      return { ok: false, error: 'Sign in or create an account to join this Coinflip 1v1!' };
    }
    await flushBeforeMutation();
    const res = await apiPost('/api/coinflips/join', { coinflipId });
    if (res.ok) {
      if (Array.isArray(res.coinflips)) get().syncServerCoinflips(res.coinflips);
      if (res.account) coinflipBridge?.applyAccountFromServer?.(res);
    }
    return res;
  },

  async callBot(coinflipId) {
    const res = await apiPost('/api/coinflips/call-bot', { coinflipId });
    if (res.ok && Array.isArray(res.coinflips)) {
      get().syncServerCoinflips(res.coinflips);
    }
    return res;
  },

  async leaveCoinflip(coinflipId) {
    await flushBeforeMutation();
    const res = await apiPost('/api/coinflips/leave', { coinflipId });
    if (res.ok) {
      if (Array.isArray(res.coinflips)) get().syncServerCoinflips(res.coinflips);
      if (res.account) coinflipBridge?.applyAccountFromServer?.(res);
    }
    return res;
  },

  async settleCoinflip(coinflipId) {
    const res = await apiPost('/api/coinflips/settle', { coinflipId });
    if (res.ok) {
      if (Array.isArray(res.coinflips)) get().syncServerCoinflips(res.coinflips);
      if (res.account) coinflipBridge?.applyAccountFromServer?.(res);
    }
    return res;
  },
}));
