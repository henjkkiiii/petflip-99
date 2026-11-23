export function rand() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return ((buf[0] >>> 5) * 0x4000000 + (buf[1] >>> 6)) / 0x20000000000000;
}

export function randInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(rand() * (hi - lo + 1)) + lo;
}

export function weightedPick(items, weightKey = 'chance') {
  if (!items || items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    total += Number(item[weightKey]) || 0;
  }
  if (total <= 0) return items[items.length - 1];

  let r = rand() * total;
  for (const item of items) {
    r -= Number(item[weightKey]) || 0;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export function crashPoint(edge = 0.05) {
  const r = rand();
  return Math.max(1, Math.floor(((1 - edge) * 100) / (1 - r)) / 100);
}

export function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
