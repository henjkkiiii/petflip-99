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
  if (!rect) return '';
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
  if (!pt) return;
  ps(['-Action', 'click', '-X1', String(pt.x), '-Y1', String(pt.y)]);
}

function typeAt(pt, text) {
  if (!pt) return;
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

function normUser(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesUser(ocrText, robloxUsername) {
  const cleanOcr = normUser(ocrText);
  const cleanUser = normUser(robloxUsername);
  if (!cleanOcr || !cleanUser) return false;
  return cleanOcr.includes(cleanUser);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function waitForConfirmButton(timeoutMs = 35_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const modalText = ocrRect(coords.completedBox).toLowerCase();
    if (
      (modalText.includes('are you sure') || modalText.includes('anything from this trade')) &&
      coords.modalYesBtn
    ) {
      console.log('  Handling "Are you sure?" popup -> clicking Yes!');
      clickPoint(coords.modalYesBtn);
      await sleep(700);
      continue;
    }
    const btnText = ocrRect(coords.actionBtnBox).toLowerCase();
    if (btnText.includes('confirm') && !btnText.includes('unconfirm')) {
      return true;
    }
    await sleep(600);
  }
  return false;
}

async function waitForTradeCompleted(timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const msg = ocrRect(coords.completedBox).toLowerCase();
    if (msg.includes('are you sure') || msg.includes('anything from this trade')) {
      if (coords.modalYesBtn) {
        console.log('  Handling "Are you sure?" popup -> clicking Yes!');
        await sleep(250);
        clickPoint(coords.modalYesBtn);
        await sleep(900);
        continue;
      }
    }
    if (msg.includes('completed') || msg.includes('successfully')) {
      if (coords.okPopupBtn) {
        await sleep(300);
        clickPoint(coords.okPopupBtn);
      }
      await sleep(800);
      const afterMsg = ocrRect(coords.completedBox).toLowerCase();
      if (afterMsg.includes('friend') && coords.friendNoBtn) {
        console.log('  Closing "Friend user?" popup -> No');
        clickPoint(coords.friendNoBtn);
      }
      return true;
    }
    if (msg.includes('friend') && coords.friendNoBtn) {
      clickPoint(coords.friendNoBtn);
      return true;
    }
    await sleep(700);
  }
  return false;
}

console.log('=== PETFLIP 99 Main-Monitor Trade Bot ===');
console.log(`Site: ${SITE_URL}`);
console.log(`Mode: ${AUTO_APPROVE ? 'AUTO-CONFIRM (--auto)' : 'SAFE TEST (asks Y/n before clicking Confirm)'}`);
console.log('Watching Trade Queue & Roblox Trade Window every 2s...\n');

let lastQueueSig = '';

async function loop() {
  while (true) {
    try {
      const q = await api('/api/bot/queue');
      const jobs = q?.jobs || [];
      const sig = jobs.map((j) => `${j.id}:${j.status}`).join('|');
      if (sig !== lastQueueSig) {
        lastQueueSig = sig;
        if (jobs.length === 0) {
          console.log('[QUEUE] Empty — waiting for new deposit/withdraw requests...');
        } else {
          console.log(
            `[QUEUE] ${jobs.length} active job(s): ` +
              jobs.map((j) => `${j.type.toUpperCase()} ${j.robloxUsername} (${j.amount})`).join(', ')
          );
        }
      }

      if (jobs.length > 0) {
        // 1) Check if an incoming trade popup ("Trade from @username") is visible at the top
        if (coords.popupBox && coords.acceptPopupBtn) {
          const popupText = ocrRect(coords.popupBox);
          if (popupText) {
            const popupMatch = jobs.find((j) => matchesUser(popupText, j.robloxUsername));
            if (popupMatch) {
              console.log(`[POPUP] Matched "${popupText}" -> clicking Yes! for ${popupMatch.robloxUsername}`);
              clickPoint(coords.acceptPopupBtn);
              await sleep(1200);
            }
          }
        }

        // 2) Check if a trade window is open with a queued player
        const traderText = ocrRect(coords.traderNameBox);
        if (traderText) {
          console.log(`[OCR] Trader box: "${traderText}"`);
        }
        const match = jobs.find((j) => matchesUser(traderText, j.robloxUsername));

        if (match) {
          console.log(
            `\n[MATCH] ${match.type.toUpperCase()} for ${match.robloxUsername} (site: ${match.username}, req: ${match.amount})`
          );
          await api('/api/bot/claim', 'POST', { jobId: match.id });

          if (match.type === 'withdraw') {
            typeAt(coords.myGemInputBtn, String(match.amount));
            await sleep(450);
            clickPoint(coords.readyBtn);
            console.log('  Clicked Ready! Waiting for other player to Ready up -> Confirm...');

            const confirmAppeared = await waitForConfirmButton(35_000);
            if (!confirmAppeared) {
              console.log('  [TIMEOUT] Other player did not Ready up in time -> Cancelling.');
              clickPoint(coords.declineBtn);
              await api('/api/bot/cancel', 'POST', { jobId: match.id, reason: 'Timed out waiting for Ready' });
              continue;
            }

            const ok = AUTO_APPROVE
              ? 'y'
              : (await ask(`Confirm button is active! Send ${match.amount.toLocaleString()} gems? (y/N): `))
                  .trim()
                  .toLowerCase();

            if (ok === 'y' || ok === 'yes') {
              clickPoint(coords.confirmBtn);
              console.log('  Clicked Confirm! Waiting for trade completion...');
              await waitForTradeCompleted(15_000);
              await api('/api/bot/withdraw-complete', 'POST', {
                jobId: match.id,
                txId: `wd-${match.id}-${Date.now()}`,
              });
              console.log('  [DONE] Withdraw marked sent!');
            } else {
              clickPoint(coords.declineBtn);
              await api('/api/bot/cancel', 'POST', { jobId: match.id, reason: 'Operator declined' });
              console.log('  [CANCELLED] Refunded withdraw.');
            }
          } else {
            // Deposit: WAIT until opponent adds gems/pets or clicks Ready! (never rush while 0)
            console.log('  Waiting for opponent to add gems/pets or Ready up...');
            let detectedGems = 0;
            let detectedTradeVal = 0;
            let opponentReady = false;
            const waitStart = Date.now();
            while (Date.now() - waitStart < 60_000) {
              detectedGems = parseOcrGems(ocrRect(coords.theirGemsBox));
              detectedTradeVal = coords.theirTradeValueBox
                ? parseOcrGems(ocrRect(coords.theirTradeValueBox))
                : 0;
              const offerText = coords.theirOfferBox ? ocrRect(coords.theirOfferBox).toLowerCase() : '';
              opponentReady = offerText.includes('ready');
              if (opponentReady || detectedGems > 0 || detectedTradeVal > 0) {
                break;
              }
              await sleep(800);
            }

            // Give 1.8s for PS99's (1.4) anti-scam timer & final item updates to settle
            await sleep(1800);
            const rawGems = ocrRect(coords.theirGemsBox);
            detectedGems = parseOcrGems(rawGems);
            detectedTradeVal = coords.theirTradeValueBox
              ? parseOcrGems(ocrRect(coords.theirTradeValueBox))
              : detectedGems;
            const queuedPets = Array.isArray(match.pets) ? match.pets.slice(0, 12) : [];

            console.log(
              `  OCR saw Gems: "${rawGems}" -> ${detectedGems.toLocaleString()} | Trade Value: ${detectedTradeVal.toLocaleString()} | Queued Pets: ${queuedPets.length}/12`
            );

            let finalGems = detectedGems;
            if (!AUTO_APPROVE) {
              const ans = (
                await ask(
                  `Accept & credit ${finalGems.toLocaleString()} gems + ${queuedPets.length} queued pet(s)? (Enter=yes, number=override gems, 'n'=decline): `
                )
              ).trim();
              if (ans.toLowerCase() === 'n') {
                clickPoint(coords.declineBtn);
                await api('/api/bot/cancel', 'POST', { jobId: match.id, reason: 'Operator declined' });
                continue;
              }
              if (ans) finalGems = parseOcrGems(ans);
            }

            clickPoint(coords.readyBtn);
            console.log('  Clicked Ready! Waiting for other player to Ready up -> Confirm...');
            const confirmAppeared = await waitForConfirmButton(35_000);
            if (!confirmAppeared) {
              console.log('  [TIMEOUT] Other player did not Ready up -> Cancelling.');
              clickPoint(coords.declineBtn);
              await api('/api/bot/cancel', 'POST', { jobId: match.id, reason: 'Timed out waiting for Ready' });
              continue;
            }

            const recheckGems = parseOcrGems(ocrRect(coords.theirGemsBox));
            if (recheckGems > 0) finalGems = recheckGems;

            clickPoint(coords.confirmBtn);
            console.log('  Clicked Confirm! Waiting for trade completion...');
            await waitForTradeCompleted(15_000);
            await api('/api/bot/deposit-complete', 'POST', {
              jobId: match.id,
              gems: finalGems,
              pets: queuedPets,
              txId: `dep-${match.id}-${Date.now()}`,
            });
            console.log(
              `  [DONE] Credited +${finalGems.toLocaleString()} gems & +${queuedPets.length} pet(s) to inventory!`
            );
          }
        }
      }
    } catch (err) {
      console.error('Bot loop error:', err.message);
    }
    await sleep(2000);
  }
}

loop();
