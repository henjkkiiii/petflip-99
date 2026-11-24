import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.join(__dirname, 'win-helper.ps1');
const COORDS_PATH = path.join(__dirname, 'coords.json');

function waitForF8() {
  const out = execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', HELPER, '-Action', 'wait-f8'],
    { encoding: 'utf8' }
  ).trim();
  const [x, y] = out.split(',').map((n) => Math.round(Number(n)));
  return { x, y };
}

function capturePoint(label) {
  console.log(`\nHover your mouse over: ${label}`);
  console.log('  -> Press F8 (works even while Roblox is focused!)...');
  const pt = waitForF8();
  console.log(`  Saved (${pt.x}, ${pt.y})`);
  return pt;
}

function captureRect(label) {
  console.log(`\nHover your mouse at TOP-LEFT of: ${label}`);
  console.log('  -> Press F8...');
  const p1 = waitForF8();
  console.log(`  Top-left (${p1.x}, ${p1.y}) saved. Now hover BOTTOM-RIGHT -> Press F8...`);
  const p2 = waitForF8();
  console.log(`  Saved box (${p1.x},${p1.y}) -> (${p2.x},${p2.y})`);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

console.log('=== PETFLIP 99 Main-Monitor Trade Bot Calibration ===');
console.log('Keep Roblox open on your MAIN monitor with a test trade window open.');
console.log('You do NOT need to click back into PowerShell — just hover and press F8!\n');

const coords = {
  acceptPopupBtn: capturePoint('1) Incoming Trade "Accept" popup button'),
  traderNameBox: captureRect('2) Trader Username text area inside Trade Window'),
  theirGemsBox: captureRect('3) Opponent Diamonds/Gems number box (for Deposits)'),
  myGemInputBtn: capturePoint('4) Your Diamonds/Gems input box (for Withdraws)'),
  readyBtn: capturePoint('5) Your "Ready" button in Trade Window'),
  confirmBtn: capturePoint('6) Final "Confirm" button in Trade Window'),
  declineBtn: capturePoint('7) "Decline / Cancel" button in Trade Window'),
};

fs.writeFileSync(COORDS_PATH, JSON.stringify(coords, null, 2), 'utf8');
console.log(`\nCalibration saved to ${COORDS_PATH}!`);
console.log('Now run: npm run bot');
