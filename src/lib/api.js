const TOKEN_KEY = 'petflip99_token_v1';
const CID_KEY = 'petflip99_cid_v1';
const RECOVERY_KEY = 'petflip99_recovery_v1';

let memoryToken = '';
let memoryRecoveryBlob = '';

export function getToken() {
  try {
    const stored = localStorage.getItem(TOKEN_KEY) || '';
    memoryToken = stored;
    return stored;
  } catch {
    return memoryToken;
  }
}

export function setToken(token) {
  memoryToken = token ? String(token) : '';
  try {
    if (memoryToken) localStorage.setItem(TOKEN_KEY, memoryToken);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage write failures; memoryToken remains active
  }
}

export function clearToken(expectedToken = '') {
  if (!expectedToken) {
    setToken('');
    return;
  }
  if (memoryToken === expectedToken) {
    memoryToken = '';
  }
  try {
    if (localStorage.getItem(TOKEN_KEY) === expectedToken) {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage removal failures
  }
}

export function getRecoveryBlob() {
  try {
    const stored = localStorage.getItem(RECOVERY_KEY) || '';
    memoryRecoveryBlob = stored;
    return stored;
  } catch {
    return memoryRecoveryBlob;
  }
}

export function setRecoveryBlob(blob) {
  if (!blob) return;
  const clean = String(blob);
  memoryRecoveryBlob = clean;
  try {
    localStorage.setItem(RECOVERY_KEY, clean);
  } catch {
    // Ignore storage write failures; memoryRecoveryBlob remains active
  }
}

export function clearRecoveryBlob() {
  memoryRecoveryBlob = '';
  try {
    localStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Ignore storage removal failures
  }
}

export function getClientId() {
  try {
    let cid = localStorage.getItem(CID_KEY);
    if (!cid) {
      cid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(CID_KEY, cid);
    }
    return cid;
  } catch {
    return 'anon';
  }
}

function buildHeaders(extra = {}) {
  const headers = {
    'X-Client-Id': getClientId(),
    ...extra,
  };
  const tok = getToken();
  if (tok) {
    headers.Authorization = `Bearer ${tok}`;
    headers['X-Session-Token'] = tok;
  }
  return headers;
}

export async function apiGet(path) {
  try {
    const res = await fetch(path, {
      method: 'GET',
      headers: buildHeaders(),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return { ok: false, status: res.status, error: 'Invalid server response.' };
    }
    return { ...data, status: res.status };
  } catch {
    return { ok: false, status: 0, error: 'Cannot reach game server.' };
  }
}

export async function apiPost(path, body = {}) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return { ok: false, status: res.status, error: 'Invalid server response.' };
    }
    return { ...data, status: res.status };
  } catch {
    return { ok: false, status: 0, error: 'Cannot reach game server.' };
  }
}
