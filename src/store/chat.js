import { create } from 'zustand';
import { apiPost } from '../lib/api.js';
import { generateChatMessage } from '../lib/bots.js';
import { useSiteConfig } from './siteConfig.js';

function mergeMessages(serverMsgs, botMsgs) {
  const byId = new Map();
  for (const m of botMsgs || []) {
    if (m?.id) byId.set(m.id, m);
  }
  for (const m of serverMsgs || []) {
    if (m?.id) byId.set(m.id, m);
  }
  return Array.from(byId.values())
    .sort((a, b) => (a.time || 0) - (b.time || 0))
    .slice(-50);
}

const initialBots = Array.from({ length: 8 }, () => generateChatMessage());

export const useChat = create((set, get) => ({
  serverMessages: [],
  botMessages: initialBots,
  messages: initialBots,

  syncServerChat(serverMsgs) {
    const clean = Array.isArray(serverMsgs) ? serverMsgs : [];
    set((state) => ({
      serverMessages: clean,
      messages: mergeMessages(clean, state.botMessages),
    }));
  },

  pushMessage(msg) {
    set((state) => {
      const botMessages = [...state.botMessages.slice(-39), msg];
      return {
        botMessages,
        messages: mergeMessages(state.serverMessages, botMessages),
      };
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

  async clearMessages() {
    const res = await apiPost('/api/admin/chat/clear', {});
    if (res.ok) {
      set({
        serverMessages: [],
        botMessages: [],
        messages: [],
      });
      if (res.siteConfig) useSiteConfig.getState().applyServerConfig(res.siteConfig);
    }
    return res;
  },
}));
