import { create } from 'zustand';
import {
  apiGet,
  apiPost,
  clearRecoveryBlob,
  clearToken,
  getRecoveryBlob,
  getToken,
  setRecoveryBlob,
  setToken,
} from '../lib/api.js';
import { setAccessGuards, setSyncHandler, useGame } from './useGame.js';
import { useSiteConfig } from './siteConfig.js';
import { useChat } from './chat.js';
import { useDrops } from './drops.js';
import { useToast } from './toast.js';
import { setBattleBridge, useBattles } from './battles.js';
import { setCoinflipBridge, useCoinflips } from './coinflips.js';

let syncTimer = null;
let pendingSnapshot = null;
let syncInFlight = false;
let dirtyWhileSyncing = false;
let initPromise = null;
let authEpoch = 0;
let pollInFlight = false;

export const useAuth = create((set, get) => {
  const applySharedState = (
    { me, userKey, siteConfig, chat, drops, battles, coinflips, accounts, promoCodes, hadToken, recoveryBlob },
    forceReloadMe = false,
    sentToken = ''
  ) => {
    if (siteConfig) {
      useSiteConfig.getState().applyServerConfig(siteConfig);
    }
    if (Array.isArray(chat)) {
      useChat.getState().syncServerChat(chat);
    }
    if (Array.isArray(drops)) {
      useDrops.getState().syncServerDrops(drops);
    }
    if (Array.isArray(battles)) {
      useBattles.getState().syncServerBattles(battles);
    }
    if (Array.isArray(coinflips)) {
      useCoinflips.getState().syncServerCoinflips(coinflips);
    }
    if (recoveryBlob) {
      setRecoveryBlob(recoveryBlob);
    }

    const prevKey = get().currentUserKey;
    const prevRev = get().activeAdminRevision;

    if (me && userKey) {
      const nextRev = Number(me.adminRevision) || 1;
      const nextAccounts = accounts || { ...(get().accounts || {}), [userKey]: me };
      const nextPromos = Array.isArray(promoCodes)
        ? promoCodes
        : me.role === 'admin'
          ? get().promoCodes
          : [];
      set({
        accounts: nextAccounts,
        currentUserKey: userKey,
        activeAdminRevision: nextRev,
        promoCodes: nextPromos,
      });

      if (forceReloadMe || prevKey !== userKey || prevRev !== nextRev) {
        pendingSnapshot = null;
        if (syncTimer) {
          clearTimeout(syncTimer);
          syncTimer = null;
        }
        useGame.getState().loadAccountData(me);
        if (
          !forceReloadMe &&
          prevKey === userKey &&
          prevRev > 0 &&
          prevRev !== nextRev &&
          (me.lastRevReason || 'admin') === 'admin'
        ) {
          useToast.getState().push('Account updated by admin.', 'info');
        }
      }
    } else {
      const wasSignedIn = Boolean(prevKey);
      if (sentToken && hadToken !== false) {
        clearToken(sentToken);
      }
      const serverRejectedSession = hadToken === true || Boolean(sentToken && hadToken !== false);
      if (!wasSignedIn || serverRejectedSession) {
        pendingSnapshot = null;
        if (syncTimer) {
          clearTimeout(syncTimer);
          syncTimer = null;
        }
        set({
          accounts: {},
          currentUserKey: null,
          activeAdminRevision: 0,
          promoCodes: [],
        });
        if (wasSignedIn || forceReloadMe) {
          useGame.getState().loadGuestState();
          if (!forceReloadMe && wasSignedIn) {
            useToast.getState().push('Session ended (signed out or banned).', 'info');
          }
        } else if (!get().authReady) {
          useGame.getState().loadGuestState();
        }
      }
    }
  };

  const applyAdminAccountResponse = (res) => {
    if (res.siteConfig) {
      useSiteConfig.getState().applyServerConfig(res.siteConfig);
    }
    if (Array.isArray(res.drops)) {
      useDrops.getState().syncServerDrops(res.drops);
    }
    if (res.accounts) {
      const curKey = get().currentUserKey;
      const updatedMe = curKey ? res.accounts[curKey] : null;
      const nextRev = updatedMe ? Number(updatedMe.adminRevision) || 1 : get().activeAdminRevision;
      set({
        accounts: res.accounts,
        activeAdminRevision: nextRev,
      });
      if (updatedMe) {
        pendingSnapshot = null;
        if (syncTimer) {
          clearTimeout(syncTimer);
          syncTimer = null;
        }
        useGame.getState().loadAccountData(updatedMe);
      }
    }
  };

  const flushSync = async () => {
    if (!pendingSnapshot) return;
    if (!get().currentUserKey) {
      pendingSnapshot = null;
      return;
    }
    if (syncInFlight) {
      dirtyWhileSyncing = true;
      return;
    }

    syncInFlight = true;
    const epochAtStart = authEpoch;
    const sentToken = getToken();
    const payload = {
      data: pendingSnapshot,
      adminRevision: get().activeAdminRevision || 1,
    };
    pendingSnapshot = null;

    try {
      const res = await apiPost('/api/account/sync', payload);
      if (epochAtStart !== authEpoch || sentToken !== getToken()) {
        dirtyWhileSyncing = false;
        return;
      }
      if (res.stale && res.account) {
        if (res.recoveryBlob) setRecoveryBlob(res.recoveryBlob);
        const curKey = get().currentUserKey;
        const nextRev = Number(res.account.adminRevision) || 1;
        set((state) => ({
          activeAdminRevision: nextRev,
          accounts: curKey ? { ...state.accounts, [curKey]: res.account } : state.accounts,
        }));
        useGame.getState().loadAccountData(res.account);
        if ((res.account.lastRevReason || 'admin') === 'admin') {
          useToast.getState().push('Account updated by admin.', 'info');
        }
        dirtyWhileSyncing = false;
      } else if (res.status === 401) {
        clearToken(sentToken);
        set({ accounts: {}, currentUserKey: null, activeAdminRevision: 0, promoCodes: [] });
        useGame.getState().loadGuestState();
        useToast.getState().push('Session expired — please sign in again.', 'info');
        dirtyWhileSyncing = false;
      } else if (res.ok) {
        if (res.recoveryBlob) setRecoveryBlob(res.recoveryBlob);
        const curKey = get().currentUserKey;
        if (curKey && get().accounts[curKey]) {
          set((state) => ({
            accounts: {
              ...state.accounts,
              [curKey]: {
                ...state.accounts[curKey],
                data: payload.data,
              },
            },
          }));
        }
      }
    } finally {
      syncInFlight = false;
      if (dirtyWhileSyncing && pendingSnapshot) {
        dirtyWhileSyncing = false;
        scheduleSync(60);
      }
    }
  };

  const scheduleSync = (delay = 180) => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      flushSync();
    }, delay);
  };

  setSyncHandler((snapshot) => {
    if (!get().currentUserKey) return;
    pendingSnapshot = snapshot;
    scheduleSync(180);
  });

  setAccessGuards({
    getCurrentAccount: () => {
      const { currentUserKey, accounts } = get();
      return currentUserKey ? accounts[currentUserKey] || null : null;
    },
    openAuthModal: (tab) => {
      get().openAuthModal(tab);
    },
    getSiteConfig: () => useSiteConfig.getState(),
    resetAccountOnServer: () => get().resetCurrentAccountData(),
  });

  setBattleBridge({
    flushBeforeBattle: async () => {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      await flushSync();
    },
    openAuthModal: (tab) => {
      get().openAuthModal(tab);
    },
    getCurrentAccount: () => {
      const { currentUserKey, accounts } = get();
      return currentUserKey ? accounts[currentUserKey] || null : null;
    },
    applyAccountFromServer: (res) => {
      if (res?.recoveryBlob) setRecoveryBlob(res.recoveryBlob);
      if (!res?.account) return;
      const curKey = get().currentUserKey;
      if (!curKey) return;
      pendingSnapshot = null;
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      const nextRev = Number(res.account.adminRevision) || get().activeAdminRevision || 1;
      set((state) => ({
        activeAdminRevision: nextRev,
        accounts: { ...state.accounts, [curKey]: res.account },
      }));
      useGame.getState().loadAccountData(res.account);
    },
  });

  setCoinflipBridge({
    flushBeforeCoinflip: async () => {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      await flushSync();
    },
    openAuthModal: (tab) => {
      get().openAuthModal(tab);
    },
    getCurrentAccount: () => {
      const { currentUserKey, accounts } = get();
      return currentUserKey ? accounts[currentUserKey] || null : null;
    },
    applyAccountFromServer: (res) => {
      if (res?.recoveryBlob) setRecoveryBlob(res.recoveryBlob);
      if (!res?.account) return;
      const curKey = get().currentUserKey;
      if (!curKey) return;
      pendingSnapshot = null;
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      const nextRev = Number(res.account.adminRevision) || get().activeAdminRevision || 1;
      set((state) => ({
        activeAdminRevision: nextRev,
        accounts: { ...state.accounts, [curKey]: res.account },
      }));
      useGame.getState().loadAccountData(res.account);
    },
  });

  return {
    accounts: {},
    currentUserKey: null,
    activeAdminRevision: 0,
    promoCodes: [],
    authReady: false,
    authModalOpen: false,
    authModalTab: 'login',

    openAuthModal(tab = 'login') {
      set({
        authModalOpen: true,
        authModalTab: tab === 'register' ? 'register' : 'login',
      });
    },

    closeAuthModal() {
      set({ authModalOpen: false });
    },

    async syncFromServer(forceReloadMe = false) {
      if (!forceReloadMe && pollInFlight) {
        return { ok: false, skipped: true };
      }
      const epochAtStart = authEpoch;
      const sentToken = getToken();
      if (!forceReloadMe) pollInFlight = true;
      try {
        const res = await apiGet('/api/state');
        if (epochAtStart !== authEpoch || sentToken !== getToken()) {
          return { ok: false, stalePoll: true };
        }
        if (res.ok && res.needsRecovery) {
          const blob = getRecoveryBlob();
          if (blob) {
            const rec = await apiPost('/api/auth/recover', { recoveryBlob: blob });
            if (epochAtStart !== authEpoch || sentToken !== getToken()) {
              return { ok: false, stalePoll: true };
            }
            if (rec.ok && rec.me && rec.userKey) {
              applySharedState(rec, forceReloadMe, sentToken);
              return rec;
            }
          }
          if (res.me) {
            applySharedState(res, forceReloadMe, sentToken);
          } else {
            applySharedState({ ...res, hadToken: true }, forceReloadMe, sentToken);
          }
          return res;
        }
        if (res.ok) {
          applySharedState(res, forceReloadMe, sentToken);
        }
        return res;
      } finally {
        if (!forceReloadMe) pollInFlight = false;
      }
    },

    async initAuth() {
      if (!initPromise) {
        initPromise = (async () => {
          await get().syncFromServer(true);
          set({ authReady: true });
        })().finally(() => {
          initPromise = null;
        });
      }
      return initPromise;
    },

    startLiveSync() {
      let stopped = false;
      const poll = () => {
        if (stopped || (typeof document !== 'undefined' && document.hidden)) return;
        get().syncFromServer(false);
      };
      const id = setInterval(poll, 2000);
      const onVis = () => {
        if (!document.hidden && !stopped) {
          get().syncFromServer(false);
        }
      };
      const onStorage = (e) => {
        if (!stopped && e.key === 'petflip99_token_v1') {
          get().syncFromServer(false);
        }
      };
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVis);
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', onStorage);
      }
      return () => {
        stopped = true;
        clearInterval(id);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVis);
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('storage', onStorage);
        }
      };
    },

    async register(username, password) {
      const res = await apiPost('/api/auth/register', { username, password });
      if (!res.ok) return res;
      authEpoch += 1;
      setToken(res.token);
      if (res.recoveryBlob) setRecoveryBlob(res.recoveryBlob);
      if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
      pendingSnapshot = null;
      set({
        accounts: { [res.userKey]: res.account },
        currentUserKey: res.userKey,
        activeAdminRevision: Number(res.account?.adminRevision) || 1,
        promoCodes: [],
        authModalOpen: false,
      });
      useGame.getState().loadAccountData(res.account);
      return res;
    },

    async login(username, password) {
      const res = await apiPost('/api/auth/login', { username, password });
      if (!res.ok) return res;
      authEpoch += 1;
      setToken(res.token);
      if (res.recoveryBlob) setRecoveryBlob(res.recoveryBlob);
      if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
      pendingSnapshot = null;
      set({
        accounts: res.accounts || { [res.userKey]: res.account },
        currentUserKey: res.userKey,
        activeAdminRevision: Number(res.account?.adminRevision) || 1,
        promoCodes: Array.isArray(res.promoCodes) ? res.promoCodes : [],
        authModalOpen: false,
      });
      useGame.getState().loadAccountData(res.account);
      return res;
    },

    async logout() {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      await flushSync();
      authEpoch += 1;
      await apiPost('/api/auth/logout', {});
      clearToken();
      clearRecoveryBlob();
      pendingSnapshot = null;
      set({
        accounts: {},
        currentUserKey: null,
        activeAdminRevision: 0,
        promoCodes: [],
      });
      useGame.getState().loadGuestState();
      get().syncFromServer(false);
    },

    async changePassword(currentPassword, newPassword) {
      return apiPost('/api/auth/change-password', { currentPassword, newPassword });
    },

    async resetCurrentAccountData() {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      pendingSnapshot = null;
      const res = await apiPost('/api/account/reset', {});
      if (res.ok && res.recoveryBlob) setRecoveryBlob(res.recoveryBlob);
      if (res.ok && res.account) {
        const curKey = get().currentUserKey;
        const nextRev = Number(res.account.adminRevision) || 1;
        set((state) => ({
          activeAdminRevision: nextRev,
          accounts: curKey ? { ...state.accounts, [curKey]: res.account } : state.accounts,
        }));
        useGame.getState().loadAccountData(res.account);
      }
      return res;
    },

    async adminCreateAccount({ username, password, role = 'user', balance }) {
      const res = await apiPost('/api/admin/accounts/create', {
        username,
        password,
        role,
        balance,
      });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminAdjustBalance(targetKey, delta) {
      const res = await apiPost('/api/admin/accounts/balance', {
        targetKey,
        mode: 'adjust',
        amount: delta,
      });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminSetBalance(targetKey, amount) {
      const res = await apiPost('/api/admin/accounts/balance', {
        targetKey,
        mode: 'set',
        amount,
      });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminGrantPet(targetKey, pet, pushToTicker = true) {
      const res = await apiPost('/api/admin/accounts/grant-pet', {
        targetKey,
        pet,
        pushToTicker,
      });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminRemoveInventoryItem(targetKey, uid) {
      const res = await apiPost('/api/admin/accounts/remove-pet', { targetKey, uid });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminSetXp(targetKey, xp) {
      const res = await apiPost('/api/admin/accounts/xp', { targetKey, xp });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminResetDaily(targetKey) {
      const res = await apiPost('/api/admin/accounts/reset-daily', { targetKey });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminSetRole(targetKey, role) {
      const res = await apiPost('/api/admin/accounts/role', { targetKey, role });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminSetBanned(targetKey, banned, reason = '') {
      const res = await apiPost('/api/admin/accounts/ban', { targetKey, banned, reason });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminResetPassword(targetKey, newPassword) {
      const res = await apiPost('/api/admin/accounts/reset-password', { targetKey, newPassword });
      if (res.ok && res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
      return res;
    },

    async adminResetAccountData(targetKey) {
      const res = await apiPost('/api/admin/accounts/reset-data', { targetKey });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async adminDeleteAccount(targetKey) {
      const res = await apiPost('/api/admin/accounts/delete', { targetKey });
      if (res.ok) applyAdminAccountResponse(res);
      return res;
    },

    async redeemPromoCode(code) {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      await flushSync();
      const res = await apiPost('/api/promo/redeem', { code });
      if (res.ok && res.recoveryBlob) setRecoveryBlob(res.recoveryBlob);
      if (res.ok && res.account) {
        const curKey = get().currentUserKey;
        const nextRev = Number(res.account.adminRevision) || 1;
        pendingSnapshot = null;
        set((state) => ({
          activeAdminRevision: nextRev,
          accounts: curKey ? { ...state.accounts, [curKey]: res.account } : state.accounts,
        }));
        useGame.getState().loadAccountData(res.account);
      }
      return res;
    },

    async adminCreatePromo(payload) {
      const res = await apiPost('/api/admin/promos/create', payload);
      if (res.ok) {
        if (Array.isArray(res.promoCodes)) set({ promoCodes: res.promoCodes });
        if (Array.isArray(res.chat)) useChat.getState().syncServerChat(res.chat);
        if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
      }
      return res;
    },

    async adminTogglePromo(code, active) {
      const res = await apiPost('/api/admin/promos/toggle', { code, active });
      if (res.ok) {
        if (Array.isArray(res.promoCodes)) set({ promoCodes: res.promoCodes });
        if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
      }
      return res;
    },

    async adminDeletePromo(code) {
      const res = await apiPost('/api/admin/promos/delete', { code });
      if (res.ok) {
        if (Array.isArray(res.promoCodes)) set({ promoCodes: res.promoCodes });
        if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
      }
      return res;
    },

    async adminAnnouncePromo(code) {
      const res = await apiPost('/api/admin/promos/announce', { code });
      if (res.ok) {
        if (Array.isArray(res.chat)) useChat.getState().syncServerChat(res.chat);
        if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
      }
      return res;
    },
  };
});
