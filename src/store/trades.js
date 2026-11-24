import { create } from 'zustand';
import { apiPost } from '../lib/api.js';
import { useSiteConfig } from './siteConfig.js';

let tradeBridge = null;

export function setTradeBridge(bridge) {
  tradeBridge = bridge || null;
}

export const useTrades = create((set, get) => ({
  myTrades: [],
  adminQueue: [],
  botApiKey: '',

  syncFromState({ myTrades, tradeQueue, botApiKey }) {
    const patch = {};
    if (Array.isArray(myTrades)) patch.myTrades = myTrades;
    if (Array.isArray(tradeQueue)) patch.adminQueue = tradeQueue;
    if (typeof botApiKey === 'string' && botApiKey) patch.botApiKey = botApiKey;
    if (Object.keys(patch).length > 0) set(patch);
  },

  async requestTrade({ type, robloxUsername, amount, pets = [], petUids = [] }) {
    const res = await apiPost('/api/trades/request', { type, robloxUsername, amount, pets, petUids });
    if (res.ok) {
      if (Array.isArray(res.myTrades)) set({ myTrades: res.myTrades });
      if (res.account) tradeBridge?.applyAccountFromServer?.(res);
    }
    return res;
  },

  async cancelTrade(jobId) {
    const res = await apiPost('/api/trades/cancel', { jobId });
    if (res.ok) {
      if (Array.isArray(res.myTrades)) set({ myTrades: res.myTrades });
      if (res.account) tradeBridge?.applyAccountFromServer?.(res);
    }
    return res;
  },

  async adminApproveDeposit(jobId, gems) {
    const res = await apiPost('/api/admin/trades/approve-deposit', { jobId, gems });
    if (res.ok) {
      if (Array.isArray(res.tradeQueue)) set({ adminQueue: res.tradeQueue });
      if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
      if (res.accounts) tradeBridge?.applyAccountsMap?.(res.accounts);
    }
    return res;
  },

  async adminCompleteWithdraw(jobId) {
    const res = await apiPost('/api/admin/trades/complete-withdraw', { jobId });
    if (res.ok) {
      if (Array.isArray(res.tradeQueue)) set({ adminQueue: res.tradeQueue });
      if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
    }
    return res;
  },

  async adminCancelTrade(jobId, reason = 'Cancelled by admin') {
    const res = await apiPost('/api/admin/trades/cancel', { jobId, reason });
    if (res.ok) {
      if (Array.isArray(res.tradeQueue)) set({ adminQueue: res.tradeQueue });
      if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
      if (res.accounts) tradeBridge?.applyAccountsMap?.(res.accounts);
    }
    return res;
  },
}));
