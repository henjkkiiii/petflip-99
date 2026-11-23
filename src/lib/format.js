export function formatGems(n) {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  const units = [
    { v: 1e12, s: 'T' },
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'K' },
  ];

  for (const { v, s } of units) {
    if (abs >= v) {
      const scaled = abs / v;
      const formatted = scaled
        .toFixed(2)
        .replace(/\.00$/, '')
        .replace(/(\.\d)0$/, '$1');
      return `${sign}${formatted}${s}`;
    }
  }

  return `${sign}${Math.round(abs).toLocaleString('en-US')}`;
}

export function formatGemsFull(n) {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

export function parseGems(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input) : NaN;
  }
  if (typeof input !== 'string') return NaN;
  const cleaned = input.replace(/,/g, '').trim();
  if (!cleaned) return NaN;

  const match = cleaned.match(/^(\d+(?:\.\d+)?|\.\d+)\s*([kmbt])?$/i);
  if (!match) return NaN;

  const num = Number(match[1]);
  if (!Number.isFinite(num)) return NaN;

  const suffix = (match[2] || '').toLowerCase();
  const mult =
    suffix === 'k'
      ? 1e3
      : suffix === 'm'
      ? 1e6
      : suffix === 'b'
      ? 1e9
      : suffix === 't'
      ? 1e12
      : 1;

  return Math.round(num * mult);
}
