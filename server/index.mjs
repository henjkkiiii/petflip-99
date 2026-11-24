import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db.json');

const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY_BYTES = 512 * 1024;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SEC = Math.floor(SESSION_TTL_MS / 1000);
const SESSION_COOKIE = 'pf99_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'petflip99-hmac-session-secret-v1';
const BOT_API_KEY = process.env.BOT_API_KEY || 'pf99-trade-bot-key-2026';
const RECOVERY_KEY = crypto.createHash('sha256').update(`${SESSION_SECRET}:recovery-v1`).digest();
const INITIAL_ADMIN_BALANCE = 100_000_000;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const PROMO_RE = /^[A-Z0-9_-]{3,24}$/;
const PS99_DATA_PATH = path.join(ROOT_DIR, 'src', 'data', 'ps99.json');
const PS99_CRATES = JSON.parse(fs.readFileSync(PS99_DATA_PATH, 'utf8')).crates || [];
const CRATES_BY_ID = new Map(PS99_CRATES.map((c) => [c.id, c]));
const BATTLE_BOT_NAMES = [
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
  'LuckyFloppa',
  'GargantuanEnjoyer',
  'CosmicEggSpin',
  'TradePlazaVIP',
  'DominusCollector',
  'PixelPetMaster',
];

function formatGemsServer(n) {
  const abs = Math.abs(Number(n) || 0);
  for (const [v, s] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (abs >= v) {
      return `${(abs / v).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}${s}`;
    }
  }
  return Math.round(abs).toLocaleString('en-US');
}

function getEffectiveCratePriceServer(crate, config) {
  if (!crate) return 0;
  const override = config?.cratePriceOverrides?.[crate.id];
  const base = Number.isFinite(override) && override > 0 ? override : crate.price;
  const discountPct = Math.min(80, Math.max(0, Number(config?.crateDiscountPct) || 0));
  return Math.max(1_000, Math.round(base * (1 - discountPct / 100)));
}

function weightedPickServer(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  let total = 0;
  for (const it of items) {
    total += Math.max(0, Number(it.chance) || 0);
  }
  const u = crypto.randomBytes(4).readUInt32BE(0) / 0x100000000;
  let r = u * total;
  let chosen = items[items.length - 1];
  for (const it of items) {
    r -= Math.max(0, Number(it.chance) || 0);
    if (r <= 0) {
      chosen = it;
      break;
    }
  }
  return {
    name: chosen.name,
    thumb: chosen.thumb,
    value: chosen.value,
    tier: chosen.tier,
  };
}

function pickBotName(existingNamesSet) {
  const pool = BATTLE_BOT_NAMES.filter((n) => !existingNamesSet.has(n));
  const src = pool.length > 0 ? pool : BATTLE_BOT_NAMES;
  return src[crypto.randomInt(0, src.length)];
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const ALL_GAME_IDS = [
  'cases',
  'battles',
  'crash',
  'mines',
  'towers',
  'plinko',
  'dice',
  'limbo',
  'coinflip',
  'roulette',
  'blackjack',
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_SITE_CONFIG = {
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
  crateDisabledIds: [],
  branding: {
    siteName: 'PETFLIP',
    siteSuffix: '99',
    heroTitle: 'Unbox Huge & Titanic Pets.',
    heroSubtitle: 'Open custom PS99 crates, battle live in PvP Case Battles, and play 11 gem arcade games.',
    footerText: 'Fan-made demo. Play-money gems only – no real value, no real deposits. Not affiliated with BIG Games or Roblox.',
    currencyName: 'Gems',
  },
  theme: {
    preset: 'cyber',
    primary: '#4f6bff',
    gem: '#38d9ff',
    gold: '#ffc531',
    bg: '#0b0d14',
    panel: '#12151f',
  },
  games: {
    enabled: Object.fromEntries(ALL_GAME_IDS.map((id) => [id, true])),
    minBet: 1_000,
    maxBet: 0,
    xpMultiplier: 1,
    dailyMultiplier: 1,
  },
  ui: {
    showLiveTicker: true,
    showPromoSidebar: true,
    showFairnessLink: true,
  },
  botSettings: {
    robloxUsername: '',
    privateServerUrl: '',
  },
  auditLog: [],
};

function createDefaultAccountData(startingBalance = 500_000) {
  return {
    balance: Math.max(0, Math.round(Number(startingBalance) || 0)),
    inventory: [],
    history: [],
    stats: {
      wagered: 0,
      profit: 0,
      bets: 0,
      wins: 0,
      biggestWin: 0,
    },
    xp: 0,
    lastDaily: 0,
    dailyStreak: 0,
    claimedRewards: [],
  };
}

function hashPasswordScrypt(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString('hex');
}

function verifyPasswordScrypt(password, salt, storedHex) {
  try {
    const computed = crypto.scryptSync(String(password), String(salt), 32);
    const stored = Buffer.from(String(storedHex || ''), 'hex');
    if (computed.length !== stored.length) return false;
    return crypto.timingSafeEqual(computed, stored);
  } catch {
    return false;
  }
}

function normalizeKey(username) {
  return String(username || '').trim().toLowerCase();
}

function countAdmins(accounts) {
  return Object.values(accounts || {}).filter((a) => a?.role === 'admin').length;
}

function sanitizeAccount(acc) {
  if (!acc) return null;
  const { passwordHash: _ph, salt: _s, ...pub } = acc;
  return {
    ...pub,
    adminRevision: pub.adminRevision || 1,
    data: pub.data || createDefaultAccountData(0),
  };
}

function sanitizeAccountsMap(accounts) {
  const out = {};
  for (const [k, acc] of Object.entries(accounts || {})) {
    out[k] = sanitizeAccount(acc);
  }
  return out;
}

function sanitizeBranding(b) {
  const src = b && typeof b === 'object' ? b : {};
  return {
    siteName: String(src.siteName || DEFAULT_SITE_CONFIG.branding.siteName).trim().slice(0, 28) || 'PETFLIP',
    siteSuffix: String(src.siteSuffix ?? DEFAULT_SITE_CONFIG.branding.siteSuffix).trim().slice(0, 10),
    heroTitle: String(src.heroTitle || DEFAULT_SITE_CONFIG.branding.heroTitle).trim().slice(0, 90),
    heroSubtitle: String(src.heroSubtitle || DEFAULT_SITE_CONFIG.branding.heroSubtitle).trim().slice(0, 200),
    footerText: String(src.footerText || DEFAULT_SITE_CONFIG.branding.footerText).trim().slice(0, 260),
    currencyName: String(src.currencyName || DEFAULT_SITE_CONFIG.branding.currencyName).trim().slice(0, 20) || 'Gems',
  };
}

function sanitizeTheme(t) {
  const src = t && typeof t === 'object' ? t : {};
  const pickHex = (val, fallback) => (HEX_COLOR_RE.test(String(val || '').trim()) ? String(val).trim() : fallback);
  return {
    preset: String(src.preset || 'cyber').slice(0, 24),
    primary: pickHex(src.primary, DEFAULT_SITE_CONFIG.theme.primary),
    gem: pickHex(src.gem, DEFAULT_SITE_CONFIG.theme.gem),
    gold: pickHex(src.gold, DEFAULT_SITE_CONFIG.theme.gold),
    bg: pickHex(src.bg, DEFAULT_SITE_CONFIG.theme.bg),
    panel: pickHex(src.panel, DEFAULT_SITE_CONFIG.theme.panel),
  };
}

function sanitizeGamesConfig(g) {
  const src = g && typeof g === 'object' ? g : {};
  const enabledIn = src.enabled && typeof src.enabled === 'object' ? src.enabled : {};
  const enabled = {};
  for (const id of ALL_GAME_IDS) {
    enabled[id] = enabledIn[id] === undefined ? true : Boolean(enabledIn[id]);
  }
  return {
    enabled,
    minBet: Math.max(1, Math.min(1e12, Math.round(Number(src.minBet ?? DEFAULT_SITE_CONFIG.games.minBet) || 1_000))),
    maxBet: Math.max(0, Math.min(1e13, Math.round(Number(src.maxBet ?? 0) || 0))),
    xpMultiplier: Math.max(0.25, Math.min(20, Number(src.xpMultiplier ?? 1) || 1)),
    dailyMultiplier: Math.max(0.25, Math.min(20, Number(src.dailyMultiplier ?? 1) || 1)),
  };
}

function sanitizeUiConfig(u) {
  const src = u && typeof u === 'object' ? u : {};
  return {
    showLiveTicker: src.showLiveTicker === undefined ? true : Boolean(src.showLiveTicker),
    showPromoSidebar: src.showPromoSidebar === undefined ? true : Boolean(src.showPromoSidebar),
    showFairnessLink: src.showFairnessLink === undefined ? true : Boolean(src.showFairnessLink),
  };
}

function sanitizeBotSettings(b) {
  const src = b && typeof b === 'object' ? b : {};
  const rawUrl = String(src.privateServerUrl || '').trim().slice(0, 240);
  return {
    robloxUsername: String(src.robloxUsername || '').trim().slice(0, 32),
    privateServerUrl: rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : '',
  };
}

function sanitizeSiteConfig(cfg, isAdmin) {
  const merged = {
    ...DEFAULT_SITE_CONFIG,
    ...(cfg || {}),
    banner: {
      text: String(cfg?.banner?.text || ''),
      tone: ['info', 'gold', 'danger'].includes(cfg?.banner?.tone) ? cfg.banner.tone : 'info',
    },
    cratePriceOverrides: { ...(cfg?.cratePriceOverrides || {}) },
    crateDisabledIds: Array.isArray(cfg?.crateDisabledIds)
      ? Array.from(new Set(cfg.crateDisabledIds.map((x) => String(x))))
      : [],
    branding: sanitizeBranding(cfg?.branding),
    theme: sanitizeTheme(cfg?.theme),
    games: sanitizeGamesConfig(cfg?.games),
    ui: sanitizeUiConfig(cfg?.ui),
    botSettings: sanitizeBotSettings(cfg?.botSettings),
  };
  merged.auditLog = isAdmin && Array.isArray(cfg?.auditLog) ? cfg.auditLog.slice(0, 150) : [];
  return merged;
}

function loadOrCreateDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  let db = null;
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
      db = null;
    }
  }
  if (!db || typeof db !== 'object') {
    db = {};
  }
  if (!db.accounts || typeof db.accounts !== 'object') db.accounts = {};
  if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {};
  if (!db.revokedTokens || typeof db.revokedTokens !== 'object') db.revokedTokens = {};
  if (!db.promoCodes || typeof db.promoCodes !== 'object') db.promoCodes = {};
  if (!Array.isArray(db.battles)) db.battles = [];
  if (!Array.isArray(db.coinflips)) db.coinflips = [];
  if (!Array.isArray(db.tradeQueue)) db.tradeQueue = [];
  if (!db.processedBotTx || typeof db.processedBotTx !== 'object') db.processedBotTx = {};
  if (!db.restoredUsers || typeof db.restoredUsers !== 'object') db.restoredUsers = {};
  if (!db.preservedProfiles || typeof db.preservedProfiles !== 'object') db.preservedProfiles = {};
  if (!Array.isArray(db.chat)) db.chat = [];
  if (!Array.isArray(db.drops)) db.drops = [];
  db.siteConfig = sanitizeSiteConfig(db.siteConfig, true);

  if (countAdmins(db.accounts) === 0) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPasswordScrypt('admin123', salt);
    db.accounts.admin = {
      username: 'admin',
      passwordHash,
      salt,
      role: 'admin',
      banned: false,
      banReason: '',
      adminRevision: 1,
      createdAt: Date.now(),
      lastLoginAt: 0,
      data: createDefaultAccountData(INITIAL_ADMIN_BALANCE),
    };
  }

  return db;
}

const db = loadOrCreateDb();
const activeClients = new Map();

function saveDb() {
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

saveDb();

function logAudit(adminUser, action) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: Date.now(),
    admin: adminUser || 'admin',
    action,
  };
  db.siteConfig.auditLog = [entry, ...(db.siteConfig.auditLog || [])].slice(0, 100);
}

function bumpAdminRevision(acc, reason = 'admin') {
  acc.adminRevision = (Number(acc.adminRevision) || 1) + 1;
  acc.lastRevReason = reason;
}

function signTokenPayload(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function verifySignedToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  const [userKey, verStr, expStr, sigHex] = parts;
  const payload = `${userKey}.${verStr}.${expStr}`;
  const expectedHex = signTokenPayload(payload);
  try {
    const sigBuf = Buffer.from(sigHex, 'hex');
    const expBuf = Buffer.from(expectedHex, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }
  const exp = Number(expStr);
  const tokenVersion = Number(verStr);
  if (!userKey || !Number.isFinite(exp) || Date.now() > exp || !Number.isFinite(tokenVersion)) {
    return null;
  }
  return { userKey, tokenVersion, exp };
}

function createSession(userKey) {
  const ver = Number(db.accounts[userKey]?.tokenVersion) || 1;
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${userKey}.${ver}.${exp}`;
  const sigHex = signTokenPayload(payload);
  // Prune expired revocations & legacy sessions
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [tok, ts] of Object.entries(db.revokedTokens || {})) {
    if (!ts || ts < cutoff) delete db.revokedTokens[tok];
  }
  for (const [tok, sess] of Object.entries(db.sessions || {})) {
    if (!sess || (sess.createdAt || 0) < cutoff) {
      delete db.sessions[tok];
    }
  }
  return `${payload}.${sigHex}`;
}

function purgeUserSessions(userKey) {
  if (db.accounts[userKey]) {
    db.accounts[userKey].tokenVersion = (Number(db.accounts[userKey].tokenVersion) || 1) + 1;
  }
  for (const [tok, sess] of Object.entries(db.sessions || {})) {
    if (sess?.userKey === userKey) {
      delete db.sessions[tok];
    }
  }
}

function isSecureRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https' || Boolean(req.socket?.encrypted);
}

function buildSessionCookie(req, token, maxAgeSeconds) {
  const safeAge = Math.max(0, Math.round(Number(maxAgeSeconds) || 0));
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token || '')}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${safeAge}`,
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function getCookieValue(req, name) {
  const raw = String(req.headers.cookie || '');
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const val = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(val);
    } catch {
      return val;
    }
  }
  return '';
}

function getCandidateTokens(req) {
  const candidates = [];
  const seen = new Set();
  const add = (raw) => {
    const tok = String(raw || '').trim();
    if (tok && !seen.has(tok)) {
      seen.add(tok);
      candidates.push(tok);
    }
  };
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    add(authHeader.slice(7));
  }
  add(req.headers['x-session-token']);
  add(getCookieValue(req, SESSION_COOKIE));
  return candidates;
}

function resolveToken(token) {
  if (!token) return null;
  if (db.revokedTokens?.[token]) return null;

  const signed = verifySignedToken(token);
  if (signed) {
    const acc = db.accounts[signed.userKey];
    if (!acc || acc.banned) return null;
    if ((Number(acc.tokenVersion) || 1) !== signed.tokenVersion) return null;
    return { token, userKey: signed.userKey, account: acc };
  }

  const sess = db.sessions?.[token];
  if (!sess) return null;
  if (Date.now() - (sess.createdAt || 0) > SESSION_TTL_MS) {
    delete db.sessions[token];
    return null;
  }
  const acc = db.accounts[sess.userKey];
  if (!acc || acc.banned) {
    delete db.sessions[token];
    return null;
  }
  return { token, userKey: sess.userKey, account: acc };
}

function getSessionAccount(req) {
  for (const token of getCandidateTokens(req)) {
    const resolved = resolveToken(token);
    if (resolved) return resolved;
  }
  return null;
}

function getLevelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 50)) + 1;
}

function sanitizeSyncData(raw, fallback) {
  const base = createDefaultAccountData(0);
  const src = raw && typeof raw === 'object' ? raw : {};
  const fb = fallback && typeof fallback === 'object' ? fallback : base;
  const stats = src.stats && typeof src.stats === 'object' ? src.stats : fb.stats || base.stats;

  return {
    balance: Number.isFinite(Number(src.balance))
      ? Math.max(0, Math.min(1e15, Math.round(Number(src.balance))))
      : fb.balance || 0,
    inventory: Array.isArray(src.inventory) ? src.inventory.slice(0, 500) : [],
    history: Array.isArray(src.history) ? src.history.slice(0, 200) : [],
    stats: {
      wagered: Math.max(0, Math.round(Number(stats.wagered) || 0)),
      profit: Number.isFinite(Number(stats.profit)) ? Math.round(Number(stats.profit)) : 0,
      bets: Math.max(0, Math.round(Number(stats.bets) || 0)),
      wins: Math.max(0, Math.round(Number(stats.wins) || 0)),
      biggestWin: Math.max(0, Math.round(Number(stats.biggestWin) || 0)),
    },
    xp: Number.isFinite(Number(src.xp)) ? Math.max(0, Number(src.xp)) : 0,
    lastDaily: Number.isFinite(Number(src.lastDaily)) ? Math.max(0, Number(src.lastDaily)) : 0,
    dailyStreak: Number.isFinite(Number(src.dailyStreak))
      ? Math.max(0, Math.round(Number(src.dailyStreak)))
      : 0,
    claimedRewards: Array.isArray(src.claimedRewards) ? src.claimedRewards.slice(0, 50) : [],
  };
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const json = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(json);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function listPromoCodes() {
  return Object.values(db.promoCodes || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function buildPromoBroadcastText(promo) {
  const extras = [];
  if ((promo.minLevel || 1) > 1) extras.push(`Lvl ${promo.minLevel}+`);
  if ((promo.minWagered || 0) > 0) extras.push(`${formatGemsServer(promo.minWagered)}+ wagered`);
  if ((promo.maxUses || 0) > 0) extras.push(`${promo.maxUses - (promo.uses || 0)} uses left`);
  const reqStr = extras.length > 0 ? ` (${extras.join(' · ')})` : '';
  return `PROMO CODE "${promo.code}" for +${formatGemsServer(promo.gems)} Gems${reqStr} — Redeem in Rewards!`;
}

function findValidSignedToken(req) {
  for (const token of getCandidateTokens(req)) {
    if (db.revokedTokens?.[token]) continue;
    const signed = verifySignedToken(token);
    if (signed) {
      return { token, ...signed };
    }
  }
  return null;
}

function isFreshSeededAdmin() {
  const adm = db.accounts?.admin;
  if (!adm || db.restoredUsers?.admin) return false;
  return (
    (adm.lastLoginAt || 0) === 0 &&
    (adm.data?.stats?.bets || 0) === 0 &&
    (Number(adm.adminRevision) || 1) === 1 &&
    (adm.data?.balance ?? 0) === INITIAL_ADMIN_BALANCE
  );
}

function encryptRecoveryBlob(userKey, acc) {
  if (!userKey || !acc) return null;
  const payload = JSON.stringify({
    v: 1,
    userKey,
    username: acc.username,
    passwordHash: acc.passwordHash,
    salt: acc.salt,
    role: acc.role === 'admin' ? 'admin' : 'user',
    banned: Boolean(acc.banned),
    banReason: String(acc.banReason || ''),
    adminRevision: Number(acc.adminRevision) || 1,
    tokenVersion: Number(acc.tokenVersion) || 1,
    createdAt: acc.createdAt || Date.now(),
    data: acc.data || createDefaultAccountData(0),
  });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', RECOVERY_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

function decryptRecoveryBlob(blob) {
  try {
    const parts = String(blob || '').split('.');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, ctHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ct = Buffer.from(ctHex, 'hex');
    if (iv.length !== 12 || tag.length !== 16 || ct.length === 0) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', RECOVERY_KEY, iv);
    decipher.setAuthTag(tag);
    const jsonStr = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (!parsed || parsed.v !== 1 || !parsed.userKey || !parsed.username || !parsed.data) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function startBattleServer(battle) {
  if (!battle || battle.status !== 'waiting') return;
  const roundResults = battle.crateIds.map((crateId) => {
    const crate = CRATES_BY_ID.get(crateId);
    return battle.players.map(() => weightedPickServer(crate?.items || []));
  });

  battle.players = battle.players.map((p, seatIdx) => {
    if (!p) return p;
    const pulls = roundResults.map((r) => r[seatIdx]).filter(Boolean);
    const total = pulls.reduce((s, it) => s + (Number(it.value) || 0), 0);
    return {
      ...p,
      pulls,
      total,
    };
  });

  let best = -1;
  let tiedSeats = [];
  battle.players.forEach((p, idx) => {
    if (!p) return;
    if (p.total > best) {
      best = p.total;
      tiedSeats = [idx];
    } else if (p.total === best) {
      tiedSeats.push(idx);
    }
  });
  battle.winnerSeat =
    tiedSeats.length > 0 ? tiedSeats[crypto.randomInt(0, tiedSeats.length)] : null;
  battle.totalPot = battle.players.reduce((s, p) => s + (p?.total || 0), 0);
  battle.status = 'playing';
  battle.startedAt = Date.now();
  battle.rewardSettled = false;
}

function settleBattleServer(battle) {
  if (!battle || battle.rewardSettled || battle.status === 'waiting') return false;
  battle.rewardSettled = true;
  battle.status = 'finished';
  battle.finishedAt = Date.now();

  const allPulled = battle.players.flatMap((p) => p?.pulls || []);
  const bestPet =
    allPulled.length > 0
      ? [...allPulled].sort((a, b) => (b.value || 0) - (a.value || 0))[0]
      : null;
  const refCrate = CRATES_BY_ID.get(battle.crateIds?.[0]);
  const now = Date.now();

  for (const p of battle.players) {
    if (!p || p.isBot || !p.userKey) continue;
    const acc = db.accounts[p.userKey];
    if (!acc) continue;
    if (!acc.data) acc.data = createDefaultAccountData(0);

    if (p.seat === battle.winnerSeat) {
      const stamped = allPulled.map((pet) => ({
        uid: `${now}-${Math.random().toString(36).slice(2, 9)}`,
        name: pet.name,
        thumb: pet.thumb,
        value: pet.value,
        tier: pet.tier,
        from: `Battle (${battle.mode})`,
      }));
      acc.data.inventory = [...stamped, ...(acc.data.inventory || [])].slice(0, 500);
      const mult = Number((battle.totalPot / Math.max(1, battle.cost)).toFixed(2));
      const entry = {
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
        game: 'Battles',
        amount: battle.cost,
        multiplier: mult,
        payout: battle.totalPot,
        time: now,
      };
      acc.data.history = [entry, ...(acc.data.history || [])].slice(0, 200);
      acc.data.xp = (Number(acc.data.xp) || 0) + battle.cost / 100_000;
      const st = acc.data.stats || createDefaultAccountData(0).stats;
      acc.data.stats = {
        wagered: (st.wagered || 0) + battle.cost,
        profit: (st.profit || 0) + (battle.totalPot - battle.cost),
        bets: (st.bets || 0) + 1,
        wins: (st.wins || 0) + 1,
        biggestWin: Math.max(st.biggestWin || 0, battle.totalPot),
      };
      if (bestPet && refCrate) {
        const drop = {
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          user: acc.username,
          name: bestPet.name,
          thumb: bestPet.thumb,
          value: Math.max(0, Math.round(Number(bestPet.value) || 0)),
          tier: bestPet.tier || 'normal',
          crateId: refCrate.id,
          crateName: refCrate.name,
          isUser: false,
          isReal: true,
          time: now,
        };
        db.drops = [drop, ...db.drops].slice(0, 24);
      }
    } else {
      const entry = {
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
        game: 'Battles',
        amount: battle.cost,
        multiplier: 0,
        payout: 0,
        time: now,
      };
      acc.data.history = [entry, ...(acc.data.history || [])].slice(0, 200);
      acc.data.xp = (Number(acc.data.xp) || 0) + battle.cost / 100_000;
      const st = acc.data.stats || createDefaultAccountData(0).stats;
      acc.data.stats = {
        wagered: (st.wagered || 0) + battle.cost,
        profit: (st.profit || 0) - battle.cost,
        bets: (st.bets || 0) + 1,
        wins: st.wins || 0,
        biggestWin: st.biggestWin || 0,
      };
    }
    bumpAdminRevision(acc, 'battle');
  }

  return true;
}

function settleDueBattles() {
  let dirty = false;
  const now = Date.now();
  for (const battle of db.battles) {
    if (battle?.status === 'playing' && !battle.rewardSettled && battle.startedAt) {
      const dueMs = (battle.crateIds?.length || 1) * 7000 + 3000;
      if (now - battle.startedAt >= dueMs) {
        if (settleBattleServer(battle)) {
          dirty = true;
        }
      }
    }
  }
  if (dirty) saveDb();
}

function listCoinflips() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  db.coinflips = (db.coinflips || []).filter(
    (c) => c && (c.status !== 'finished' || (c.finishedAt || c.createdAt || 0) > cutoff)
  );
  return [...db.coinflips].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 40);
}

function startCoinflipServer(cf) {
  const outcome = crypto.randomInt(0, 2) === 0 ? 'diamond' : 'huge';
  const winnerIdx = cf.players[0]?.side === outcome ? 0 : 1;
  const payout = Math.round(cf.bet * 1.76);
  const now = Date.now();
  cf.outcome = outcome;
  cf.winnerIdx = winnerIdx;
  cf.winnerName = cf.players[winnerIdx]?.name || 'Winner';
  cf.payout = payout;
  cf.status = 'flipping';
  cf.startedAt = now;
  cf.revealAt = now + 2850;
  cf.rewardSettled = false;
}

function settleCoinflipServer(cf) {
  if (!cf || cf.rewardSettled || cf.status === 'waiting') return false;
  cf.rewardSettled = true;
  cf.status = 'finished';
  cf.finishedAt = Date.now();
  const now = cf.finishedAt;

  for (const p of cf.players || []) {
    if (!p || p.isBot || !p.userKey) continue;
    const acc = db.accounts[p.userKey];
    if (!acc) continue;
    if (!acc.data) acc.data = createDefaultAccountData(0);

    const won = p.seat === cf.winnerIdx;
    const winPayout = won ? cf.payout : 0;
    if (won) {
      acc.data.balance = Math.max(0, (acc.data.balance || 0) + winPayout);
    }

    const entry = {
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      game: 'Coinflip',
      amount: cf.bet,
      multiplier: won ? 1.76 : 0,
      payout: winPayout,
      time: now,
    };
    acc.data.history = [entry, ...(acc.data.history || [])].slice(0, 200);
    const xpMult = Math.max(0.25, Number(db.siteConfig?.games?.xpMultiplier) || 1);
    acc.data.xp = (Number(acc.data.xp) || 0) + (cf.bet / 100_000) * xpMult;
    const st = acc.data.stats || createDefaultAccountData(0).stats;
    acc.data.stats = {
      wagered: (st.wagered || 0) + cf.bet,
      profit: (st.profit || 0) + (winPayout - cf.bet),
      bets: (st.bets || 0) + 1,
      wins: (st.wins || 0) + (won ? 1 : 0),
      biggestWin: Math.max(st.biggestWin || 0, winPayout),
    };
    bumpAdminRevision(acc, 'coinflip');
  }
  return true;
}

function settleDueCoinflips() {
  const now = Date.now();
  let changed = false;
  for (const cf of db.coinflips || []) {
    if (cf && cf.status === 'flipping' && !cf.rewardSettled && now >= (cf.revealAt || 0)) {
      if (settleCoinflipServer(cf)) changed = true;
    }
  }
  if (changed) saveDb();
}

function listBattles() {
  const active = db.battles.filter((b) => b && b.status !== 'finished');
  const finished = db.battles
    .filter((b) => b && b.status === 'finished')
    .sort((a, b) => (b.finishedAt || b.createdAt || 0) - (a.finishedAt || a.createdAt || 0))
    .slice(0, 20);
  db.battles = [...active, ...finished].slice(0, 30);
  return db.battles;
}

function pruneTradeQueue() {
  const now = Date.now();
  let changed = false;
  for (const job of db.tradeQueue || []) {
    if (!job) continue;
    if ((job.status === 'waiting' || job.status === 'processing') && job.expiresAt && now > job.expiresAt) {
      job.status = 'expired';
      job.finishedAt = now;
      job.note = 'Timed out (10m)';
      if (job.type === 'withdraw' && !job.refunded) {
        job.refunded = true;
        const acc = db.accounts[job.userKey];
        if (acc) {
          if (!acc.data) acc.data = createDefaultAccountData(0);
          acc.data.balance = Math.max(0, (acc.data.balance || 0) + job.amount);
          bumpAdminRevision(acc, 'trade');
        }
      }
      changed = true;
    }
  }
  const cutoff = now - 24 * 60 * 60 * 1000;
  const before = (db.tradeQueue || []).length;
  db.tradeQueue = (db.tradeQueue || [])
    .filter((j) => j && (j.status === 'waiting' || j.status === 'processing' || (j.createdAt || 0) > cutoff))
    .slice(0, 100);
  if (db.tradeQueue.length !== before) changed = true;
  if (changed) saveDb();
  return db.tradeQueue;
}

function completeDepositJob(job, gems, txId, actorName = 'TradeBot', petsOverride = null) {
  if (!job || job.status === 'completed') return false;
  if (txId && db.processedBotTx[txId]) return false;
  const cleanGems = Math.max(0, Math.round(Number(gems) || 0));
  const rawPets = Array.isArray(petsOverride) ? petsOverride : Array.isArray(job.pets) ? job.pets : [];
  const cleanPets = rawPets.slice(0, 12).filter((p) => p && p.name);
  if (cleanGems <= 0 && cleanPets.length === 0) return false;
  const acc = db.accounts[job.userKey];
  if (!acc) return false;
  if (!acc.data) acc.data = createDefaultAccountData(0);
  if (cleanGems > 0) {
    acc.data.balance = Math.max(0, (acc.data.balance || 0) + cleanGems);
  }
  const now = Date.now();
  if (cleanPets.length > 0) {
    const stamped = cleanPets.map((p) => ({
      uid: `${now}-${Math.random().toString(36).slice(2, 9)}`,
      name: String(p.name).slice(0, 80),
      thumb: p.thumb || '',
      value: Math.max(0, Math.round(Number(p.value) || 0)),
      tier: p.tier || 'huge',
      from: 'In-Game Trade Deposit',
    }));
    acc.data.inventory = [...stamped, ...(acc.data.inventory || [])].slice(0, 500);
  }
  bumpAdminRevision(acc, 'trade');
  job.status = 'completed';
  job.actualGems = cleanGems;
  job.actualPetsCount = cleanPets.length;
  job.txId = txId || `tx-${now}`;
  job.completedBy = actorName;
  job.finishedAt = now;
  if (txId) db.processedBotTx[txId] = now;
  logAudit(
    actorName,
    `Deposit trade completed for ${acc.username} (${job.robloxUsername}): +${formatGemsServer(cleanGems)} gems, +${cleanPets.length} pets`
  );
  return true;
}

function completeWithdrawJob(job, txId, actorName = 'TradeBot') {
  if (!job || job.status === 'completed' || job.status === 'cancelled' || job.status === 'expired') return false;
  if (txId && db.processedBotTx[txId]) return false;
  job.status = 'completed';
  job.actualGems = job.amount;
  job.txId = txId || `tx-${Date.now()}`;
  job.completedBy = actorName;
  job.finishedAt = Date.now();
  if (txId) db.processedBotTx[txId] = job.finishedAt;
  logAudit(actorName, `Withdraw trade sent to ${job.username} (${job.robloxUsername}): ${formatGemsServer(job.amount)} gems`);
  return true;
}

function cancelTradeJob(job, reason = 'Cancelled', actorName = 'System') {
  if (!job || job.status === 'completed' || job.status === 'cancelled') return false;
  job.status = 'cancelled';
  job.note = String(reason || 'Cancelled').slice(0, 120);
  job.finishedAt = Date.now();
  if (job.type === 'withdraw' && !job.refunded) {
    job.refunded = true;
    const acc = db.accounts[job.userKey];
    if (acc) {
      if (!acc.data) acc.data = createDefaultAccountData(0);
      acc.data.balance = Math.max(0, (acc.data.balance || 0) + job.amount);
      bumpAdminRevision(acc, 'trade');
    }
  }
  logAudit(actorName, `Cancelled ${job.type} trade for ${job.username} (${job.note})`);
  return true;
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  // Bot API routes (authenticated via x-bot-key header)
  if (pathname.startsWith('/api/bot/')) {
    const providedKey = String(req.headers['x-bot-key'] || '');
    if (!providedKey || providedKey !== BOT_API_KEY) {
      return sendJson(res, 401, { ok: false, error: 'Invalid or missing x-bot-key.' });
    }
    pruneTradeQueue();
    if (req.method === 'GET' && pathname === '/api/bot/queue') {
      const active = (db.tradeQueue || []).filter(
        (j) => j.status === 'waiting' || j.status === 'processing'
      );
      return sendJson(res, 200, { ok: true, jobs: active });
    }
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    }
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Invalid JSON body.' });
    }
    const job = (db.tradeQueue || []).find((j) => j.id === body.jobId);
    if (!job) return sendJson(res, 404, { ok: false, error: 'Trade job not found.' });

    if (pathname === '/api/bot/claim') {
      if (job.status !== 'waiting' && job.status !== 'processing') {
        return sendJson(res, 400, { ok: false, error: `Job is already ${job.status}.` });
      }
      job.status = 'processing';
      job.claimedAt = Date.now();
      saveDb();
      return sendJson(res, 200, { ok: true, job });
    }
    if (pathname === '/api/bot/deposit-complete') {
      if (job.type !== 'deposit') return sendJson(res, 400, { ok: false, error: 'Not a deposit job.' });
      if (!completeDepositJob(job, body.gems, body.txId, 'TradeBot', body.pets)) {
        return sendJson(res, 400, { ok: false, error: 'Could not complete deposit (duplicate tx or empty deposit).' });
      }
      saveDb();
      return sendJson(res, 200, { ok: true, job });
    }
    if (pathname === '/api/bot/withdraw-complete') {
      if (job.type !== 'withdraw') return sendJson(res, 400, { ok: false, error: 'Not a withdraw job.' });
      if (!completeWithdrawJob(job, body.txId, 'TradeBot')) {
        return sendJson(res, 400, { ok: false, error: 'Could not complete withdraw.' });
      }
      saveDb();
      return sendJson(res, 200, { ok: true, job });
    }
    if (pathname === '/api/bot/cancel') {
      if (!cancelTradeJob(job, body.reason || 'Cancelled by bot', 'TradeBot')) {
        return sendJson(res, 400, { ok: false, error: 'Could not cancel trade job.' });
      }
      saveDb();
      return sendJson(res, 200, { ok: true, job });
    }
    return sendJson(res, 404, { ok: false, error: 'Unknown bot endpoint.' });
  }

  let session = getSessionAccount(req);
  let me = session?.account || null;
  let isAdmin = me?.role === 'admin';

  if (req.method === 'GET' && pathname === '/api/state') {
    settleDueBattles();
    settleDueCoinflips();
    pruneTradeQueue();

    if (!session) {
      const signed = findValidSignedToken(req);
      if (signed && !db.accounts[signed.userKey] && db.preservedProfiles?.[signed.userKey]) {
        const prof = db.preservedProfiles[signed.userKey];
        const randomSalt = crypto.randomBytes(16).toString('hex');
        const randomPassHash = hashPasswordScrypt(crypto.randomBytes(24).toString('hex'), randomSalt);
        db.accounts[signed.userKey] = {
          username: prof.username,
          passwordHash: prof.passwordHash || randomPassHash,
          salt: prof.salt || randomSalt,
          role: prof.role === 'admin' ? 'admin' : 'user',
          banned: Boolean(prof.banned),
          banReason: String(prof.banReason || ''),
          adminRevision: Number(prof.adminRevision) || 1,
          tokenVersion: signed.tokenVersion,
          createdAt: prof.createdAt || Date.now(),
          lastLoginAt: Date.now(),
          passwordRestored: !prof.passwordHash,
          data: sanitizeSyncData(prof.data, createDefaultAccountData(0)),
        };
        delete db.preservedProfiles[signed.userKey];
        db.restoredUsers[signed.userKey] = true;
        saveDb();
        session = getSessionAccount(req);
        me = session?.account || null;
        isAdmin = me?.role === 'admin';
      }
    }

    let needsRecovery = false;
    let recoverUserKey = null;
    if (session && session.userKey === 'admin' && isFreshSeededAdmin()) {
      needsRecovery = true;
      recoverUserKey = 'admin';
    } else if (!session) {
      const signed = findValidSignedToken(req);
      if (signed && !db.accounts[signed.userKey]) {
        needsRecovery = true;
        recoverUserKey = signed.userKey;
      }
    }

    const cid = String(req.headers['x-client-id'] || '');
    const now = Date.now();
    if (cid) activeClients.set(cid, now);
    for (const [k, ts] of activeClients.entries()) {
      if (now - ts > 20_000) activeClients.delete(k);
    }

    return sendJson(res, 200, {
      ok: true,
      hadToken: getCandidateTokens(req).length > 0,
      siteConfig: sanitizeSiteConfig(db.siteConfig, isAdmin),
      me: sanitizeAccount(me),
      userKey: session?.userKey || null,
      chat: db.chat.slice(-50),
      drops: db.drops.slice(0, 24),
      battles: listBattles(),
      coinflips: listCoinflips(),
      myTrades: session
        ? (db.tradeQueue || []).filter((j) => j.userKey === session.userKey).slice(0, 15)
        : [],
      tradeQueue: isAdmin ? db.tradeQueue || [] : null,
      botApiKey: isAdmin ? BOT_API_KEY : null,
      accounts: isAdmin ? sanitizeAccountsMap(db.accounts) : null,
      promoCodes: isAdmin ? listPromoCodes() : null,
      onlineClients: activeClients.size,
      needsRecovery,
      recoverUserKey,
      recoveryBlob: session && !needsRecovery ? encryptRecoveryBlob(session.userKey, me) : null,
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const msg = err.message === 'PAYLOAD_TOO_LARGE' ? 'Request too large.' : 'Invalid JSON body.';
    return sendJson(res, 400, { ok: false, error: msg });
  }

  // Auth routes
  if (pathname === '/api/auth/register') {
    if (!db.siteConfig.allowRegistration) {
      return sendJson(res, 403, {
        ok: false,
        error: 'New registrations are currently disabled by an admin.',
      });
    }
    const rawName = String(body.username || '').trim();
    if (!USERNAME_RE.test(rawName)) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Username must be 3–20 characters (letters, numbers, underscores only).',
      });
    }
    const pass = String(body.password || '');
    if (pass.length < 4) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Password must be at least 4 characters.',
      });
    }
    const key = normalizeKey(rawName);
    if (db.accounts[key]) {
      return sendJson(res, 409, { ok: false, error: 'That username is already taken.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPasswordScrypt(pass, salt);
    const now = Date.now();
    const preserved = db.preservedProfiles?.[key];
    const initialData = preserved?.data
      ? sanitizeSyncData(preserved.data, createDefaultAccountData(0))
      : createDefaultAccountData(db.siteConfig.startingBalance ?? 500_000);
    const account = {
      username: rawName,
      passwordHash,
      salt,
      role: preserved?.role === 'admin' ? 'admin' : 'user',
      banned: Boolean(preserved?.banned),
      banReason: String(preserved?.banReason || ''),
      adminRevision: Number(preserved?.adminRevision) || 1,
      createdAt: preserved?.createdAt || now,
      lastLoginAt: now,
      data: initialData,
    };
    if (preserved) delete db.preservedProfiles[key];
    db.accounts[key] = account;
    db.restoredUsers[key] = true;
    const token = createSession(key);
    saveDb();

    return sendJson(
      res,
      200,
      {
        ok: true,
        token,
        userKey: key,
        account: sanitizeAccount(account),
        siteConfig: sanitizeSiteConfig(db.siteConfig, account.role === 'admin'),
        recoveryBlob: encryptRecoveryBlob(key, account),
      },
      { 'Set-Cookie': buildSessionCookie(req, token, SESSION_TTL_SEC) }
    );
  }

  if (pathname === '/api/auth/login') {
    const key = normalizeKey(body.username);
    const account = db.accounts[key];
    if (!account || !verifyPasswordScrypt(String(body.password || ''), account.salt, account.passwordHash)) {
      return sendJson(res, 401, { ok: false, error: 'Invalid username or password.' });
    }
    if (account.banned) {
      return sendJson(res, 403, {
        ok: false,
        error: account.banReason
          ? `Account banned: ${account.banReason}`
          : 'This account is banned.',
      });
    }

    account.lastLoginAt = Date.now();
    db.restoredUsers[key] = true;
    const token = createSession(key);
    saveDb();

    const accIsAdmin = account.role === 'admin';
    return sendJson(
      res,
      200,
      {
        ok: true,
        token,
        userKey: key,
        account: sanitizeAccount(account),
        siteConfig: sanitizeSiteConfig(db.siteConfig, accIsAdmin),
        accounts: accIsAdmin ? sanitizeAccountsMap(db.accounts) : null,
        promoCodes: accIsAdmin ? listPromoCodes() : null,
        recoveryBlob: encryptRecoveryBlob(key, account),
      },
      { 'Set-Cookie': buildSessionCookie(req, token, SESSION_TTL_SEC) }
    );
  }

  if (pathname === '/api/auth/logout') {
    const tokens = getCandidateTokens(req);
    if (tokens.length > 0) {
      const now = Date.now();
      for (const tok of tokens) {
        db.revokedTokens[tok] = now;
        if (db.sessions[tok]) delete db.sessions[tok];
      }
      saveDb();
    }
    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': buildSessionCookie(req, '', 0) }
    );
  }

  if (pathname === '/api/auth/recover') {
    const signed = findValidSignedToken(req);
    if (!signed) {
      return sendJson(res, 401, { ok: false, error: 'Valid session token required.' });
    }
    const recovered = decryptRecoveryBlob(body.recoveryBlob);
    if (
      !recovered ||
      recovered.userKey !== signed.userKey ||
      (Number(recovered.tokenVersion) || 1) !== signed.tokenVersion
    ) {
      return sendJson(res, 400, { ok: false, error: 'Invalid recovery backup.' });
    }

    const existing = db.accounts[signed.userKey];
    const shouldReplaceSeededAdmin = signed.userKey === 'admin' && isFreshSeededAdmin();
    if (existing && !shouldReplaceSeededAdmin) {
      const exIsAdmin = existing.role === 'admin';
      return sendJson(res, 200, {
        ok: true,
        alreadyPresent: true,
        hadToken: true,
        siteConfig: sanitizeSiteConfig(db.siteConfig, exIsAdmin),
        me: sanitizeAccount(existing),
        userKey: signed.userKey,
        chat: db.chat.slice(-50),
        drops: db.drops.slice(0, 24),
        battles: listBattles(),
        accounts: exIsAdmin ? sanitizeAccountsMap(db.accounts) : null,
        promoCodes: exIsAdmin ? listPromoCodes() : null,
        onlineClients: activeClients.size,
        recoveryBlob: encryptRecoveryBlob(signed.userKey, existing),
      });
    }

    const restored = {
      username: recovered.username,
      passwordHash: recovered.passwordHash,
      salt: recovered.salt,
      role: recovered.role === 'admin' ? 'admin' : 'user',
      banned: Boolean(recovered.banned),
      banReason: String(recovered.banReason || ''),
      adminRevision: Number(recovered.adminRevision) || 1,
      tokenVersion: Number(recovered.tokenVersion) || 1,
      createdAt: recovered.createdAt || Date.now(),
      lastLoginAt: Date.now(),
      data: sanitizeSyncData(recovered.data, createDefaultAccountData(0)),
    };
    db.accounts[signed.userKey] = restored;
    if (db.preservedProfiles?.[signed.userKey]) delete db.preservedProfiles[signed.userKey];
    db.restoredUsers[signed.userKey] = true;
    saveDb();

    const recIsAdmin = restored.role === 'admin';
    const freshToken = createSession(signed.userKey);
    return sendJson(
      res,
      200,
      {
        ok: true,
        recovered: true,
        hadToken: true,
        siteConfig: sanitizeSiteConfig(db.siteConfig, recIsAdmin),
        me: sanitizeAccount(restored),
        userKey: signed.userKey,
        chat: db.chat.slice(-50),
        drops: db.drops.slice(0, 24),
        battles: listBattles(),
        accounts: recIsAdmin ? sanitizeAccountsMap(db.accounts) : null,
        promoCodes: recIsAdmin ? listPromoCodes() : null,
        onlineClients: activeClients.size,
        recoveryBlob: encryptRecoveryBlob(signed.userKey, restored),
      },
      { 'Set-Cookie': buildSessionCookie(req, freshToken, SESSION_TTL_SEC) }
    );
  }

  // Authenticated player routes
  if (!session) {
    return sendJson(res, 401, { ok: false, error: 'Sign in required.' });
  }

  if (pathname === '/api/auth/change-password') {
    const cur = String(body.currentPassword || '');
    const next = String(body.newPassword || '');
    if (!verifyPasswordScrypt(cur, me.salt, me.passwordHash)) {
      return sendJson(res, 400, { ok: false, error: 'Current password is incorrect.' });
    }
    if (next.length < 4) {
      return sendJson(res, 400, { ok: false, error: 'New password must be at least 4 characters.' });
    }
    me.salt = crypto.randomBytes(16).toString('hex');
    me.passwordHash = hashPasswordScrypt(next, me.salt);
    saveDb();
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/account/sync') {
    const clientRev = Number(body.adminRevision) || 1;
    const serverRev = Number(me.adminRevision) || 1;
    if (clientRev !== serverRev) {
      return sendJson(res, 200, {
        ok: false,
        stale: true,
        account: sanitizeAccount(me),
        recoveryBlob: encryptRecoveryBlob(session.userKey, me),
      });
    }
    me.data = sanitizeSyncData(body.data, me.data);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      adminRevision: me.adminRevision,
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/account/reset') {
    const startBal = isAdmin ? INITIAL_ADMIN_BALANCE : (db.siteConfig.startingBalance ?? 500_000);
    me.data = createDefaultAccountData(startBal);
    bumpAdminRevision(me, 'reset');
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/chat/send') {
    if (!db.siteConfig.chatEnabled && !isAdmin) {
      return sendJson(res, 403, { ok: false, error: 'Chat is muted by admin.' });
    }
    const text = String(body.text || '').trim().slice(0, 160);
    if (!text) {
      return sendJson(res, 400, { ok: false, error: 'Message cannot be empty.' });
    }
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-srv`,
      user: me.username,
      level: isAdmin ? 99 : getLevelFromXp(me.data?.xp),
      text,
      isUser: false,
      isAdmin,
      isBroadcast: false,
      isReal: true,
      time: Date.now(),
    };
    db.chat = [...db.chat.slice(-49), msg];
    saveDb();
    return sendJson(res, 200, { ok: true, message: msg, chat: db.chat });
  }

  if (pathname === '/api/drops/push') {
    if (!body.name) {
      return sendJson(res, 400, { ok: false, error: 'Missing pet drop name.' });
    }
    const drop = {
      id: body.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user: me.username,
      name: String(body.name).slice(0, 80),
      thumb: body.thumb || '',
      value: Math.max(0, Math.round(Number(body.value) || 0)),
      tier: body.tier || 'normal',
      crateId: body.crateId || 'starter-paw',
      crateName: body.crateName || 'Crate',
      isUser: false,
      isReal: true,
      time: Date.now(),
    };
    db.drops = [drop, ...db.drops].slice(0, 24);
    saveDb();
    return sendJson(res, 200, { ok: true, drop, drops: db.drops });
  }

  if (pathname === '/api/promo/redeem') {
    const code = String(body.code || '').trim().toUpperCase();
    if (!code) {
      return sendJson(res, 400, { ok: false, error: 'Enter a promo code.' });
    }
    const promo = db.promoCodes?.[code];
    if (!promo) {
      return sendJson(res, 404, { ok: false, error: 'Invalid promo code.' });
    }
    if (!promo.active) {
      return sendJson(res, 400, { ok: false, error: 'This promo code is currently paused.' });
    }
    if (Array.isArray(promo.claimedBy) && promo.claimedBy.includes(session.userKey)) {
      return sendJson(res, 400, { ok: false, error: 'You already redeemed this promo code.' });
    }
    if ((promo.maxUses || 0) > 0 && (promo.uses || 0) >= promo.maxUses) {
      return sendJson(res, 400, { ok: false, error: 'This promo code has reached its max uses.' });
    }
    const playerLvl = getLevelFromXp(me.data?.xp);
    if ((promo.minLevel || 1) > 1 && playerLvl < promo.minLevel) {
      return sendJson(res, 403, {
        ok: false,
        error: `Requires Level ${promo.minLevel}+ (you are Level ${playerLvl}).`,
      });
    }
    const playerWagered = me.data?.stats?.wagered || 0;
    if ((promo.minWagered || 0) > 0 && playerWagered < promo.minWagered) {
      return sendJson(res, 403, {
        ok: false,
        error: `Requires ${formatGemsServer(promo.minWagered)}+ total wagered.`,
      });
    }

    me.data.balance = Math.max(0, (me.data.balance || 0) + promo.gems);
    promo.uses = (promo.uses || 0) + 1;
    promo.claimedBy = [...(promo.claimedBy || []), session.userKey];
    bumpAdminRevision(me, 'promo');
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      code: promo.code,
      gems: promo.gems,
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  // Case Battles routes
  if (pathname === '/api/battles/create') {
    settleDueBattles();
    if (db.siteConfig.maintenanceMode && !isAdmin) {
      return sendJson(res, 403, { ok: false, error: 'Site is in Maintenance Mode.' });
    }
    const rawMode = String(body.mode || '1v1');
    const seatsMap = { '1v1': 2, '1v1v1': 3, '1v1v1v1': 4 };
    const seatsCount = seatsMap[rawMode];
    if (!seatsCount) {
      return sendJson(res, 400, { ok: false, error: 'Invalid battle mode.' });
    }
    const crateIds = Array.isArray(body.crateIds) ? body.crateIds.map((id) => String(id)) : [];
    if (crateIds.length < 1 || crateIds.length > 10) {
      return sendJson(res, 400, { ok: false, error: 'Pick 1 to 10 crates.' });
    }
    const crates = crateIds.map((id) => CRATES_BY_ID.get(id)).filter(Boolean);
    if (crates.length !== crateIds.length) {
      return sendJson(res, 400, { ok: false, error: 'One or more selected crates are invalid.' });
    }
    const cost = crates.reduce((sum, c) => sum + getEffectiveCratePriceServer(c, db.siteConfig), 0);
    if (cost <= 0 || (me.data?.balance || 0) < cost) {
      return sendJson(res, 400, { ok: false, error: 'Insufficient gems to create this battle.' });
    }

    if (!me.data) me.data = createDefaultAccountData(0);
    me.data.balance = Math.max(0, (me.data.balance || 0) - cost);
    bumpAdminRevision(me, 'battle');

    const battle = {
      id: `battle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mode: rawMode,
      seatsCount,
      crateIds,
      cost,
      creatorKey: session.userKey,
      creatorName: me.username,
      players: Array.from({ length: seatsCount }, (_, idx) =>
        idx === 0
          ? {
              seat: 0,
              userKey: session.userKey,
              name: me.username,
              isBot: false,
              hue: 190,
              pulls: [],
              total: 0,
            }
          : null
      ),
      status: 'waiting',
      winnerSeat: null,
      totalPot: 0,
      rewardSettled: false,
      createdAt: Date.now(),
    };
    db.battles.unshift(battle);
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      battle,
      battles: listBattles(),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/battles/join') {
    settleDueBattles();
    if (db.siteConfig.maintenanceMode && !isAdmin) {
      return sendJson(res, 403, { ok: false, error: 'Site is in Maintenance Mode.' });
    }
    const battle = db.battles.find((b) => b.id === body.battleId);
    if (!battle) {
      return sendJson(res, 404, { ok: false, error: 'Battle room not found.' });
    }
    if (battle.status !== 'waiting') {
      return sendJson(res, 400, { ok: false, error: 'This battle has already started or finished.' });
    }
    if (battle.players.some((p) => p && !p.isBot && p.userKey === session.userKey)) {
      return sendJson(res, 400, { ok: false, error: 'You are already seated in this battle.' });
    }

    const reqSeat = Number(body.seatIdx);
    const targetIdx =
      Number.isInteger(reqSeat) &&
      reqSeat >= 0 &&
      reqSeat < battle.seatsCount &&
      battle.players[reqSeat] === null
        ? reqSeat
        : battle.players.findIndex((p) => p === null);
    if (targetIdx === -1) {
      return sendJson(res, 400, { ok: false, error: 'Battle room is already full.' });
    }
    if ((me.data?.balance || 0) < battle.cost) {
      return sendJson(res, 400, { ok: false, error: 'Insufficient gems to join this battle.' });
    }

    if (!me.data) me.data = createDefaultAccountData(0);
    me.data.balance = Math.max(0, (me.data.balance || 0) - battle.cost);
    bumpAdminRevision(me, 'battle');

    battle.players[targetIdx] = {
      seat: targetIdx,
      userKey: session.userKey,
      name: me.username,
      isBot: false,
      hue: (205 + targetIdx * 35) % 360,
      pulls: [],
      total: 0,
    };

    if (battle.players.every(Boolean)) {
      startBattleServer(battle);
    }
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      battle,
      battles: listBattles(),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/battles/call-bot') {
    settleDueBattles();
    const battle = db.battles.find((b) => b.id === body.battleId);
    if (!battle) {
      return sendJson(res, 404, { ok: false, error: 'Battle room not found.' });
    }
    if (battle.status !== 'waiting') {
      return sendJson(res, 400, { ok: false, error: 'Battle has already started or finished.' });
    }
    if (battle.creatorKey !== session.userKey && !isAdmin) {
      return sendJson(res, 403, { ok: false, error: 'Only the battle creator or an admin can call bots.' });
    }

    const usedNames = new Set(battle.players.filter(Boolean).map((p) => p.name));
    if (body.fillAll) {
      let added = 0;
      for (let i = 0; i < battle.seatsCount; i++) {
        if (battle.players[i] === null) {
          const name = pickBotName(usedNames);
          usedNames.add(name);
          battle.players[i] = {
            seat: i,
            userKey: null,
            name,
            isBot: true,
            hue: 180 + crypto.randomInt(0, 150),
            pulls: [],
            total: 0,
          };
          added++;
        }
      }
      if (added === 0) {
        return sendJson(res, 400, { ok: false, error: 'Battle room is already full.' });
      }
    } else {
      const reqSeat = Number(body.seatIdx);
      const targetIdx =
        Number.isInteger(reqSeat) &&
        reqSeat >= 0 &&
        reqSeat < battle.seatsCount &&
        battle.players[reqSeat] === null
          ? reqSeat
          : battle.players.findIndex((p) => p === null);
      if (targetIdx === -1) {
        return sendJson(res, 400, { ok: false, error: 'Battle room is already full.' });
      }
      const name = pickBotName(usedNames);
      battle.players[targetIdx] = {
        seat: targetIdx,
        userKey: null,
        name,
        isBot: true,
        hue: 180 + crypto.randomInt(0, 150),
        pulls: [],
        total: 0,
      };
    }

    if (battle.players.every(Boolean)) {
      startBattleServer(battle);
    }
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      battle,
      battles: listBattles(),
    });
  }

  if (pathname === '/api/battles/leave') {
    settleDueBattles();
    const battle = db.battles.find((b) => b.id === body.battleId);
    if (!battle) {
      return sendJson(res, 404, { ok: false, error: 'Battle room not found.' });
    }
    if (battle.status !== 'waiting') {
      return sendJson(res, 400, { ok: false, error: 'Cannot leave after a battle has started.' });
    }

    if (battle.creatorKey === session.userKey || isAdmin) {
      for (const p of battle.players) {
        if (!p || p.isBot || !p.userKey) continue;
        const acc = db.accounts[p.userKey];
        if (acc) {
          if (!acc.data) acc.data = createDefaultAccountData(0);
          acc.data.balance = Math.max(0, (acc.data.balance || 0) + battle.cost);
          bumpAdminRevision(acc, 'battle');
        }
      }
      db.battles = db.battles.filter((b) => b.id !== battle.id);
      saveDb();
      return sendJson(res, 200, {
        ok: true,
        cancelled: true,
        battles: listBattles(),
        account: sanitizeAccount(me),
        recoveryBlob: encryptRecoveryBlob(session.userKey, me),
      });
    }

    const mySeat = battle.players.findIndex((p) => p && !p.isBot && p.userKey === session.userKey);
    if (mySeat === -1) {
      return sendJson(res, 400, { ok: false, error: 'You are not seated in this battle.' });
    }
    if (!me.data) me.data = createDefaultAccountData(0);
    me.data.balance = Math.max(0, (me.data.balance || 0) + battle.cost);
    bumpAdminRevision(me, 'battle');
    battle.players[mySeat] = null;
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      cancelled: false,
      battle,
      battles: listBattles(),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/battles/settle') {
    const battle = db.battles.find((b) => b.id === body.battleId);
    if (!battle) {
      return sendJson(res, 404, { ok: false, error: 'Battle room not found.' });
    }
    if (battle.status === 'playing' && !battle.rewardSettled) {
      settleBattleServer(battle);
      saveDb();
    }
    return sendJson(res, 200, {
      ok: true,
      battle,
      battles: listBattles(),
      drops: db.drops.slice(0, 24),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/trades/request') {
    pruneTradeQueue();
    const type = body.type === 'withdraw' ? 'withdraw' : 'deposit';
    const robloxUsername = String(body.robloxUsername || '').trim().slice(0, 32);
    if (!robloxUsername || robloxUsername.length < 3) {
      return sendJson(res, 400, { ok: false, error: 'Enter your exact Roblox username (3–32 chars).' });
    }
    const existing = (db.tradeQueue || []).find(
      (j) => j.userKey === session.userKey && (j.status === 'waiting' || j.status === 'processing')
    );
    if (existing) {
      return sendJson(res, 400, {
        ok: false,
        error: `You already have an active ${existing.type} trade in queue. Cancel or finish it first.`,
      });
    }
    const amount = Math.round(Number(body.amount) || 0);
    if (type === 'withdraw') {
      if (!Number.isFinite(amount) || amount < 1000) {
        return sendJson(res, 400, { ok: false, error: 'Minimum trade withdraw is 1,000 gems.' });
      }
      if ((me.data?.balance || 0) < amount) {
        return sendJson(res, 400, { ok: false, error: 'Insufficient gem balance for trade withdraw.' });
      }
      if (!me.data) me.data = createDefaultAccountData(0);
      me.data.balance = Math.max(0, (me.data.balance || 0) - amount);
      bumpAdminRevision(me, 'trade');
    }
    const rawPets = type === 'deposit' && Array.isArray(body.pets) ? body.pets.slice(0, 12) : [];
    const cleanPets = rawPets
      .filter((p) => p && p.name)
      .map((p) => ({
        name: String(p.name).slice(0, 80),
        thumb: String(p.thumb || ''),
        value: Math.max(0, Math.round(Number(p.value) || 0)),
        tier: String(p.tier || 'huge'),
      }));
    const now = Date.now();
    const job = {
      id: `tr-${now}-${crypto.randomBytes(3).toString('hex')}`,
      type,
      userKey: session.userKey,
      username: me.username,
      robloxUsername,
      amount: Math.max(0, amount),
      pets: cleanPets,
      actualGems: 0,
      actualPetsCount: 0,
      status: 'waiting',
      refunded: false,
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000,
    };
    db.tradeQueue.unshift(job);
    db.tradeQueue = db.tradeQueue.slice(0, 100);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      job,
      myTrades: db.tradeQueue.filter((j) => j.userKey === session.userKey).slice(0, 15),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/trades/cancel') {
    const job = (db.tradeQueue || []).find(
      (j) => j.id === body.jobId && (j.userKey === session.userKey || isAdmin)
    );
    if (!job) return sendJson(res, 404, { ok: false, error: 'Trade ticket not found.' });
    if (!cancelTradeJob(job, 'Cancelled by user', me.username)) {
      return sendJson(res, 400, { ok: false, error: `Cannot cancel a ${job.status} trade.` });
    }
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      job,
      myTrades: db.tradeQueue.filter((j) => j.userKey === session.userKey).slice(0, 15),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/coinflips/create') {
    if (db.siteConfig.maintenanceMode && !isAdmin) {
      return sendJson(res, 403, { ok: false, error: 'Site is in Maintenance Mode.' });
    }
    if (db.siteConfig?.games?.enabled?.coinflip === false && !isAdmin) {
      return sendJson(res, 403, { ok: false, error: 'Coinflip is currently paused by admin.' });
    }
    const bet = Math.round(Number(body.bet) || 0);
    if (!Number.isFinite(bet) || bet <= 0) {
      return sendJson(res, 400, { ok: false, error: 'Enter a valid bet amount (> 0).' });
    }
    const minBet = Number(db.siteConfig?.games?.minBet) || 0;
    const maxBet = Number(db.siteConfig?.games?.maxBet) || 0;
    if (!isAdmin) {
      if (minBet > 0 && bet < minBet) {
        return sendJson(res, 400, { ok: false, error: `Minimum bet is ${formatGemsServer(minBet)} gems.` });
      }
      if (maxBet > 0 && bet > maxBet) {
        return sendJson(res, 400, { ok: false, error: `Maximum bet is ${formatGemsServer(maxBet)} gems.` });
      }
    }
    if ((me.data?.balance || 0) < bet) {
      return sendJson(res, 400, { ok: false, error: 'Insufficient gems to create this Coinflip 1v1.' });
    }
    const side = body.side === 'huge' ? 'huge' : 'diamond';
    if (!me.data) me.data = createDefaultAccountData(0);
    me.data.balance = Math.max(0, (me.data.balance || 0) - bet);
    bumpAdminRevision(me, 'coinflip');

    const cf = {
      id: `cf-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      bet,
      creatorKey: session.userKey,
      creatorName: me.username,
      players: [
        {
          seat: 0,
          userKey: session.userKey,
          name: me.username,
          side,
          isBot: false,
        },
        null,
      ],
      status: 'waiting',
      outcome: null,
      winnerIdx: null,
      winnerName: null,
      payout: Math.round(bet * 1.76),
      rewardSettled: false,
      createdAt: Date.now(),
    };
    db.coinflips.unshift(cf);
    db.coinflips = db.coinflips.slice(0, 40);
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      coinflip: cf,
      coinflips: listCoinflips(),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/coinflips/join') {
    settleDueCoinflips();
    if (db.siteConfig.maintenanceMode && !isAdmin) {
      return sendJson(res, 403, { ok: false, error: 'Site is in Maintenance Mode.' });
    }
    const cf = db.coinflips.find((c) => c.id === body.coinflipId);
    if (!cf) {
      return sendJson(res, 404, { ok: false, error: 'Coinflip room not found.' });
    }
    if (cf.status !== 'waiting' || cf.players[1] !== null) {
      return sendJson(res, 400, { ok: false, error: 'This Coinflip 1v1 already started or is full.' });
    }
    if (cf.players[0]?.userKey === session.userKey) {
      return sendJson(res, 400, { ok: false, error: 'You cannot join your own Coinflip — wait for a player or Call Bot!' });
    }
    if ((me.data?.balance || 0) < cf.bet) {
      return sendJson(res, 400, { ok: false, error: 'Insufficient gems to join this Coinflip.' });
    }

    if (!me.data) me.data = createDefaultAccountData(0);
    me.data.balance = Math.max(0, (me.data.balance || 0) - cf.bet);
    bumpAdminRevision(me, 'coinflip');

    const oppSide = cf.players[0]?.side === 'diamond' ? 'huge' : 'diamond';
    cf.players[1] = {
      seat: 1,
      userKey: session.userKey,
      name: me.username,
      side: oppSide,
      isBot: false,
    };
    startCoinflipServer(cf);
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      coinflip: cf,
      coinflips: listCoinflips(),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/coinflips/call-bot') {
    settleDueCoinflips();
    const cf = db.coinflips.find((c) => c.id === body.coinflipId);
    if (!cf) {
      return sendJson(res, 404, { ok: false, error: 'Coinflip room not found.' });
    }
    if (cf.status !== 'waiting' || cf.players[1] !== null) {
      return sendJson(res, 400, { ok: false, error: 'This Coinflip 1v1 already has an opponent.' });
    }
    if (cf.creatorKey !== session.userKey && !isAdmin) {
      return sendJson(res, 403, { ok: false, error: 'Only the creator or an admin can call a bot.' });
    }

    const oppSide = cf.players[0]?.side === 'diamond' ? 'huge' : 'diamond';
    const botName = pickBotName(new Set([cf.creatorName]));
    cf.players[1] = {
      seat: 1,
      userKey: null,
      name: botName,
      side: oppSide,
      isBot: true,
    };
    startCoinflipServer(cf);
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      coinflip: cf,
      coinflips: listCoinflips(),
    });
  }

  if (pathname === '/api/coinflips/leave') {
    settleDueCoinflips();
    const cf = db.coinflips.find((c) => c.id === body.coinflipId);
    if (!cf) {
      return sendJson(res, 404, { ok: false, error: 'Coinflip room not found.' });
    }
    if (cf.status !== 'waiting') {
      return sendJson(res, 400, { ok: false, error: 'Cannot cancel after the flip has started.' });
    }
    if (cf.creatorKey !== session.userKey && !isAdmin) {
      return sendJson(res, 403, { ok: false, error: 'Only the creator or an admin can cancel.' });
    }
    const creatorAcc = db.accounts[cf.creatorKey];
    if (creatorAcc) {
      if (!creatorAcc.data) creatorAcc.data = createDefaultAccountData(0);
      creatorAcc.data.balance = Math.max(0, (creatorAcc.data.balance || 0) + cf.bet);
      bumpAdminRevision(creatorAcc, 'coinflip');
    }
    db.coinflips = db.coinflips.filter((c) => c.id !== cf.id);
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      cancelled: true,
      coinflips: listCoinflips(),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  if (pathname === '/api/coinflips/settle') {
    const cf = db.coinflips.find((c) => c.id === body.coinflipId);
    if (!cf) {
      return sendJson(res, 404, { ok: false, error: 'Coinflip room not found.' });
    }
    if (cf.status === 'flipping' && !cf.rewardSettled && Date.now() >= (cf.revealAt || 0) - 150) {
      settleCoinflipServer(cf);
      saveDb();
    }
    return sendJson(res, 200, {
      ok: true,
      coinflip: cf,
      coinflips: listCoinflips(),
      account: sanitizeAccount(me),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  // Admin routes
  if (!pathname.startsWith('/api/admin/')) {
    return sendJson(res, 404, { ok: false, error: 'Unknown API endpoint.' });
  }
  if (!isAdmin) {
    return sendJson(res, 403, { ok: false, error: 'Admin permission required.' });
  }

  if (pathname === '/api/admin/accounts/create') {
    const rawName = String(body.username || '').trim();
    if (!USERNAME_RE.test(rawName)) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Username must be 3–20 characters (letters, numbers, underscores).',
      });
    }
    const pass = String(body.password || '');
    if (pass.length < 4) {
      return sendJson(res, 400, { ok: false, error: 'Password must be at least 4 characters.' });
    }
    const key = normalizeKey(rawName);
    if (db.accounts[key]) {
      return sendJson(res, 409, { ok: false, error: 'An account with this username already exists.' });
    }
    const cleanRole = body.role === 'admin' ? 'admin' : 'user';
    const defaultBal = db.siteConfig.startingBalance ?? 500_000;
    const cleanBal =
      Number.isFinite(Number(body.balance)) && Number(body.balance) >= 0
        ? Math.round(Number(body.balance))
        : defaultBal;

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPasswordScrypt(pass, salt);
    const created = {
      username: rawName,
      passwordHash,
      salt,
      role: cleanRole,
      banned: false,
      banReason: '',
      adminRevision: 1,
      createdAt: Date.now(),
      lastLoginAt: 0,
      data: createDefaultAccountData(cleanBal),
    };
    db.accounts[key] = created;
    logAudit(
      me.username,
      `Created ${cleanRole} account "${rawName}" with ${cleanBal.toLocaleString()} gems`
    );
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(created),
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/balance') {
    const key = normalizeKey(body.targetKey);
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });

    const amount = Math.round(Number(body.amount) || 0);
    if (body.mode === 'set') {
      target.data.balance = Math.max(0, amount);
      logAudit(me.username, `Set ${target.username} balance to ${target.data.balance.toLocaleString()} gems`);
    } else {
      if (amount === 0) return sendJson(res, 400, { ok: false, error: 'Amount cannot be 0.' });
      target.data.balance = Math.max(0, (target.data.balance || 0) + amount);
      logAudit(
        me.username,
        `${amount > 0 ? 'Added' : 'Removed'} ${Math.abs(amount).toLocaleString()} gems ${amount > 0 ? 'to' : 'from'} ${target.username} (now ${target.data.balance.toLocaleString()})`
      );
    }
    bumpAdminRevision(target);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(target),
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/grant-pet') {
    const key = normalizeKey(body.targetKey);
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    const pet = body.pet;
    if (!pet?.name) return sendJson(res, 400, { ok: false, error: 'Select a valid pet.' });

    const now = Date.now();
    const stamped = {
      uid: `${now}-${Math.random().toString(36).slice(2, 9)}`,
      name: pet.name,
      thumb: pet.thumb,
      value: Math.round(pet.value || 0),
      tier: pet.tier || 'huge',
      from: 'Admin Grant',
    };
    target.data.inventory = [stamped, ...(target.data.inventory || [])].slice(0, 500);
    bumpAdminRevision(target);
    logAudit(me.username, `Granted pet "${stamped.name}" to ${target.username}`);

    if (body.pushToTicker) {
      const drop = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        user: target.username,
        name: stamped.name,
        thumb: stamped.thumb,
        value: stamped.value,
        tier: stamped.tier,
        crateId: pet.crateId || 'gargantuan-god',
        crateName: 'Admin Grant',
        isUser: false,
        isReal: true,
        time: now,
      };
      db.drops = [drop, ...db.drops].slice(0, 24);
    }

    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(target),
      accounts: sanitizeAccountsMap(db.accounts),
      drops: db.drops,
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/remove-pet') {
    const key = normalizeKey(body.targetKey);
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    const inv = target.data.inventory || [];
    const found = inv.find((i) => i.uid === body.uid);
    if (!found) return sendJson(res, 404, { ok: false, error: 'Inventory item not found.' });
    target.data.inventory = inv.filter((i) => i.uid !== body.uid);
    bumpAdminRevision(target);
    logAudit(me.username, `Removed "${found.name}" from ${target.username} inventory`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(target),
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/xp') {
    const key = normalizeKey(body.targetKey);
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    const safeXp = Math.max(0, Math.round(Number(body.xp) || 0));
    target.data.xp = safeXp;
    bumpAdminRevision(target);
    logAudit(me.username, `Set ${target.username} XP to ${safeXp.toLocaleString()}`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(target),
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/reset-daily') {
    const key = normalizeKey(body.targetKey);
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    target.data.lastDaily = 0;
    bumpAdminRevision(target);
    logAudit(me.username, `Reset Daily Reward cooldown for ${target.username}`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(target),
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/role') {
    const key = normalizeKey(body.targetKey);
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    const nextRole = body.role === 'admin' ? 'admin' : 'user';
    if (target.role === 'admin' && nextRole !== 'admin' && countAdmins(db.accounts) <= 1) {
      return sendJson(res, 400, { ok: false, error: 'Cannot demote the last remaining admin account.' });
    }
    target.role = nextRole;
    logAudit(me.username, `Changed ${target.username} role to ${nextRole.toUpperCase()}`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(target),
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/ban') {
    const key = normalizeKey(body.targetKey);
    if (key === session.userKey) {
      return sendJson(res, 400, { ok: false, error: 'You cannot ban your own active admin account.' });
    }
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    const banned = Boolean(body.banned);
    if (banned && target.role === 'admin' && countAdmins(db.accounts) <= 1) {
      return sendJson(res, 400, { ok: false, error: 'Cannot ban the last remaining admin account.' });
    }
    const cleanReason = banned ? String(body.reason || '').trim().slice(0, 120) : '';
    target.banned = banned;
    target.banReason = cleanReason;
    if (banned) purgeUserSessions(key);
    logAudit(
      me.username,
      banned
        ? `Banned ${target.username}${cleanReason ? ` (${cleanReason})` : ''}`
        : `Unbanned ${target.username}`
    );
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(target),
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/reset-password') {
    const key = normalizeKey(body.targetKey);
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    const pass = String(body.newPassword || '');
    if (pass.length < 4) {
      return sendJson(res, 400, { ok: false, error: 'New password must be at least 4 characters.' });
    }
    target.salt = crypto.randomBytes(16).toString('hex');
    target.passwordHash = hashPasswordScrypt(pass, target.salt);
    logAudit(me.username, `Reset password for ${target.username}`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/reset-data') {
    const key = normalizeKey(body.targetKey);
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    const defaultBal = db.siteConfig.startingBalance ?? 500_000;
    target.data = createDefaultAccountData(target.role === 'admin' ? INITIAL_ADMIN_BALANCE : defaultBal);
    bumpAdminRevision(target);
    logAudit(me.username, `Reset gameplay progress & inventory for ${target.username}`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(target),
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/delete') {
    const key = normalizeKey(body.targetKey);
    if (key === session.userKey) {
      return sendJson(res, 400, { ok: false, error: 'You cannot delete the currently signed-in account.' });
    }
    const target = db.accounts[key];
    if (!target) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    if (target.role === 'admin' && countAdmins(db.accounts) <= 1) {
      return sendJson(res, 400, { ok: false, error: 'Cannot delete the last remaining admin account.' });
    }
    delete db.accounts[key];
    purgeUserSessions(key);
    logAudit(me.username, `Deleted account ${target.username}`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/config') {
    const patch = body.patch && typeof body.patch === 'object' ? body.patch : {};
    if (patch.resetAllConfig) {
      const prevLog = db.siteConfig.auditLog || [];
      db.siteConfig = sanitizeSiteConfig(DEFAULT_SITE_CONFIG, true);
      db.siteConfig.auditLog = prevLog;
    }
    if (patch.startingBalance !== undefined) {
      db.siteConfig.startingBalance = Math.max(0, Math.min(1e13, Math.round(Number(patch.startingBalance) || 0)));
    }
    if (patch.allowDeposits !== undefined) db.siteConfig.allowDeposits = Boolean(patch.allowDeposits);
    if (patch.allowRegistration !== undefined) db.siteConfig.allowRegistration = Boolean(patch.allowRegistration);
    if (patch.maintenanceMode !== undefined) db.siteConfig.maintenanceMode = Boolean(patch.maintenanceMode);
    if (patch.chatEnabled !== undefined) db.siteConfig.chatEnabled = Boolean(patch.chatEnabled);
    if (patch.botsEnabled !== undefined) db.siteConfig.botsEnabled = Boolean(patch.botsEnabled);
    if (patch.banner !== undefined && typeof patch.banner === 'object') {
      db.siteConfig.banner = {
        text: String(patch.banner.text || '').trim().slice(0, 180),
        tone: ['info', 'gold', 'danger'].includes(patch.banner.tone) ? patch.banner.tone : 'info',
      };
    }
    if (patch.crateDiscountPct !== undefined) {
      db.siteConfig.crateDiscountPct = Math.min(80, Math.max(0, Math.round(Number(patch.crateDiscountPct) || 0)));
    }
    if (patch.cratePriceOverride && typeof patch.cratePriceOverride === 'object') {
      const { crateId, price } = patch.cratePriceOverride;
      if (crateId) {
        if (price === null || price === undefined || price === '' || Number(price) <= 0) {
          delete db.siteConfig.cratePriceOverrides[crateId];
        } else {
          db.siteConfig.cratePriceOverrides[crateId] = Math.max(1000, Math.min(1e13, Math.round(Number(price))));
        }
      }
    }
    if (patch.toggleCrateDisabled && typeof patch.toggleCrateDisabled === 'object') {
      const { crateId, disabled } = patch.toggleCrateDisabled;
      if (crateId) {
        const set = new Set(db.siteConfig.crateDisabledIds || []);
        if (disabled) set.add(String(crateId));
        else set.delete(String(crateId));
        db.siteConfig.crateDisabledIds = Array.from(set);
      }
    }
    if (patch.resetCratePricing) {
      db.siteConfig.crateDiscountPct = 0;
      db.siteConfig.cratePriceOverrides = {};
      db.siteConfig.crateDisabledIds = [];
    }
    if (patch.branding && typeof patch.branding === 'object') {
      db.siteConfig.branding = sanitizeBranding({
        ...(db.siteConfig.branding || {}),
        ...patch.branding,
      });
    }
    if (patch.theme && typeof patch.theme === 'object') {
      db.siteConfig.theme = sanitizeTheme({
        ...(db.siteConfig.theme || {}),
        ...patch.theme,
      });
    }
    if (patch.games && typeof patch.games === 'object') {
      const prevGames = db.siteConfig.games || DEFAULT_SITE_CONFIG.games;
      const mergedEnabled = {
        ...(prevGames.enabled || {}),
        ...(patch.games.enabled && typeof patch.games.enabled === 'object' ? patch.games.enabled : {}),
      };
      db.siteConfig.games = sanitizeGamesConfig({
        ...prevGames,
        ...patch.games,
        enabled: mergedEnabled,
      });
    }
    if (patch.ui && typeof patch.ui === 'object') {
      db.siteConfig.ui = sanitizeUiConfig({
        ...(db.siteConfig.ui || {}),
        ...patch.ui,
      });
    }
    if (patch.botSettings && typeof patch.botSettings === 'object') {
      db.siteConfig.botSettings = sanitizeBotSettings({
        ...(db.siteConfig.botSettings || {}),
        ...patch.botSettings,
      });
    }
    if (body.auditAction) {
      logAudit(me.username, String(body.auditAction).slice(0, 200));
    }
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/accounts/airdrop') {
    const amount = Math.round(Number(body.amount) || 0);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
      return sendJson(res, 400, { ok: false, error: 'Airdrop amount must be between 1 and 1T.' });
    }
    const includeBanned = Boolean(body.includeBanned);
    let count = 0;
    for (const acc of Object.values(db.accounts)) {
      if (!acc || (!includeBanned && acc.banned)) continue;
      if (!acc.data) acc.data = createDefaultAccountData(0);
      acc.data.balance = Math.max(0, (acc.data.balance || 0) + amount);
      bumpAdminRevision(acc, 'airdrop');
      count++;
    }
    logAudit(me.username, `Airdropped +${formatGemsServer(amount)} gems to ${count} accounts`);
    if (body.announce) {
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-adm`,
        user: me.username,
        level: 99,
        text: `💎 ADMIN RAIN! Every player just received +${formatGemsServer(amount)} Gems!`,
        isUser: false,
        isAdmin: true,
        isBroadcast: true,
        isReal: true,
        time: Date.now(),
      };
      db.chat = [...db.chat.slice(-49), msg];
    }
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      count,
      accounts: sanitizeAccountsMap(db.accounts),
      chat: db.chat,
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/battles/clear-finished') {
    const before = db.battles.length;
    db.battles = db.battles.filter((b) => b.status !== 'finished');
    const removed = before - db.battles.length;
    logAudit(me.username, `Cleared ${removed} finished case battles`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      removed,
      battles: listBattles(),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/drops/clear') {
    db.drops = [];
    logAudit(me.username, 'Cleared Live Drops Ticker feed');
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      drops: [],
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/trades/approve-deposit') {
    const job = (db.tradeQueue || []).find((j) => j.id === body.jobId);
    if (!job || job.type !== 'deposit') return sendJson(res, 404, { ok: false, error: 'Deposit job not found.' });
    const gems = Math.round(Number(body.gems ?? job.amount) || 0);
    if (!completeDepositJob(job, gems, null, me.username)) {
      return sendJson(res, 400, { ok: false, error: 'Enter a valid gem amount (> 0).' });
    }
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      tradeQueue: db.tradeQueue,
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/trades/complete-withdraw') {
    const job = (db.tradeQueue || []).find((j) => j.id === body.jobId);
    if (!job || job.type !== 'withdraw') return sendJson(res, 404, { ok: false, error: 'Withdraw job not found.' });
    if (!completeWithdrawJob(job, null, me.username)) {
      return sendJson(res, 400, { ok: false, error: 'Could not mark withdraw complete.' });
    }
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      tradeQueue: db.tradeQueue,
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/trades/cancel') {
    const job = (db.tradeQueue || []).find((j) => j.id === body.jobId);
    if (!job) return sendJson(res, 404, { ok: false, error: 'Trade job not found.' });
    if (!cancelTradeJob(job, body.reason || 'Cancelled by admin', me.username)) {
      return sendJson(res, 400, { ok: false, error: 'Could not cancel trade job.' });
    }
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      tradeQueue: db.tradeQueue,
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/export-snapshot') {
    return sendJson(res, 200, {
      ok: true,
      exportedAt: Date.now(),
      accounts: sanitizeAccountsMap(db.accounts),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
      promoCodes: listPromoCodes(),
    });
  }

  if (pathname === '/api/admin/chat/broadcast') {
    const clean = String(body.text || '').trim().slice(0, 200);
    if (!clean) return sendJson(res, 400, { ok: false, error: 'Broadcast cannot be empty.' });
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-adm`,
      user: me.username,
      level: 99,
      text: clean,
      isUser: false,
      isAdmin: true,
      isBroadcast: true,
      isReal: true,
      time: Date.now(),
    };
    db.chat = [...db.chat.slice(-49), msg];
    logAudit(me.username, `Sent chat broadcast: "${clean}"`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      message: msg,
      chat: db.chat,
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/chat/clear') {
    db.chat = [];
    logAudit(me.username, 'Cleared Trollbox chat messages');
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      chat: [],
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/audit/clear') {
    db.siteConfig.auditLog = [];
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/promos/create') {
    const code = String(body.code || '').trim().toUpperCase();
    if (!PROMO_RE.test(code)) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Code must be 3–24 characters (A–Z, 0–9, _ or -).',
      });
    }
    if (db.promoCodes[code]) {
      return sendJson(res, 409, { ok: false, error: 'That promo code already exists.' });
    }
    const gems = Math.round(Number(body.gems) || 0);
    if (!Number.isFinite(gems) || gems < 1000 || gems > 1e13) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Gem reward must be between 1,000 and 10T.',
      });
    }
    const maxUses = Math.max(0, Math.round(Number(body.maxUses) || 0));
    const minLevel = Math.max(1, Math.round(Number(body.minLevel) || 1));
    const minWagered = Math.max(0, Math.round(Number(body.minWagered) || 0));

    const promo = {
      code,
      gems,
      maxUses,
      uses: 0,
      minLevel,
      minWagered,
      active: true,
      claimedBy: [],
      createdAt: Date.now(),
      createdBy: me.username,
    };
    db.promoCodes[code] = promo;
    logAudit(
      me.username,
      `Created promo code "${code}" (+${formatGemsServer(gems)}, maxUses: ${maxUses || 'unlimited'})`
    );

    if (body.announce) {
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-adm`,
        user: me.username,
        level: 99,
        text: buildPromoBroadcastText(promo),
        isUser: false,
        isAdmin: true,
        isBroadcast: true,
        isReal: true,
        time: Date.now(),
      };
      db.chat = [...db.chat.slice(-49), msg];
    }

    saveDb();
    return sendJson(res, 200, {
      ok: true,
      promo,
      promoCodes: listPromoCodes(),
      chat: db.chat,
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/promos/toggle') {
    const code = String(body.code || '').trim().toUpperCase();
    const promo = db.promoCodes?.[code];
    if (!promo) return sendJson(res, 404, { ok: false, error: 'Promo code not found.' });
    promo.active = Boolean(body.active);
    logAudit(me.username, `${promo.active ? 'Enabled' : 'Paused'} promo code "${code}"`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      promoCodes: listPromoCodes(),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/promos/delete') {
    const code = String(body.code || '').trim().toUpperCase();
    if (!db.promoCodes?.[code]) return sendJson(res, 404, { ok: false, error: 'Promo code not found.' });
    delete db.promoCodes[code];
    logAudit(me.username, `Deleted promo code "${code}"`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      promoCodes: listPromoCodes(),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/promos/announce') {
    const code = String(body.code || '').trim().toUpperCase();
    const promo = db.promoCodes?.[code];
    if (!promo) return sendJson(res, 404, { ok: false, error: 'Promo code not found.' });
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-adm`,
      user: me.username,
      level: 99,
      text: buildPromoBroadcastText(promo),
      isUser: false,
      isAdmin: true,
      isBroadcast: true,
      isReal: true,
      time: Date.now(),
    };
    db.chat = [...db.chat.slice(-49), msg];
    logAudit(me.username, `Announced promo code "${code}" in chat`);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      chat: db.chat,
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
    });
  }

  if (pathname === '/api/admin/restore-snapshot') {
    if (body.accounts && typeof body.accounts === 'object') {
      for (const [rawKey, entry] of Object.entries(body.accounts)) {
        const key = normalizeKey(rawKey);
        if (!key || !entry || !entry.data) continue;
        if (key === 'admin') {
          if (db.accounts.admin) {
            db.accounts.admin.data = sanitizeSyncData(entry.data, db.accounts.admin.data);
            db.accounts.admin.lastLoginAt = Date.now();
            db.restoredUsers.admin = true;
            bumpAdminRevision(db.accounts.admin, 'restore');
          }
          continue;
        }
        if (db.accounts[key]) {
          db.accounts[key].data = sanitizeSyncData(entry.data, db.accounts[key].data);
          bumpAdminRevision(db.accounts[key], 'restore');
        } else if (entry.username) {
          db.preservedProfiles[key] = {
            username: String(entry.username).trim() || key,
            role: entry.role === 'admin' ? 'admin' : 'user',
            banned: Boolean(entry.banned),
            banReason: String(entry.banReason || ''),
            adminRevision: Number(entry.adminRevision) || 1,
            createdAt: entry.createdAt || Date.now(),
            data: sanitizeSyncData(entry.data, createDefaultAccountData(0)),
          };
        }
      }
    }

    if (body.siteConfig && typeof body.siteConfig === 'object') {
      const cfg = body.siteConfig;
      if (cfg.startingBalance !== undefined) {
        db.siteConfig.startingBalance = Math.max(0, Math.min(1e13, Math.round(Number(cfg.startingBalance) || 0)));
      }
      if (cfg.allowDeposits !== undefined) db.siteConfig.allowDeposits = Boolean(cfg.allowDeposits);
      if (cfg.allowRegistration !== undefined) db.siteConfig.allowRegistration = Boolean(cfg.allowRegistration);
      if (cfg.maintenanceMode !== undefined) db.siteConfig.maintenanceMode = Boolean(cfg.maintenanceMode);
      if (cfg.chatEnabled !== undefined) db.siteConfig.chatEnabled = Boolean(cfg.chatEnabled);
      if (cfg.botsEnabled !== undefined) db.siteConfig.botsEnabled = Boolean(cfg.botsEnabled);
      if (cfg.banner && typeof cfg.banner === 'object') {
        db.siteConfig.banner = {
          text: String(cfg.banner.text || '').trim().slice(0, 180),
          tone: ['info', 'gold', 'danger'].includes(cfg.banner.tone) ? cfg.banner.tone : 'info',
        };
      }
      if (cfg.crateDiscountPct !== undefined) {
        db.siteConfig.crateDiscountPct = Math.min(80, Math.max(0, Math.round(Number(cfg.crateDiscountPct) || 0)));
      }
      if (cfg.cratePriceOverrides && typeof cfg.cratePriceOverrides === 'object') {
        db.siteConfig.cratePriceOverrides = { ...cfg.cratePriceOverrides };
      }
      if (Array.isArray(cfg.crateDisabledIds)) {
        db.siteConfig.crateDisabledIds = Array.from(new Set(cfg.crateDisabledIds.map((x) => String(x))));
      }
      if (cfg.branding && typeof cfg.branding === 'object') {
        db.siteConfig.branding = sanitizeBranding({ ...(db.siteConfig.branding || {}), ...cfg.branding });
      }
      if (cfg.theme && typeof cfg.theme === 'object') {
        db.siteConfig.theme = sanitizeTheme({ ...(db.siteConfig.theme || {}), ...cfg.theme });
      }
      if (cfg.games && typeof cfg.games === 'object') {
        db.siteConfig.games = sanitizeGamesConfig({ ...(db.siteConfig.games || {}), ...cfg.games });
      }
      if (cfg.ui && typeof cfg.ui === 'object') {
        db.siteConfig.ui = sanitizeUiConfig({ ...(db.siteConfig.ui || {}), ...cfg.ui });
      }
    }

    if (Array.isArray(body.promoCodes)) {
      for (const p of body.promoCodes) {
        const cleanCode = String(p?.code || '').trim().toUpperCase();
        if (!PROMO_RE.test(cleanCode)) continue;
        db.promoCodes[cleanCode] = { ...p, code: cleanCode };
      }
    }

    logAudit(me.username, 'Restored account balances and config snapshot');
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      accounts: sanitizeAccountsMap(db.accounts),
      preservedKeys: Object.keys(db.preservedProfiles || {}),
      siteConfig: sanitizeSiteConfig(db.siteConfig, true),
      promoCodes: listPromoCodes(),
      recoveryBlob: encryptRecoveryBlob(session.userKey, me),
    });
  }

  return sendJson(res, 404, { ok: false, error: 'Unknown admin API endpoint.' });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  let target = path.resolve(DIST_DIR, rel);
  if (!target.startsWith(DIST_DIR + path.sep) && target !== DIST_DIR) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let isFallback = false;
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    target = path.join(DIST_DIR, 'index.html');
    isFallback = true;
  }

  if (!fs.existsSync(target)) {
    res.writeHead(404);
    res.end('Build not found. Run npm run build first.');
    return;
  }

  const ext = path.extname(target).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl = isFallback || ext === '.html'
    ? 'no-cache'
    : decoded.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';

  const stat = fs.statSync(target);
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }
    serveStatic(req, res, pathname);
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: 'Internal server error.' });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PETFLIP 99 shared backend & SPA running at http://${HOST}:${PORT}`);
});
