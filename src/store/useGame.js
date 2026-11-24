import { create } from 'zustand';
import { useToast } from './toast.js';
import { useFeed } from './feed.js';
import { setMutedGetter } from '../lib/sound.js';
import { randInt } from '../lib/rng.js';
import ps99 from '../data/ps99.json';

export const INITIAL_BALANCE = 100_000_000;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const STREAK_EXPIRE_MS = 48 * 60 * 60 * 1000;
export const DEFAULT_ECONOMY = ps99.economy;

const SETTINGS_KEY = 'petflip99_settings_v1';

function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { muted: Boolean(parsed?.muted) };
    }
  } catch {
    // Ignore storage read errors
  }
  return { muted: false };
}

function writeSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted: Boolean(settings?.muted) }));
  } catch {
    // Ignore storage write errors
  }
}

export function getLevel(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}

export function getLevelProgress(xp) {
  const level = getLevel(xp);
  const currentFloor = 50 * Math.pow(level - 1, 2);
  const nextFloor = 50 * Math.pow(level, 2);
  const span = Math.max(1, nextFloor - currentFloor);
  return {
    level,
    pct: Math.min(1, Math.max(0, (xp - currentFloor) / span)),
    currentXp: Math.floor(xp - currentFloor),
    neededXp: Math.ceil(nextFloor - currentFloor),
  };
}

export function createDefaultAccountData(startingBalance = 500_000) {
  return {
    balance: Math.max(0, Math.round(Number(startingBalance) || 0)),
    inventory: [],
    history: [],
    stats: {
      wagered: 0,
      profit: 0,
      bets: 0,
      wins: 0,
      biggestWin: 0,
    },
    xp: 0,
    lastDaily: 0,
    dailyStreak: 0,
    claimedRewards: [],
  };
}

function pickAccountData(state) {
  return {
    balance: state.balance,
    inventory: state.inventory,
    history: state.history,
    stats: state.stats,
    xp: state.xp,
    lastDaily: state.lastDaily,
    dailyStreak: state.dailyStreak,
    claimedRewards: state.claimedRewards,
  };
}

let isHydrating = false;
let syncHandler = null;
let accessGuards = null;

export function setSyncHandler(fn) {
  syncHandler = typeof fn === 'function' ? fn : null;
}

export function setAccessGuards(guards) {
  accessGuards = guards || null;
}

function requireActiveAccount() {
  const toast = useToast.getState();
  const account = accessGuards?.getCurrentAccount?.();
  if (!account) {
    toast.push('Sign in or create an account to play!', 'info');
    accessGuards?.openAuthModal?.('login');
    return null;
  }
  if (account.banned) {
    toast.push('Your account is banned.', 'error');
    return null;
  }
  return account;
}

export const useGame = create((set, get) => ({
  ...createDefaultAccountData(0),
  username: 'Guest',
  winStreak: 0,
  settings: readSettings(),

  loadAccountData(account) {
    if (!account) {
      get().loadGuestState();
      return;
    }
    const base = createDefaultAccountData(0);
    const data = account.data || {};
    const switchingUser = account.username !== get().username;
    isHydrating = true;
    try {
      set({
        username: account.username,
        ...(switchingUser ? { winStreak: 0 } : {}),
        balance: Number.isFinite(data.balance) ? Math.max(0, Math.round(data.balance)) : base.balance,
        inventory: Array.isArray(data.inventory) ? data.inventory : [],
        history: Array.isArray(data.history) ? data.history : [],
        stats: data.stats ? { ...base.stats, ...data.stats } : { ...base.stats },
        xp: Number.isFinite(data.xp) ? Math.max(0, data.xp) : 0,
        lastDaily: Number.isFinite(data.lastDaily) ? data.lastDaily : 0,
        dailyStreak: Number.isFinite(data.dailyStreak) ? data.dailyStreak : 0,
        claimedRewards: Array.isArray(data.claimedRewards) ? data.claimedRewards : [],
      });
    } finally {
      isHydrating = false;
    }
  },

  loadGuestState() {
    isHydrating = true;
    try {
      set({
        ...createDefaultAccountData(0),
        username: 'Guest',
        winStreak: 0,
      });
    } finally {
      isHydrating = false;
    }
  },

  canBet(amount) {
    const account = accessGuards?.getCurrentAccount?.();
    if (!account || account.banned) return false;
    const siteConfig = accessGuards?.getSiteConfig?.();
    if (siteConfig?.maintenanceMode && account.role !== 'admin') return false;
    return Number.isInteger(amount) && amount > 0 && amount <= get().balance;
  },

  placeBet(amount) {
    const account = requireActiveAccount();
    if (!account) return false;
    const toast = useToast.getState();
    const siteConfig = accessGuards?.getSiteConfig?.();
    if (siteConfig?.maintenanceMode && account.role !== 'admin') {
      toast.push('Site is in Maintenance Mode.', 'error');
      return false;
    }
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      toast.push('Enter a valid whole gem amount (> 0)', 'error');
      return false;
    }
    const { balance } = get();
    if (amount > balance) {
      toast.push('Insufficient gems! Claim rewards or deposit demo gems.', 'error');
      return false;
    }
    set((state) => ({
      balance: Math.max(0, state.balance - amount),
    }));
    return true;
  },

  payout(amount) {
    const safeAmount = Math.max(0, Math.round(Number(amount) || 0));
    if (safeAmount <= 0) return;
    set((state) => ({
      balance: state.balance + safeAmount,
    }));
  },

  recordBet({ game, amount, multiplier, payout }) {
    const safeAmount = Math.max(0, Math.round(amount));
    const safePayout = Math.max(0, Math.round(payout));
    const safeMult = Number((Number(multiplier) || 0).toFixed(2));
    const now = Date.now();
    const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;

    set((state) => {
      const entry = {
        id,
        game,
        amount: safeAmount,
        multiplier: safeMult,
        payout: safePayout,
        time: now,
      };
      const net = safePayout - safeAmount;
      const isWin = safePayout > safeAmount || (safePayout > 0 && safeMult >= 1);
      return {
        winStreak: isWin ? (state.winStreak || 0) + 1 : 0,
        history: [entry, ...state.history].slice(0, 200),
        xp: state.xp + safeAmount / 100_000,
        stats: {
          wagered: state.stats.wagered + safeAmount,
          profit: state.stats.profit + net,
          bets: state.stats.bets + 1,
          wins: state.stats.wins + (isWin ? 1 : 0),
          biggestWin: Math.max(state.stats.biggestWin, safePayout),
        },
      };
    });

    useFeed.getState().push({
      id,
      user: get().username,
      game,
      amount: safeAmount,
      multiplier: safeMult,
      payout: safePayout,
      isUser: true,
      time: now,
    });
  },

  addItems(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const stamped = items.map((item) => ({
      ...item,
      uid:
        item.uid ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    }));
    set((state) => ({
      inventory: [...stamped, ...state.inventory],
    }));
  },

  sellItem(uid) {
    const item = get().inventory.find((i) => i.uid === uid);
    if (!item) return 0;
    set((state) => ({
      inventory: state.inventory.filter((i) => i.uid !== uid),
      balance: state.balance + Math.round(item.value),
    }));
    return Math.round(item.value);
  },

  sellItemsByUids(uids) {
    const uidSet = new Set(uids);
    let total = 0;
    let count = 0;
    for (const item of get().inventory) {
      if (uidSet.has(item.uid)) {
        total += Math.round(item.value);
        count++;
      }
    }
    if (count === 0) return { count: 0, total: 0 };
    set((state) => ({
      inventory: state.inventory.filter((i) => !uidSet.has(i.uid)),
      balance: state.balance + total,
    }));
    return { count, total };
  },

  sellAll() {
    const inv = get().inventory;
    if (inv.length === 0) return { count: 0, total: 0 };
    const total = inv.reduce((sum, i) => sum + Math.round(i.value), 0);
    const count = inv.length;
    set((state) => ({
      inventory: [],
      balance: state.balance + total,
    }));
    return { count, total };
  },

  deposit(amount) {
    const account = requireActiveAccount();
    if (!account) return false;
    const siteConfig = accessGuards?.getSiteConfig?.();
    if (siteConfig && !siteConfig.allowDeposits && account.role !== 'admin') {
      useToast.getState().push('Demo deposits are disabled by admin.', 'error');
      return false;
    }
    const safe = Math.round(Number(amount) || 0);
    if (safe <= 0) return false;
    set((state) => ({
      balance: state.balance + safe,
    }));
    return true;
  },

  withdraw(amount) {
    const account = requireActiveAccount();
    if (!account) return false;
    const safe = Math.round(Number(amount) || 0);
    if (safe <= 0 || safe > get().balance) return false;
    set((state) => ({
      balance: Math.max(0, state.balance - safe),
    }));
    return true;
  },

  claimDaily(dailyRewardsList = DEFAULT_ECONOMY.dailyRewards) {
    const account = requireActiveAccount();
    if (!account) return { ok: false, authRequired: true };
    const now = Date.now();
    const { lastDaily, dailyStreak } = get();
    const elapsed = now - lastDaily;
    if (lastDaily > 0 && elapsed < DAILY_COOLDOWN_MS) {
      return { ok: false, remainingMs: DAILY_COOLDOWN_MS - elapsed };
    }
    const effectiveStreak =
      lastDaily > 0 && elapsed > STREAK_EXPIRE_MS ? 0 : dailyStreak || 0;
    const nextIdx = effectiveStreak % dailyRewardsList.length;
    const reward = dailyRewardsList[nextIdx] || dailyRewardsList[0];

    let bonusPet = null;
    if (reward?.bonusPet && ps99.dailyBonusPets?.length > 0) {
      const picked = ps99.dailyBonusPets[randInt(0, ps99.dailyBonusPets.length - 1)];
      bonusPet = {
        ...picked,
        uid: `${now}-${Math.random().toString(36).slice(2, 9)}`,
        from: 'Day 7 Daily Reward',
      };
    }

    const gems = Math.round(reward?.gems || 100_000);
    set((state) => ({
      balance: state.balance + gems,
      lastDaily: now,
      dailyStreak: nextIdx + 1,
      inventory: bonusPet ? [bonusPet, ...state.inventory] : state.inventory,
    }));
    return { ok: true, day: nextIdx + 1, amount: gems, pet: bonusPet };
  },

  toggleMuted() {
    set((state) => {
      const next = { ...state.settings, muted: !state.settings.muted };
      writeSettings(next);
      return { settings: next };
    });
  },

  claimLevelReward(level, rewardGems) {
    const account = requireActiveAccount();
    if (!account) return false;
    const { xp, claimedRewards } = get();
    if (getLevel(xp) < level || claimedRewards.includes(level)) return false;
    set((state) => ({
      claimedRewards: [...state.claimedRewards, level],
      balance: state.balance + rewardGems,
    }));
    return true;
  },

  resetAccount() {
    const account = requireActiveAccount();
    if (!account) return;
    if (typeof accessGuards?.resetAccountOnServer === 'function') {
      accessGuards.resetAccountOnServer();
      return;
    }
    const siteConfig = accessGuards?.getSiteConfig?.();
    const startBal =
      account.role === 'admin'
        ? INITIAL_BALANCE
        : (siteConfig?.startingBalance ?? 500_000);
    set(createDefaultAccountData(startBal));
  },
}));

useGame.subscribe((state, prevState) => {
  if (isHydrating || typeof syncHandler !== 'function') return;
  if (
    state.balance !== prevState.balance ||
    state.inventory !== prevState.inventory ||
    state.history !== prevState.history ||
    state.stats !== prevState.stats ||
    state.xp !== prevState.xp ||
    state.lastDaily !== prevState.lastDaily ||
    state.dailyStreak !== prevState.dailyStreak ||
    state.claimedRewards !== prevState.claimedRewards
  ) {
    syncHandler(pickAccountData(state));
  }
});

setMutedGetter(() => useGame.getState().settings.muted);
