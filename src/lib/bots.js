import { rand, randInt } from './rng.js';

const PRESET_NAMES = [
  'xX_PetLord_Xx',
  'HugeHunter2019',
  'DiamondDaddy',
  'TitanicChaser',
  'PrestonFan_99',
  'AxolotlKing',
  'BloxxLuck',
  'GemHoarderYT',
  'NeonDragon77',
  'RainbowCat_OP',
  'RobloxPro_404',
  'LuckyFloppa',
  'GargantuanEnjoyer',
  'CosmicEggSpin',
  'TradePlazaVIP',
  'DominusCollector',
  'PixelPetMaster',
  'NoobSlayer99',
  'ShinyHugePls',
  'DiamondRain_GG',
  'SuperCapybara',
  'EggHatchAddict',
  'ValkyrieFlex',
  'BoothSniper_X',
];

const PREFIXES = ['xX_', 'Pro', 'Huge', 'Cosmic', 'Neon', 'Lucky', 'Golden', 'Hyper', 'Dark', 'Ultra'];
const CORES = ['Pet', 'Gem', 'Axolotl', 'Dragon', 'Corgi', 'Floppa', 'Blox', 'Cat', 'Agony', 'Diamond'];
const SUFFIXES = ['_99', '2025', '_YT', '_Xx', '777', 'OP', '_VIP', '42', '_GG', ''];

export function randomBotName() {
  if (rand() < 0.65) {
    return PRESET_NAMES[randInt(0, PRESET_NAMES.length - 1)];
  }
  const p = PREFIXES[randInt(0, PREFIXES.length - 1)];
  const c = CORES[randInt(0, CORES.length - 1)];
  const s = SUFFIXES[randInt(0, SUFFIXES.length - 1)];
  return `${p}${c}${s}`;
}

const GAMES = [
  'Crash',
  'Mines',
  'Towers',
  'Plinko',
  'Dice',
  'Limbo',
  'Coinflip',
  'Roulette',
  'Blackjack',
  'Cases',
  'Battles',
];

export function generateBotBet() {
  const game = GAMES[randInt(0, GAMES.length - 1)];
  // Bias amounts between 100K and 500M
  const buckets = [100_000, 250_000, 500_000, 1_000_000, 5_000_000, 15_000_000, 50_000_000, 120_000_000, 250_000_000, 500_000_000];
  const base = buckets[randInt(0, buckets.length - 1)];
  const amount = Math.round(base * (0.8 + rand() * 0.4));

  const won = rand() < 0.46;
  let multiplier = 0;
  if (won) {
    const r = rand();
    if (r < 0.65) multiplier = Number((1.15 + rand() * 1.4).toFixed(2));
    else if (r < 0.9) multiplier = Number((2.5 + rand() * 5).toFixed(2));
    else multiplier = Number((8 + rand() * 35).toFixed(2));
  } else {
    multiplier = game === 'Plinko' && rand() < 0.5 ? Number((0.2 + rand() * 0.5).toFixed(2)) : 0;
  }

  const payout = Math.round(amount * multiplier);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user: randomBotName(),
    game,
    amount,
    multiplier,
    payout,
    isUser: false,
    time: Date.now(),
  };
}

export function startFakeFeed(cb) {
  let timer = null;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;
    const delay = 600 + rand() * 1400;
    timer = setTimeout(() => {
      if (!stopped) {
        cb(generateBotBet());
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export const FAKE_CHAT_MESSAGES = [
  'just pulled a huge 😭',
  'mines is rigged lol',
  'gg',
  'who wants to coinflip 50m',
  'CRASH WENT TO 42x RIGHT AFTER I CASHED AT 1.5x 💀',
  'cosmic egg actually paying today??',
  'need 10m for one more battle pls',
  'plinko 16 rows high risk is pure adrenaline',
  '250m on gold roulette letss gooo',
  'anyone else chasing a titanic?',
  'double down on 11 hit 21 ez clap',
  'towers expert mode took my whole bag 😭',
  'just hit 15x on limbo!!',
  'selling 3 huges to all-in crash',
  'rainbow gargantuan dream is real',
  'faucet saved me again fr',
  'join my 1v1 battle quick',
  'red red red red gold?!',
  'W site ngl animations are clean',
  'never clicking one more tile on mines again (clicking it)',
];

export function generateChatMessage() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    user: randomBotName(),
    level: randInt(1, 55),
    text: FAKE_CHAT_MESSAGES[randInt(0, FAKE_CHAT_MESSAGES.length - 1)],
    time: Date.now(),
  };
}
