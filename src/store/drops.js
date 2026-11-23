import { create } from 'zustand';
import ps99 from '../data/ps99.json';
import { randomBotName } from '../lib/bots.js';
import { rand, randInt } from '../lib/rng.js';
import { apiPost } from '../lib/api.js';

function pickDropEntry() {
  const crates = ps99.crates || [];
  const allByTier = { normal: [], huge: [], titanic: [], gargantuan: [] };

  for (const crate of crates) {
    for (const item of crate.items || []) {
      const tier = item.tier || 'normal';
      allByTier[tier]?.push({
        ...item,
        crateId: crate.id,
        crateName: crate.name,
      });
    }
  }

  const r = rand();
  let chosenTier = 'huge';
  if (r < 0.3) chosenTier = 'normal';
  else if (r < 0.85) chosenTier = 'huge';
  else if (r < 0.97) chosenTier = 'titanic';
  else chosenTier = 'gargantuan';

  const pool =
    allByTier[chosenTier]?.length > 0
      ? allByTier[chosenTier]
      : allByTier.huge.length > 0
      ? allByTier.huge
      : allByTier.normal;

  const picked = pool[randInt(0, pool.length - 1)];
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user: randomBotName(),
    name: picked.name,
    thumb: picked.thumb,
    value: picked.value,
    tier: picked.tier || chosenTier,
    crateId: picked.crateId,
    crateName: picked.crateName,
    isUser: false,
    time: Date.now(),
  };
}

const initialDrops = Array.from({ length: 14 }, () => pickDropEntry());

export const useDrops = create((set, get) => ({
  drops: initialDrops,

  syncServerDrops(serverDrops) {
    if (!Array.isArray(serverDrops) || serverDrops.length === 0) return;
    set((state) => {
      const seen = new Set();
      const merged = [];
      for (const d of [...serverDrops, ...state.drops]) {
        if (!d?.id || seen.has(d.id)) continue;
        seen.add(d.id);
        merged.push(d);
      }
      return { drops: merged.slice(0, 24) };
    });
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

export function startFakeDrops(cb) {
  let timer = null;
  let stopped = false;

  const next = () => {
    if (stopped) return;
    const delay = 2200 + rand() * 2600;
    timer = setTimeout(() => {
      if (!stopped) {
        cb(pickDropEntry());
        next();
      }
    }, delay);
  };

  next();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
