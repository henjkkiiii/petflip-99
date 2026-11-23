import { create } from 'zustand';
import { generateBotBet } from '../lib/bots.js';

const initialFeed = Array.from({ length: 12 }, () => generateBotBet());

export const useFeed = create((set) => ({
  items: initialFeed,
  push(entry) {
    set((state) => ({
      items: [entry, ...state.items].slice(0, 30),
    }));
  },
}));
