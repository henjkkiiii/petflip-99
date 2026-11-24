import { create } from 'zustand';
import { apiPost } from '../lib/api.js';

export const ALL_GAMES = [
  { id: 'cases', label: 'Crates', path: '/cases' },
  { id: 'battles', label: 'Case Battles', path: '/battles' },
  { id: 'crash', label: 'Crash', path: '/crash' },
  { id: 'mines', label: 'Mines', path: '/mines' },
  { id: 'towers', label: 'Towers', path: '/towers' },
  { id: 'plinko', label: 'Plinko', path: '/plinko' },
  { id: 'dice', label: 'Dice', path: '/dice' },
  { id: 'limbo', label: 'Limbo', path: '/limbo' },
  { id: 'coinflip', label: 'Coinflip', path: '/coinflip' },
  { id: 'roulette', label: 'Roulette', path: '/roulette' },
  { id: 'blackjack', label: 'Blackjack', path: '/blackjack' },
];

export const THEME_PRESETS = {
  cyber: {
    label: 'Neon Cyber',
    primary: '#4f6bff',
    gem: '#38d9ff',
    gold: '#ffc531',
    bg: '#0b0d14',
    panel: '#12151f',
  },
  royal: {
    label: 'Royal Gold',
    primary: '#f59e0b',
    gem: '#fde047',
    gold: '#ffc531',
    bg: '#0e0b08',
    panel: '#1a1510',
  },
  emerald: {
    label: 'Emerald Vault',
    primary: '#10b981',
    gem: '#34d399',
    gold: '#fbbf24',
    bg: '#07110e',
    panel: '#0f1f1a',
  },
  crimson: {
    label: 'Crimson VIP',
    primary: '#f43f5e',
    gem: '#fb7185',
    gold: '#fbbf24',
    bg: '#12080c',
    panel: '#1d0f15',
  },
  midnight: {
    label: 'Midnight Purple',
    primary: '#8b5cf6',
    gem: '#c084fc',
    gold: '#facc15',
    bg: '#0c0916',
    panel: '#151026',
  },
};

export const DEFAULT_SITE_CONFIG = {
  startingBalance: 500_000,
  allowDeposits: true,
  allowRegistration: true,
  maintenanceMode: false,
  chatEnabled: true,
  botsEnabled: true,
  banner: {
    text: '',
    tone: 'info',
  },
  crateDiscountPct: 0,
  cratePriceOverrides: {},
  crateDisabledIds: [],
  branding: {
    siteName: 'PETFLIP',
    siteSuffix: '99',
    heroTitle: 'Unbox Huge & Titanic Pets.',
    heroSubtitle:
      'Open custom PS99 crates, battle live in PvP Case Battles, and play 11 gem arcade games.',
    footerText:
      'Fan-made demo. Play-money gems only – no real value, no real deposits. Not affiliated with BIG Games or Roblox.',
    currencyName: 'Gems',
  },
  theme: {
    preset: 'cyber',
    ...THEME_PRESETS.cyber,
  },
  games: {
    enabled: Object.fromEntries(ALL_GAMES.map((g) => [g.id, true])),
    minBet: 1_000,
    maxBet: 0,
    xpMultiplier: 1,
    dailyMultiplier: 1,
  },
  ui: {
    showLiveTicker: true,
    showPromoSidebar: true,
    showFairnessLink: true,
  },
  auditLog: [],
};

export function applyThemeAndBrandingToDom(theme, branding) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const t = theme || DEFAULT_SITE_CONFIG.theme;
  if (t.primary) root.style.setProperty('--primary', t.primary);
  if (t.gem) root.style.setProperty('--gem', t.gem);
  if (t.gold) root.style.setProperty('--gold', t.gold);
  if (t.bg) root.style.setProperty('--bg', t.bg);
  if (t.panel) root.style.setProperty('--panel', t.panel);

  if (branding?.siteName) {
    const suffix = branding.siteSuffix ? ` ${branding.siteSuffix}` : '';
    const isAdmin = window.location.pathname.startsWith('/admin');
    document.title = isAdmin
      ? `${branding.siteName}${suffix} — Admin Dashboard`
      : `${branding.siteName}${suffix} — Gem Arcade`;
  }
}

export function getEffectiveCratePrice(crate, config) {
  if (!crate) return 0;
  const override = config?.cratePriceOverrides?.[crate.id];
  const base = Number.isFinite(override) && override > 0 ? override : crate.price;
  const discountPct = Math.min(80, Math.max(0, Number(config?.crateDiscountPct) || 0));
  return Math.max(1_000, Math.round(base * (1 - discountPct / 100)));
}

export const useSiteConfig = create((set, get) => {
  const pushConfigPatch = async (patch, auditAction) => {
    const res = await apiPost('/api/admin/config', { patch, auditAction });
    if (res.ok && res.siteConfig) {
      get().applyServerConfig(res.siteConfig);
    }
    return res;
  };

  return {
    ...DEFAULT_SITE_CONFIG,

    applyServerConfig(cfg) {
      if (!cfg || typeof cfg !== 'object') return;
      const nextBranding = {
        ...DEFAULT_SITE_CONFIG.branding,
        ...(cfg.branding || {}),
      };
      const nextTheme = {
        ...DEFAULT_SITE_CONFIG.theme,
        ...(cfg.theme || {}),
      };
      const nextGames = {
        ...DEFAULT_SITE_CONFIG.games,
        ...(cfg.games || {}),
        enabled: {
          ...DEFAULT_SITE_CONFIG.games.enabled,
          ...(cfg.games?.enabled || {}),
        },
      };
      const nextUi = {
        ...DEFAULT_SITE_CONFIG.ui,
        ...(cfg.ui || {}),
      };
      set({
        startingBalance: cfg.startingBalance ?? DEFAULT_SITE_CONFIG.startingBalance,
        allowDeposits: cfg.allowDeposits ?? DEFAULT_SITE_CONFIG.allowDeposits,
        allowRegistration: cfg.allowRegistration ?? DEFAULT_SITE_CONFIG.allowRegistration,
        maintenanceMode: cfg.maintenanceMode ?? DEFAULT_SITE_CONFIG.maintenanceMode,
        chatEnabled: cfg.chatEnabled ?? DEFAULT_SITE_CONFIG.chatEnabled,
        botsEnabled: cfg.botsEnabled ?? DEFAULT_SITE_CONFIG.botsEnabled,
        banner: cfg.banner || DEFAULT_SITE_CONFIG.banner,
        crateDiscountPct: cfg.crateDiscountPct ?? 0,
        cratePriceOverrides: cfg.cratePriceOverrides || {},
        crateDisabledIds: Array.isArray(cfg.crateDisabledIds) ? cfg.crateDisabledIds : [],
        branding: nextBranding,
        theme: nextTheme,
        games: nextGames,
        ui: nextUi,
        auditLog: Array.isArray(cfg.auditLog) ? cfg.auditLog : [],
      });
      applyThemeAndBrandingToDom(nextTheme, nextBranding);
    },

    logAudit() {},

    async clearAuditLog() {
      const res = await apiPost('/api/admin/audit/clear', {});
      if (res.ok && res.siteConfig) {
        get().applyServerConfig(res.siteConfig);
      }
      return res;
    },

    async setStartingBalance(amount) {
      const safe = Math.max(0, Math.min(1e13, Math.round(Number(amount) || 0)));
      const res = await pushConfigPatch(
        { startingBalance: safe },
        `Set new account starting balance to ${safe.toLocaleString()} gems`
      );
      return { ...res, saved: safe };
    },

    setAllowDeposits(val) {
      const next = Boolean(val);
      return pushConfigPatch(
        { allowDeposits: next },
        `Set Allow Free Demo Deposits -> ${next ? 'ON' : 'OFF'}`
      );
    },

    setAllowRegistration(val) {
      const next = Boolean(val);
      return pushConfigPatch(
        { allowRegistration: next },
        `Set Allow New Registrations -> ${next ? 'ON' : 'OFF'}`
      );
    },

    setMaintenanceMode(val) {
      const next = Boolean(val);
      return pushConfigPatch(
        { maintenanceMode: next },
        `Set Maintenance Mode -> ${next ? 'ON' : 'OFF'}`
      );
    },

    setChatEnabled(val) {
      const next = Boolean(val);
      return pushConfigPatch(
        { chatEnabled: next },
        `Set Trollbox Chat -> ${next ? 'ON' : 'OFF'}`
      );
    },

    setBotsEnabled(val) {
      const next = Boolean(val);
      return pushConfigPatch(
        { botsEnabled: next },
        `Set Bot Activity & Fake Drops -> ${next ? 'ON' : 'OFF'}`
      );
    },

    setBanner(text, tone = 'info') {
      const cleanText = String(text || '').trim().slice(0, 180);
      const cleanTone = ['info', 'gold', 'danger'].includes(tone) ? tone : 'info';
      return pushConfigPatch(
        { banner: { text: cleanText, tone: cleanTone } },
        cleanText ? `Set site banner (${cleanTone}): "${cleanText}"` : 'Cleared site banner'
      );
    },

    async setCrateDiscountPct(pct) {
      const clamped = Math.min(80, Math.max(0, Math.round(Number(pct) || 0)));
      const res = await pushConfigPatch(
        { crateDiscountPct: clamped },
        `Set global crate discount to ${clamped}%`
      );
      return { ...res, saved: clamped };
    },

    setCratePriceOverride(crateId, price, crateName) {
      const clean =
        price === null || price === undefined || price === '' || Number(price) <= 0
          ? null
          : Math.max(1_000, Math.min(1e13, Math.round(Number(price))));
      return pushConfigPatch(
        { cratePriceOverride: { crateId, price: clean } },
        clean
          ? `Set custom price for ${crateName || crateId} to ${clean.toLocaleString()} gems`
          : `Reset custom price for ${crateName || crateId}`
      );
    },

    setCrateDisabled(crateId, disabled, crateName) {
      const next = Boolean(disabled);
      return pushConfigPatch(
        { toggleCrateDisabled: { crateId, disabled: next } },
        `${next ? 'Disabled' : 'Enabled'} crate ${crateName || crateId}`
      );
    },

    resetCratePricing() {
      return pushConfigPatch(
        { resetCratePricing: true },
        'Reset all crate discounts, custom prices, and visibility'
      );
    },

    updateBranding(brandingPatch, auditLabel = 'Updated site branding & copy') {
      return pushConfigPatch({ branding: brandingPatch }, auditLabel);
    },

    updateTheme(themePatch, auditLabel = 'Updated site color theme') {
      return pushConfigPatch({ theme: themePatch }, auditLabel);
    },

    updateGamesConfig(gamesPatch, auditLabel = 'Updated game rules & multipliers') {
      return pushConfigPatch({ games: gamesPatch }, auditLabel);
    },

    toggleGameEnabled(gameId, enabled, label) {
      const next = Boolean(enabled);
      return pushConfigPatch(
        { games: { enabled: { [gameId]: next } } },
        `${next ? 'Enabled' : 'Disabled'} game: ${label || gameId}`
      );
    },

    updateUiConfig(uiPatch, auditLabel = 'Updated UI visibility settings') {
      return pushConfigPatch({ ui: uiPatch }, auditLabel);
    },

    resetAllConfig() {
      return pushConfigPatch(
        { resetAllConfig: true },
        'Reset all site configuration, theme & branding to defaults'
      );
    },

    async airdropAll(amount, announce = true, includeBanned = false) {
      const res = await apiPost('/api/admin/accounts/airdrop', {
        amount,
        announce,
        includeBanned,
      });
      if (res.ok && res.siteConfig) {
        get().applyServerConfig(res.siteConfig);
      }
      return res;
    },

    async clearFinishedBattles() {
      const res = await apiPost('/api/admin/battles/clear-finished', {});
      if (res.ok && res.siteConfig) {
        get().applyServerConfig(res.siteConfig);
      }
      return res;
    },

    async clearDropsFeed() {
      const res = await apiPost('/api/admin/drops/clear', {});
      if (res.ok && res.siteConfig) {
        get().applyServerConfig(res.siteConfig);
      }
      return res;
    },

    async exportSnapshot() {
      return apiPost('/api/admin/export-snapshot', {});
    },

    async restoreSnapshot(payload) {
      const res = await apiPost('/api/admin/restore-snapshot', payload);
      if (res.ok && res.siteConfig) {
        get().applyServerConfig(res.siteConfig);
      }
      return res;
    },
  };
});
