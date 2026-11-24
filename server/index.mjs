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
const INITIAL_ADMIN_BALANCE = 100_000_000;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const PROMO_RE = /^[A-Z0-9_-]{3,24}$/;

function formatGemsServer(n) {
  const abs = Math.abs(Number(n) || 0);
  for (const [v, s] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (abs >= v) {
      return `${(abs / v).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}${s}`;
    }
  }
  return Math.round(abs).toLocaleString('en-US');
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

function sanitizeSiteConfig(cfg, isAdmin) {
  const merged = {
    ...DEFAULT_SITE_CONFIG,
    ...(cfg || {}),
    banner: {
      text: String(cfg?.banner?.text || ''),
      tone: ['info', 'gold', 'danger'].includes(cfg?.banner?.tone) ? cfg.banner.tone : 'info',
    },
    cratePriceOverrides: { ...(cfg?.cratePriceOverrides || {}) },
  };
  merged.auditLog = isAdmin && Array.isArray(cfg?.auditLog) ? cfg.auditLog.slice(0, 100) : [];
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
  if (!db.promoCodes || typeof db.promoCodes !== 'object') db.promoCodes = {};
  if (!Array.isArray(db.chat)) db.chat = [];
  if (!Array.isArray(db.drops)) db.drops = [];
  db.siteConfig = {
    ...DEFAULT_SITE_CONFIG,
    ...(db.siteConfig || {}),
    banner: {
      text: String(db.siteConfig?.banner?.text || ''),
      tone: ['info', 'gold', 'danger'].includes(db.siteConfig?.banner?.tone)
        ? db.siteConfig.banner.tone
        : 'info',
    },
    cratePriceOverrides: { ...(db.siteConfig?.cratePriceOverrides || {}) },
    auditLog: Array.isArray(db.siteConfig?.auditLog) ? db.siteConfig.auditLog.slice(0, 100) : [],
  };

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

function bumpAdminRevision(acc) {
  acc.adminRevision = (Number(acc.adminRevision) || 1) + 1;
}

function createSession(userKey) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { userKey, createdAt: Date.now() };
  // Prune expired sessions
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [tok, sess] of Object.entries(db.sessions)) {
    if (!sess || (sess.createdAt || 0) < cutoff) {
      delete db.sessions[tok];
    }
  }
  return token;
}

function purgeUserSessions(userKey) {
  for (const [tok, sess] of Object.entries(db.sessions)) {
    if (sess?.userKey === userKey) {
      delete db.sessions[tok];
    }
  }
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function getSessionAccount(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const sess = db.sessions[token];
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

function sendJson(res, status, payload) {
  const json = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
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

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  const session = getSessionAccount(req);
  const me = session?.account || null;
  const isAdmin = me?.role === 'admin';

  if (req.method === 'GET' && pathname === '/api/state') {
    const cid = String(req.headers['x-client-id'] || '');
    const now = Date.now();
    if (cid) activeClients.set(cid, now);
    for (const [k, ts] of activeClients.entries()) {
      if (now - ts > 20_000) activeClients.delete(k);
    }

    return sendJson(res, 200, {
      ok: true,
      siteConfig: sanitizeSiteConfig(db.siteConfig, isAdmin),
      me: sanitizeAccount(me),
      userKey: session?.userKey || null,
      chat: db.chat.slice(-50),
      drops: db.drops.slice(0, 24),
      accounts: isAdmin ? sanitizeAccountsMap(db.accounts) : null,
      promoCodes: isAdmin ? listPromoCodes() : null,
      onlineClients: activeClients.size,
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
    const account = {
      username: rawName,
      passwordHash,
      salt,
      role: 'user',
      banned: false,
      banReason: '',
      adminRevision: 1,
      createdAt: now,
      lastLoginAt: now,
      data: createDefaultAccountData(db.siteConfig.startingBalance ?? 500_000),
    };
    db.accounts[key] = account;
    const token = createSession(key);
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      token,
      userKey: key,
      account: sanitizeAccount(account),
      siteConfig: sanitizeSiteConfig(db.siteConfig, false),
    });
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
    const token = createSession(key);
    saveDb();

    const accIsAdmin = account.role === 'admin';
    return sendJson(res, 200, {
      ok: true,
      token,
      userKey: key,
      account: sanitizeAccount(account),
      siteConfig: sanitizeSiteConfig(db.siteConfig, accIsAdmin),
      accounts: accIsAdmin ? sanitizeAccountsMap(db.accounts) : null,
      promoCodes: accIsAdmin ? listPromoCodes() : null,
    });
  }

  if (pathname === '/api/auth/logout') {
    const tok = getBearerToken(req);
    if (tok && db.sessions[tok]) {
      delete db.sessions[tok];
      saveDb();
    }
    return sendJson(res, 200, { ok: true });
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
      });
    }
    me.data = sanitizeSyncData(body.data, me.data);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      adminRevision: me.adminRevision,
    });
  }

  if (pathname === '/api/account/reset') {
    const startBal = isAdmin ? INITIAL_ADMIN_BALANCE : (db.siteConfig.startingBalance ?? 500_000);
    me.data = createDefaultAccountData(startBal);
    bumpAdminRevision(me);
    saveDb();
    return sendJson(res, 200, {
      ok: true,
      account: sanitizeAccount(me),
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
    bumpAdminRevision(me);
    saveDb();

    return sendJson(res, 200, {
      ok: true,
      code: promo.code,
      gems: promo.gems,
      account: sanitizeAccount(me),
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
      db.siteConfig.crateDiscountPct = Math.min(50, Math.max(0, Math.round(Number(patch.crateDiscountPct) || 0)));
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
    if (patch.resetCratePricing) {
      db.siteConfig.crateDiscountPct = 0;
      db.siteConfig.cratePriceOverrides = {};
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
