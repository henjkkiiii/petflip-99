const TOKEN_KEY = 'petflip99_token_v1';
const CID_KEY = 'petflip99_cid_v1';

let memoryToken = '';

export function getToken() {
  if (memoryToken) return memoryToken;
  try {
    const stored = localStorage.getItem(TOKEN_KEY) || '';
    if (stored) memoryToken = stored;
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

export function clearToken() {
  setToken('');
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
