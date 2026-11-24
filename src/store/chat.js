import { create } from 'zustand';
import { apiPost } from '../lib/api.js';
import { useSiteConfig } from './siteConfig.js';

export const useChat = create((set, get) => ({
  serverMessages: [],
  messages: [],

  syncServerChat(serverMsgs) {
    const clean = Array.isArray(serverMsgs) ? serverMsgs.slice(-50) : [];
    set({
      serverMessages: clean,
      messages: clean,
    });
  },

  async sendUserMessage(text) {
    const res = await apiPost('/api/chat/send', { text });
    if (res.ok && Array.isArray(res.chat)) {
      get().syncServerChat(res.chat);
    }
    return res;
  },

  async pushAdminBroadcast(text) {
    const res = await apiPost('/api/admin/chat/broadcast', { text });
    if (res.ok) {
      if (Array.isArray(res.chat)) get().syncServerChat(res.chat);
      if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
    }
    return res;
  },

  async sendAdminBroadcast(text) {
    return get().pushAdminBroadcast(text);
  },

  async clearMessages() {
    const res = await apiPost('/api/admin/chat/clear', {});
    if (res.ok) {
      set({
        serverMessages: [],
        messages: [],
      });
      if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
    }
    return res;
  },
}));
