import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeEconomyFromRap, computeRapBenchmarks } from '../src/lib/rap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const API_BASE = 'https://ps99.biggamesapi.io';

function extractAssetId(str) {
  if (!str || typeof str !== 'string') return '';
  const match = str.match(/(\d+)/);
  return match ? match[1] : '';
}

function getTier(name) {
  if (name.startsWith('Gargantuan ')) return 'gargantuan';
  if (name.startsWith('Titanic ')) return 'titanic';
  if (name.startsWith('Huge ')) return 'huge';
  return 'normal';
}

function roundNice(n) {
  if (!Number.isFinite(n) || n <= 0) return 1000;
  const digits = Math.floor(Math.log10(n)) + 1;
  if (digits <= 3) return Math.round(n);
  const factor = Math.pow(10, digits - 3);
  return Math.round(n / factor) * factor;
}

const CRATE_DEFS = [
  {
    id: 'starter-paw',
    name: 'Starter Paw Crate',
    tag: 'STARTER',
    desc: 'Low-cost starter crate with a sneaky 0.5% Huge drop.',
    slots: [
      { min: 50_000, max: 250_000, count: 3, totalChance: 70, offset: 0 },
      { min: 400_000, max: 1_500_000, count: 2, totalChance: 28, offset: 0 },
      { min: 8_000_000, max: 14_000_000, count: 1, totalChance: 1.5, offset: 0 },
      { min: 20_000_000, max: 32_000_000, count: 1, totalChance: 0.5, offset: 0, tier: 'huge' },
    ],
  },
  {
    id: 'diamond-rush',
    name: 'Diamond Rush Crate',
    tag: 'POPULAR',
    desc: 'Balanced mid-tier PS99 pets with 1.5% Huge odds.',
    slots: [
      { min: 250_000, max: 900_000, count: 3, totalChance: 65, offset: 1 },
      { min: 2_000_000, max: 7_000_000, count: 2, totalChance: 30, offset: 0 },
      { min: 12_000_000, max: 20_000_000, count: 1, totalChance: 3.5, offset: 1 },
      { min: 25_000_000, max: 45_000_000, count: 1, totalChance: 1.5, offset: 1, tier: 'huge' },
    ],
  },
  {
    id: 'cyber-tech',
    name: 'Cyber Tech Crate',
    tag: 'TECH',
    desc: 'High-tech exclusives and a 6% shot at cyber Huges.',
    slots: [
      { min: 1_000_000, max: 3_000_000, count: 3, totalChance: 60, offset: 0 },
      { min: 7_000_000, max: 15_000_000, count: 2, totalChance: 34, offset: 0 },
      { min: 30_000_000, max: 65_000_000, count: 2, totalChance: 5, offset: 0, tier: 'huge' },
      { min: 120_000_000, max: 240_000_000, count: 1, totalChance: 1, offset: 0, tier: 'huge' },
    ],
  },
  {
    id: 'huge-10pct',
    name: '10% Huge Crate',
    tag: 'HIGH RISK',
    desc: 'High-voltage 10% combined Huge odds for bold openers.',
    slots: [
      { min: 150_000, max: 800_000, count: 3, totalChance: 90, offset: 2 },
      { min: 28_000_000, max: 60_000_000, count: 2, totalChance: 8.5, offset: 2, tier: 'huge' },
      { min: 110_000_000, max: 220_000_000, count: 1, totalChance: 1.5, offset: 1, tier: 'huge' },
    ],
  },
  {
    id: 'lava-inferno',
    name: 'Lava Inferno Crate',
    tag: 'HOT',
    desc: '30% Huge rate featuring molten high-value Huges.',
    slots: [
      { min: 7_000_000, max: 15_000_000, count: 3, totalChance: 70, offset: 1 },
      { min: 32_000_000, max: 75_000_000, count: 2, totalChance: 25, offset: 1, tier: 'huge' },
      { min: 140_000_000, max: 280_000_000, count: 1, totalChance: 4.5, offset: 2, tier: 'huge' },
      { min: 500_000_000, max: 900_000_000, count: 1, totalChance: 0.5, offset: 0, tier: 'huge' },
    ],
  },
  {
    id: 'huge-5050',
    name: '50/50 Huge Crate',
    tag: '50/50',
    desc: 'Pure coinflip tension — 50% chance to pull a Huge.',
    slots: [
      { min: 300_000, max: 900_000, count: 2, totalChance: 50, offset: 3 },
      { min: 45_000_000, max: 85_000_000, count: 2, totalChance: 42, offset: 0, tier: 'huge' },
      { min: 110_000_000, max: 200_000_000, count: 1, totalChance: 8, offset: 3, tier: 'huge' },
    ],
  },
  {
    id: 'huge-hunter',
    name: 'Huge Hunter Crate',
    tag: '100% HUGE',
    desc: 'Guaranteed Huge pet every spin plus a Titanic chase.',
    slots: [
      { min: 25_000_000, max: 55_000_000, count: 3, totalChance: 70, offset: 2, tier: 'huge' },
      { min: 70_000_000, max: 150_000_000, count: 2, totalChance: 24, offset: 0, tier: 'huge' },
      { min: 220_000_000, max: 450_000_000, count: 2, totalChance: 5.75, offset: 0, tier: 'huge' },
      { min: 5_000_000_000, max: 9_000_000_000, count: 1, totalChance: 0.25, offset: 0, tier: 'titanic' },
    ],
  },
  {
    id: 'cosmic-galaxy',
    name: 'Cosmic Galaxy Crate',
    tag: 'MYTHIC',
    desc: 'Rare cosmic Huges with 1.5% Titanic drop chance.',
    slots: [
      { min: 45_000_000, max: 110_000_000, count: 3, totalChance: 65, offset: 1, tier: 'huge' },
      { min: 160_000_000, max: 350_000_000, count: 2, totalChance: 28, offset: 1, tier: 'huge' },
      { min: 500_000_000, max: 1_000_000_000, count: 1, totalChance: 5.5, offset: 1, tier: 'huge' },
      { min: 6_000_000_000, max: 14_000_000_000, count: 1, totalChance: 1.5, offset: 1, tier: 'titanic' },
    ],
  },
  {
    id: 'titanic-vault',
    name: 'Titanic Vault Crate',
    tag: 'WHALE',
    desc: 'High-roller vault stacked with Titanics & a Gargantuan.',
    slots: [
      { min: 120_000_000, max: 350_000_000, count: 3, totalChance: 60, offset: 2, tier: 'huge' },
      { min: 500_000_000, max: 1_500_000_000, count: 2, totalChance: 32, offset: 0, tier: 'huge' },
      { min: 6_000_000_000, max: 18_000_000_000, count: 2, totalChance: 7.8, offset: 2, tier: 'titanic' },
      { min: 100_000_000_000, max: 200_000_000_000, count: 1, totalChance: 0.2, offset: 0, tier: 'gargantuan' },
    ],
  },
  {
    id: 'gargantuan-god',
    name: 'Gargantuan God Crate',
    tag: 'GOD TIER',
    desc: 'Ultimate PS99 crate packed with Titanics & Gargantuans.',
    slots: [
      { min: 400_000_000, max: 1_500_000_000, count: 3, totalChance: 55, offset: 1, tier: 'huge' },
      { min: 1_500_000_000, max: 4_000_000_000, count: 2, totalChance: 33, offset: 0, tier: 'huge' },
      { min: 10_000_000_000, max: 28_000_000_000, count: 2, totalChance: 10.5, offset: 0, tier: 'titanic' },
      { min: 100_000_000_000, max: 450_000_000_000, count: 2, totalChance: 1.5, offset: 1, tier: 'gargantuan' },
    ],
  },
];

function pickBand(pool, { min, max, count, offset = 0, tier = null }, usedNames) {
  let candidates = pool.filter(
    (p) =>
      !usedNames.has(p.name) &&
      (!tier || p.tier === tier) &&
      p.value >= min &&
      p.value <= max
  );

  if (candidates.length < count) {
    const mid = (min + max) / 2;
    candidates = pool
      .filter((p) => !usedNames.has(p.name) && (!tier || p.tier === tier))
      .sort((a, b) => Math.abs(a.value - mid) - Math.abs(b.value - mid))
      .slice(0, Math.max(count * 3, 10))
      .sort((a, b) => a.value - b.value);
  }

  const picked = [];
  if (candidates.length <= count) {
    picked.push(...candidates);
  } else {
    const shift = offset % candidates.length;
    const rotated = [...candidates.slice(shift), ...candidates.slice(0, shift)];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i * rotated.length) / count);
      picked.push(rotated[idx]);
    }
  }

  for (const p of picked) usedNames.add(p.name);
  return picked;
}

async function fetchJson(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function downloadImage(assetId, outPath) {
  const url = `${API_BASE}/image/${assetId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image ${url}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buf);
}

async function main() {
  console.log('Fetching PS99 collections and RAP...');
  const [petsRes, eggsRes, currencyRes, rapRes] = await Promise.all([
    fetchJson('/api/collection/Pets'),
    fetchJson('/api/collection/Eggs'),
    fetchJson('/api/collection/Currency'),
    fetchJson('/api/rap'),
  ]);

  const petsData = petsRes.data || [];
  const eggsData = eggsRes.data || [];
  const currencyData = currencyRes.data || [];
  const rapData = rapRes.data || [];

  // 1. Build rapMap for normal (non-golden/rainbow/shiny) pets
  const rapMap = new Map();
  const rapMapLower = new Map();
  for (const entry of rapData) {
    if (entry?.category !== 'Pet') continue;
    const cfg = entry.configData || {};
    if (cfg.pt || cfg.sh) continue;
    if (typeof entry.value !== 'number' || entry.value <= 0) continue;
    if (cfg.id) {
      rapMap.set(cfg.id, entry.value);
      rapMapLower.set(cfg.id.toLowerCase(), entry.value);
    }
  }

  // 2. Build clean pool of real PS99 pets that have both thumbnail and live RAP
  const petPool = [];
  const seenNames = new Set();
  for (const entry of petsData) {
    const name = entry?.configData?.name || entry.configName;
    if (!name || seenNames.has(name)) continue;
    const thumb = extractAssetId(entry?.configData?.thumbnail);
    if (!thumb) continue;
    const rap =
      rapMap.get(name) ??
      rapMapLower.get(name.toLowerCase()) ??
      rapMap.get(entry.configName);
    if (!rap || rap <= 0) continue;
    seenNames.add(name);
    petPool.push({
      name,
      thumb,
      value: Math.round(rap),
      tier: getTier(name),
    });
  }
  petPool.sort((a, b) => a.value - b.value);

  // 3. Currency icons
  const diamondsEntry = currencyData.find(
    (c) => c.configName === 'Currency | Diamonds' || c?.configData?.DisplayName === 'Diamonds'
  );
  const diamondIcon =
    extractAssetId(diamondsEntry?.configData?.Tiers?.[0]?.tinyImage) || '15258327857';
  const diamondBag =
    extractAssetId(diamondsEntry?.configData?.BagTiers?.[2]?.image) || '15058306840';

  // 4. Exclusive normal names for RAP benchmark consistency
  const exclusiveEggs = eggsData.filter((e) => e.category === 'Exclusive Eggs');
  const exclNormalNames = new Set();
  for (const egg of exclusiveEggs) {
    for (const pair of egg?.configData?.pets || []) {
      const petName = pair?.[0];
      if (typeof petName === 'string' && getTier(petName) === 'normal') {
        exclNormalNames.add(petName);
      }
    }
  }
  const rapBenchmarks = computeRapBenchmarks(rapData, exclNormalNames);

  // 5. Build 10 Custom PS99 Crates with exact 5% House Edge
  const crates = [];
  for (const def of CRATE_DEFS) {
    const usedNames = new Set();
    const rawItems = [];

    for (const slot of def.slots) {
      const picked = pickBand(petPool, slot, usedNames);
      if (picked.length === 0) continue;
      const perItemChance = slot.totalChance / picked.length;
      for (const pet of picked) {
        rawItems.push({
          ...pet,
          rawChance: perItemChance,
        });
      }
    }

    const totalChance = rawItems.reduce((acc, it) => acc + it.rawChance, 0);
    const items = rawItems
      .map((it) => ({
        name: it.name,
        chance: Number(((it.rawChance / totalChance) * 100).toFixed(4)),
        thumb: it.thumb,
        value: it.value,
        tier: it.tier,
      }))
      .sort((a, b) => b.value - a.value);

    const ev = items.reduce((acc, it) => acc + (it.chance / 100) * it.value, 0);
    const price = roundNice(ev / 0.95); // exact 5% house edge

    crates.push({
      id: def.id,
      name: def.name,
      icon: `/crates/${def.id}.png`,
      tag: def.tag,
      desc: def.desc,
      houseEdge: 5,
      price,
      items,
    });
  }

  crates.sort((a, b) => a.price - b.price);

  // 6. Showcase: top 40 Huge/Titanic/Gargantuan pets by RAP with thumbnails
  const showcase = petPool
    .filter((p) => ['huge', 'titanic', 'gargantuan'].includes(p.tier))
    .sort((a, b) => b.value - a.value)
    .slice(0, 40);

  // 7. Daily Bonus Pets (Day 7 small real-RAP pets: 1.5%..6% of cheapestHuge)
  const minBonusRap = rapBenchmarks.cheapestHuge * 0.015;
  const maxBonusRap = rapBenchmarks.cheapestHuge * 0.06;
  const bonusCandidates = petPool.filter(
    (p) => p.value >= minBonusRap && p.value <= maxBonusRap
  );
  const dailyBonusPets = [];
  if (bonusCandidates.length <= 15) {
    dailyBonusPets.push(...bonusCandidates);
  } else {
    for (let i = 0; i < 15; i++) {
      const idx = Math.floor((i * bonusCandidates.length) / 15);
      dailyBonusPets.push(bonusCandidates[idx]);
    }
  }

  // 8. Calibrate small daily rewards, faucet, and level rewards from live RAP
  const economy = computeEconomyFromRap(rapData, crates[0]?.price || 0, exclNormalNames);

  // 9. Write JSON & download local icons
  const payload = {
    generatedAt: new Date().toISOString(),
    diamondIcon,
    diamondBag,
    crates,
    showcase,
    dailyBonusPets,
    economy,
  };

  const outJsonPath = path.join(ROOT, 'src', 'data', 'ps99.json');
  await fs.mkdir(path.dirname(outJsonPath), { recursive: true });
  await fs.writeFile(outJsonPath, JSON.stringify(payload, null, 2), 'utf-8');

  await Promise.all([
    downloadImage(diamondIcon, path.join(ROOT, 'public', 'diamond.png')),
    downloadImage(diamondBag, path.join(ROOT, 'public', 'diamond-bag.png')),
    downloadImage('15107493549', path.join(ROOT, 'public', 'tnt.png')),
  ]);

  console.log(`Real PS99 pets with RAP + thumb: ${petPool.length}`);
  console.log(`Custom crates built: ${crates.length}`);
  for (const c of crates) {
    const ev = c.items.reduce((s, i) => s + (i.chance / 100) * i.value, 0);
    const edgePct = ((1 - ev / c.price) * 100).toFixed(2);
    console.log(
      `  - ${c.name} [${c.tag}]: price=${c.price}, items=${c.items.length}, EV=${Math.round(ev)}, edge=${edgePct}%`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
