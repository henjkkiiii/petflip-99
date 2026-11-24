import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.join(__dirname, 'win-helper.ps1');
const COORDS_PATH = path.join(__dirname, 'coords.json');

function getCursor() {
  const out = execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', HELPER, '-Action', 'get-cursor'],
    { encoding: 'utf8' }
  ).trim();
  const [x, y] = out.split(',').map((n) => Math.round(Number(n)));
  return { x, y };
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function capturePoint(label) {
  await ask(`\nHover your mouse over: ${label}\nThen press ENTER...`);
  const pt = getCursor();
  console.log(`  Saved (${pt.x}, ${pt.y})`);
  return pt;
}

async function captureRect(label) {
  await ask(`\nHover your mouse at TOP-LEFT of: ${label}\nThen press ENTER...`);
  const p1 = getCursor();
  await ask(`Hover your mouse at BOTTOM-RIGHT of: ${label}\nThen press ENTER...`);
  const p2 = getCursor();
  console.log(`  Saved box (${p1.x},${p1.y}) -> (${p2.x},${p2.y})`);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

console.log('=== PETFLIP 99 Main-Monitor Trade Bot Calibration ===');
console.log('Keep Roblox open on your MAIN monitor with a test trade window open with your friend.');

const coords = {
  acceptPopupBtn: await capturePoint('1) Incoming Trade "Accept" popup button'),
  traderNameBox: await captureRect('2) Trader Username text area inside Trade Window'),
  theirGemsBox: await captureRect('3) Opponent Diamonds/Gems number box (for Deposits)'),
  myGemInputBtn: await capturePoint('4) Your Diamonds/Gems input box (for Withdraws)'),
  readyBtn: await capturePoint('5) Your "Ready" button in Trade Window'),
  confirmBtn: await capturePoint('6) Final "Confirm" button in Trade Window'),
  declineBtn: await capturePoint('7) "Decline / Cancel" button in Trade Window'),
};

fs.writeFileSync(COORDS_PATH, JSON.stringify(coords, null, 2), 'utf8');
console.log(`\nCalibration saved to ${COORDS_PATH}!`);
console.log('Now run: npm run bot');
rl.close();
