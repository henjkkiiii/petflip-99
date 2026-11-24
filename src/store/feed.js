import { create } from 'zustand';

export const useFeed = create((set) => ({
  items: [],
  push(entry) {
    set((state) => ({
      items: [entry, ...state.items].slice(0, 30),
    }));
  },
}));
