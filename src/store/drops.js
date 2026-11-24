import { create } from 'zustand';
import { apiPost } from '../lib/api.js';

export const useDrops = create((set, get) => ({
  drops: [],

  syncServerDrops(serverDrops) {
    if (!Array.isArray(serverDrops)) return;
    set({ drops: serverDrops.slice(0, 24) });
  },

  pushDrop(drop) {
    const stamped = {
      ...drop,
      id: drop.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: drop.time || Date.now(),
    };
    set((state) => ({
      drops: [stamped, ...state.drops.filter((d) => d.id !== stamped.id)].slice(0, 24),
    }));

    if (drop.isUser && !drop._fromServer) {
      apiPost('/api/drops/push', stamped).then((res) => {
        if (res.ok && Array.isArray(res.drops)) {
          get().syncServerDrops(res.drops);
        }
      });
    }
  },
}));
