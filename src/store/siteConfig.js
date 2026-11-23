import { create } from 'zustand';
import { apiPost } from '../lib/api.js';

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
  auditLog: [],
};

export function getEffectiveCratePrice(crate, config) {
  if (!crate) return 0;
  const override = config?.cratePriceOverrides?.[crate.id];
  const base = Number.isFinite(override) && override > 0 ? override : crate.price;
  const discountPct = Math.min(50, Math.max(0, Number(config?.crateDiscountPct) || 0));
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
        auditLog: Array.isArray(cfg.auditLog) ? cfg.auditLog : [],
      });
    },

    logAudit() {
      // Audit entries are persisted server-side alongside admin actions
    },

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
      const clamped = Math.min(50, Math.max(0, Math.round(Number(pct) || 0)));
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

    resetCratePricing() {
      return pushConfigPatch(
        { resetCratePricing: true },
        'Reset all crate discounts and custom prices'
      );
    },
  };
});
