import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.join(__dirname, 'win-helper.ps1');
const COORDS_PATH = path.join(__dirname, 'coords.json');

const SITE_URL = (process.env.SITE_URL || 'https://petflip-99-t791.onrender.com').replace(/\/+$/, '');
const BOT_API_KEY = process.env.BOT_API_KEY || 'pf99-trade-bot-key-2026';
const AUTO_APPROVE = process.argv.includes('--auto');

if (!fs.existsSync(COORDS_PATH)) {
  console.error('Missing bot/coords.json! Run "npm run bot:calibrate" first.');
  process.exit(1);
}
const coords = JSON.parse(fs.readFileSync(COORDS_PATH, 'utf8'));

function ps(args) {
  return execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', HELPER, ...args],
    { encoding: 'utf8' }
  ).trim();
}

function ocrRect(rect) {
  return ps([
    '-Action',
    'ocr-rect',
    '-X1',
    String(rect.x1),
    '-Y1',
    String(rect.y1),
    '-X2',
    String(rect.x2),
    '-Y2',
    String(rect.y2),
  ]);
}

function clickPoint(pt) {
  ps(['-Action', 'click', '-X1', String(pt.x), '-Y1', String(pt.y)]);
}

function typeAt(pt, text) {
  ps(['-Action', 'type-text', '-X1', String(pt.x), '-Y1', String(pt.y), '-Text', String(text)]);
}

function parseOcrGems(text) {
  const clean = String(text || '').replace(/,/g, '').replace(/\s+/g, '');
  const m = clean.match(/(\d+(?:\.\d+)?)\s*([TBMK])?/i);
  if (!m) return 0;
  const num = Number(m[1]);
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(num * mult);
}

async function api(pathSuffix, method = 'GET', body = null) {
  const res = await fetch(`${SITE_URL}${pathSuffix}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-bot-key': BOT_API_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

console.log(`=== PETFLIP 99 Main-Monitor Trade Bot ===`);
console.log(`Site: ${SITE_URL}`);
console.log(`Mode: ${AUTO_APPROVE ? 'AUTO-CONFIRM (--auto)' : 'SAFE TEST (asks Y/n before clicking Confirm)'}`);
console.log('Watching Trade Queue every 2.5s...\n');

async function loop() {
  while (true) {
    try {
      const q = await api('/api/bot/queue');
      const jobs = q?.jobs || [];
      if (jobs.length > 0) {
        const traderText = ocrRect(coords.traderNameBox).toLowerCase();
        const match = jobs.find(
          (j) =>
            j.robloxUsername &&
            traderText.includes(j.robloxUsername.toLowerCase())
        );

        if (match) {
          console.log(
            `\n[MATCH] ${match.type.toUpperCase()} for ${match.robloxUsername} (site: ${match.username}, req: ${match.amount})`
          );
          await api('/api/bot/claim', 'POST', { jobId: match.id });

          if (match.type === 'withdraw') {
            typeAt(coords.myGemInputBtn, String(match.amount));
            await new Promise((r) => setTimeout(r, 400));
            clickPoint(coords.readyBtn);
            const ok = AUTO_APPROVE
              ? 'y'
              : (await ask(`Typed ${match.amount} gems & clicked Ready. Click Confirm & mark sent? (y/N): `)).trim().toLowerCase();

            if (ok === 'y' || ok === 'yes') {
              clickPoint(coords.confirmBtn);
              await new Promise((r) => setTimeout(r, 1500));
              await api('/api/bot/withdraw-complete', 'POST', {
                jobId: match.id,
                txId: `wd-${match.id}-${Date.now()}`,
              });
              console.log(`  [DONE] Withdraw marked sent!`);
            } else {
              clickPoint(coords.declineBtn);
              await api('/api/bot/cancel', 'POST', { jobId: match.id, reason: 'Operator declined' });
              console.log(`  [CANCELLED] Refunded withdraw.`);
            }
          } else {
            const rawGems = ocrRect(coords.theirGemsBox);
            const detectedGems = parseOcrGems(rawGems);
            console.log(`  OCR saw opponent gems: "${rawGems}" -> ${detectedGems.toLocaleString()}`);
            let finalGems = detectedGems || match.amount;
            if (!AUTO_APPROVE) {
              const ans = (await ask(`Credit how many gems? (Enter for ${finalGems}, or type number, or 'n' to decline): `)).trim();
              if (ans.toLowerCase() === 'n') {
                clickPoint(coords.declineBtn);
                await api('/api/bot/cancel', 'POST', { jobId: match.id, reason: 'Operator declined' });
                continue;
              }
              if (ans) finalGems = parseOcrGems(ans);
            }
            clickPoint(coords.readyBtn);
            await new Promise((r) => setTimeout(r, 800));
            clickPoint(coords.confirmBtn);
            await new Promise((r) => setTimeout(r, 1500));
            await api('/api/bot/deposit-complete', 'POST', {
              jobId: match.id,
              gems: finalGems,
              txId: `dep-${match.id}-${Date.now()}`,
            });
            console.log(`  [DONE] Credited +${finalGems.toLocaleString()} gems!`);
          }
        }
      }
    } catch (err) {
      console.error('Bot loop error:', err.message);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
}

loop();
