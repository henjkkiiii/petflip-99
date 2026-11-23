export function percentile(sortedArr, p) {
  if (!sortedArr || sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(sortedArr.length * p)));
  return sortedArr[idx];
}

export function median(sortedArr) {
  return percentile(sortedArr, 0.5);
}

export function roundNice2(n) {
  if (!Number.isFinite(n) || n <= 0) return 1000;
  const clamped = Math.max(1000, n);
  const digits = Math.floor(Math.log10(clamped)) + 1;
  if (digits <= 2) return Math.round(clamped);
  const factor = Math.pow(10, digits - 2);
  return Math.max(1000, Math.round(clamped / factor) * factor);
}

export function computeRapBenchmarks(rapEntries, exclusivePetNamesSet = null) {
  const hugeVals = [];
  const titanicVals = [];
  const gargantuanVals = [];
  const lootboxVals = [];
  const exclNormalVals = [];
  const fallbackNormalVals = [];

  for (const entry of rapEntries || []) {
    const cfg = entry?.configData || {};
    if (cfg.pt || cfg.sh) continue;
    const val = entry?.value;
    if (typeof val !== 'number' || val <= 0) continue;

    if (entry.category === 'Lootbox') {
      lootboxVals.push(val);
      continue;
    }

    if (entry.category !== 'Pet' || typeof cfg.id !== 'string') continue;
    const id = cfg.id;

    if (id.startsWith('Gargantuan ')) {
      gargantuanVals.push(val);
    } else if (id.startsWith('Titanic ')) {
      titanicVals.push(val);
    } else if (id.startsWith('Huge ')) {
      hugeVals.push(val);
    } else {
      if (exclusivePetNamesSet && exclusivePetNamesSet.has(id)) {
        exclNormalVals.push(val);
      } else if (val >= 1_000_000) {
        fallbackNormalVals.push(val);
      }
    }
  }

  hugeVals.sort((a, b) => a - b);
  titanicVals.sort((a, b) => a - b);
  gargantuanVals.sort((a, b) => a - b);
  lootboxVals.sort((a, b) => a - b);
  exclNormalVals.sort((a, b) => a - b);
  fallbackNormalVals.sort((a, b) => a - b);

  const cheapestHuge = Math.round(percentile(hugeVals, 0.1) || 25_000_000);
  const medianHuge = Math.round(median(hugeVals) || 58_000_000);
  const medianTitanic = Math.round(median(titanicVals) || 15_000_000_000);
  const medianGargantuan = Math.round(median(gargantuanVals) || 150_000_000_000);
  const medianExclusivePet = Math.round(
    median(exclNormalVals.length > 0 ? exclNormalVals : fallbackNormalVals) || 15_000_000
  );
  const medianLootbox = Math.round(median(lootboxVals) || 700_000);

  return {
    cheapestHuge,
    medianHuge,
    medianTitanic,
    medianGargantuan,
    medianExclusivePet,
    medianLootbox,
  };
}

export function computeEconomyFromRap(
  rapEntries,
  cheapestEggPrice = 0,
  exclusivePetNamesSet = null
) {
  const benchmarks = computeRapBenchmarks(rapEntries, exclusivePetNamesSet);
  const { cheapestHuge, medianHuge, medianExclusivePet, medianLootbox } = benchmarks;

  const dailyRewards = [
    { day: 1, gems: roundNice2(cheapestHuge * 0.004), bonusPet: false },
    { day: 2, gems: roundNice2(cheapestHuge * 0.006), bonusPet: false },
    { day: 3, gems: roundNice2(cheapestHuge * 0.01), bonusPet: false },
    { day: 4, gems: roundNice2(cheapestHuge * 0.014), bonusPet: false },
    { day: 5, gems: roundNice2(cheapestHuge * 0.02), bonusPet: false },
    { day: 6, gems: roundNice2(cheapestHuge * 0.03), bonusPet: false },
    { day: 7, gems: roundNice2(cheapestHuge * 0.05), bonusPet: true },
  ];

  const faucet = {
    amount: roundNice2(cheapestHuge * 0.002),
    threshold: roundNice2(cheapestHuge * 0.001),
  };

  const levelRewards = [
    { level: 2, title: 'Rookie Hatcher', reward: roundNice2(cheapestHuge * 0.004) },
    { level: 5, title: 'Gem Collector', reward: roundNice2(cheapestHuge * 0.01) },
    { level: 10, title: 'Huge Hunter', reward: roundNice2(cheapestHuge * 0.024) },
    { level: 20, title: 'Titanic Roller', reward: roundNice2(cheapestHuge * 0.06) },
    { level: 35, title: 'Gargantuan Legend', reward: roundNice2(cheapestHuge * 0.14) },
  ];

  return {
    rapBenchmarks: {
      cheapestHuge,
      medianHuge,
      medianExclusivePet,
      medianLootbox,
      cheapestEgg: cheapestEggPrice,
      updatedAt: new Date().toISOString(),
    },
    dailyRewards,
    faucet,
    levelRewards,
  };
}

export async function fetchLiveEconomy(
  fallbackEconomy,
  cheapestEggPrice = 0,
  exclusivePetNamesSet = null
) {
  const res = await fetch('https://ps99.biggamesapi.io/api/rap');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!Array.isArray(json?.data)) {
    throw new Error('Unexpected RAP response');
  }
  return computeEconomyFromRap(json.data, cheapestEggPrice, exclusivePetNamesSet);
}
