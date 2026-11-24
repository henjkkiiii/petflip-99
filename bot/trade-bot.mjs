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

function checkGreenCount(rect) {
  if (!rect) return 0;
  const out = ps([
    '-Action',
    'check-green',
    '-X1',
    String(rect.x1),
    '-Y1',
    String(rect.y1),
    '-X2',
    String(rect.x2),
    '-Y2',
    String(rect.y2),
  ]);
  return Number(out) || 0;
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
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/o/g, '0')
    .replace(/[il]/g, '1');
}

function matchesUser(ocrText, robloxUsername) {
  const cleanOcr = normUser(ocrText);
  const cleanUser = normUser(robloxUsername);
  if (!cleanOcr || !cleanUser) return false;
  if (cleanOcr.includes(cleanUser)) return true;

  // Strict check: all real digits in the queued username must appear in order, and <= 2 char typos max
  const userDigits = String(robloxUsername || '').replace(/[^0-9]/g, '');
  const ocrDigits = String(ocrText || '').replace(/[^0-9]/g, '');
  if (userDigits && !ocrDigits.includes(userDigits)) return false;

  let qi = 0;
  for (let i = 0; i < cleanOcr.length && qi < cleanUser.length; i++) {
    if (cleanOcr[i] === cleanUser[qi]) qi++;
  }
  return cleanUser.length >= 6 && cleanUser.length - qi <= 2;
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

function isFairnessModal(msg) {
  return (
    msg.includes('are you sure') ||
    msg.includes('re you sure') ||
    msg.includes('trade is fair') ||
    msg.includes('before continuing') ||
    msg.includes('anything from this trade')
  );
}

function isCancelledModal(msg) {
  return msg.includes('cancelled') || msg.includes('canceled');
}

async function waitForConfirmButton(timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const modalText = ocrRect(coords.completedBox).toLowerCase();
    if (isCancelledModal(modalText)) {
      console.log('  Detected "cancelled the trade!" -> clicking Ok! & refunding.');
      if (coords.okPopupBtn) clickPoint(coords.okPopupBtn);
      return 'cancelled';
    }
    if (
      (modalText.includes('recently modified') || modalText.includes('verify offer')) &&
      coords.okPopupBtn
    ) {
      console.log('  Handling "Trade recently modified" -> clicking Ok! & retrying Ready!');
      clickPoint(coords.okPopupBtn);
      await sleep(1800);
      clickPoint(coords.readyBtn);
      await sleep(700);
      continue;
    }
    if (isFairnessModal(modalText) && coords.modalYesBtn) {
      console.log(`  Handling fairness/confirm popup ("${modalText}") -> clicking Yes!`);
      clickPoint(coords.modalYesBtn);
      await sleep(700);
      continue;
    }
    const btnText = ocrRect(coords.actionBtnBox).toLowerCase();
    if (btnText.includes('confirm') && !btnText.includes('unconfirm')) {
      return 'confirm';
    }
    await sleep(600);
  }
  return 'timeout';
}

async function waitForTradeCompleted(timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const msg = ocrRect(coords.completedBox).toLowerCase();
    if (isCancelledModal(msg)) {
      console.log('  Detected "cancelled the trade!" -> clicking Ok! & refunding.');
      if (coords.okPopupBtn) clickPoint(coords.okPopupBtn);
      return 'cancelled';
    }
    if (isFairnessModal(msg) && coords.modalYesBtn) {
      console.log(`  Handling fairness/confirm popup ("${msg}") -> clicking Yes!`);
      await sleep(250);
      clickPoint(coords.modalYesBtn);
      await sleep(900);
      continue;
    }
    if (msg.includes('completed') || msg.includes('successfully')) {
      console.log('  Verified "Trade successfully completed!" on screen -> clicking Ok!');
      if (coords.okPopupBtn) {
        await sleep(300);
        clickPoint(coords.okPopupBtn);
      }
      await sleep(900);
      const afterMsg = ocrRect(coords.completedBox).toLowerCase();
      if (afterMsg.includes('friend') && coords.friendNoBtn) {
        console.log('  Closing "Friend user?" popup -> No');
        clickPoint(coords.friendNoBtn);
      }
      return 'completed';
    }
    if (msg.includes('friend') && coords.friendNoBtn) {
      clickPoint(coords.friendNoBtn);
      return 'completed';
    }
    await sleep(600);
  }
  return 'timeout';
}

console.log('=== PETFLIP 99 Main-Monitor Trade Bot ===');
console.log(`Site: ${SITE_URL}`);
console.log(`Mode: ${AUTO_APPROVE ? 'AUTO-CONFIRM (--auto)' : 'SAFE TEST (asks Y/n before clicking Confirm)'}`);
console.log('Watching Trade Queue & Roblox Trade Window every 2s...\n');

let lastQueueSig = '';
let recentPopupJob = null;
let lastStockSync = 0;

async function syncHudGemsIfNeeded() {
  if (!coords.myHudGemsBox || Date.now() - lastStockSync < 15_000) return;
  lastStockSync = Date.now();
  const hudText = ocrRect(coords.myHudGemsBox);
  const gems = parseOcrGems(hudText);
  if (gems > 0) {
    await api('/api/bot/stock', 'POST', { gems }).catch(() => null);
  }
}

async function loop() {
  while (true) {
    try {
      await syncHudGemsIfNeeded();
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
              recentPopupJob = { id: popupMatch.id, ts: Date.now() };
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
        let match = jobs.find((j) => matchesUser(traderText, j.robloxUsername));
        if (
          !match &&
          recentPopupJob &&
          Date.now() - recentPopupJob.ts < 12_000 &&
          traderText.length >= 4
        ) {
          match = jobs.find((j) => j.id === recentPopupJob.id) || null;
        }
        if (match) recentPopupJob = null;

        if (match) {
          console.log(
            `\n[MATCH] ${match.type.toUpperCase()} for ${match.robloxUsername} (site: ${match.username}, req: ${match.amount})`
          );
          const claimRes = await api('/api/bot/claim', 'POST', { jobId: match.id });
          if (!claimRes?.ok) {
            console.log(`  [ABORT] Could not claim job (${claimRes?.error || 'cancelled'}) -> declining trade.`);
            clickPoint(coords.declineBtn);
            continue;
          }

          if (match.type === 'withdraw') {
            const wdPets = Array.isArray(match.pets) ? match.pets.slice(0, 12) : [];
            if (wdPets.length > 0 && coords.mySearchInputBtn && coords.myFirstPetSlot) {
              console.log(`  Adding ${wdPets.length} pet(s) to withdraw offer...`);
              for (const pet of wdPets) {
                typeAt(coords.mySearchInputBtn, pet.name);
                await sleep(450);
                clickPoint(coords.myFirstPetSlot);
                await sleep(350);
              }
            }
            if (match.amount > 0) {
              typeAt(coords.myGemInputBtn, String(match.amount));
              await sleep(450);
            }
            clickPoint(coords.readyBtn);
            console.log('  Clicked Ready! Waiting for other player to Ready up -> Confirm...');

            const confirmState = await waitForConfirmButton(25_000);
            if (confirmState !== 'confirm') {
              console.log(`  [${confirmState.toUpperCase()}] Stopping withdraw & refunding.`);
              if (confirmState === 'timeout') clickPoint(coords.declineBtn);
              await api('/api/bot/cancel', 'POST', {
                jobId: match.id,
                reason: confirmState === 'cancelled' ? 'Player cancelled trade' : 'Timed out waiting for Ready',
              });
              continue;
            }

            const ok = AUTO_APPROVE
              ? 'y'
              : (
                  await ask(
                    `Confirm button is active! Send ${match.amount.toLocaleString()} gems + ${wdPets.length} pet(s)? (y/N): `
                  )
                )
                  .trim()
                  .toLowerCase();

            if (ok === 'y' || ok === 'yes') {
              // Final server lock check right before clicking Confirm!
              const qCheck = await api('/api/bot/queue');
              const stillLocked = (qCheck?.jobs || []).some(
                (j) => j.id === match.id && j.status === 'processing'
              );
              if (!stillLocked) {
                console.log('  [ABORT] Job is no longer locked in processing -> declining trade.');
                clickPoint(coords.declineBtn);
                continue;
              }
              clickPoint(coords.confirmBtn);
              console.log('  Clicked Confirm! Verifying trade completion...');
              const doneState = await waitForTradeCompleted(25_000);
              if (doneState !== 'completed') {
                console.log(`  [${doneState.toUpperCase()}] Trade not completed -> refunding & stopping.`);
                await api('/api/bot/cancel', 'POST', {
                  jobId: match.id,
                  reason: doneState === 'cancelled' ? 'Player cancelled trade' : 'Trade did not complete',
                });
                continue;
              }
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
            // Deposit: STRICTLY wait until opponent clicks Ready! (green Ready! pixels OR OCR)
            console.log('  Waiting for opponent to finish adding items & click Ready!...');
            let opponentReady = false;
            let inGameCancelled = false;
            const waitStart = Date.now();
            while (Date.now() - waitStart < 45_000) {
              const modalText = ocrRect(coords.completedBox).toLowerCase();
              if (isCancelledModal(modalText)) {
                console.log('  Detected "cancelled the trade!" -> clicking Ok! & stopping.');
                if (coords.okPopupBtn) clickPoint(coords.okPopupBtn);
                inGameCancelled = true;
                break;
              }
              const greenPx = checkGreenCount(coords.theirReadyBox);
              const readyText = ocrRect(coords.theirReadyBox || coords.theirOfferBox).toLowerCase();
              console.log(`  [WAIT] greenPx=${greenPx}, readyText="${readyText}"`);
              if (greenPx >= 15 || readyText.includes('ready')) {
                opponentReady = true;
                break;
              }
              await sleep(600);
            }

            if (inGameCancelled || !opponentReady) {
              if (!inGameCancelled) {
                console.log('  [TIMEOUT] Opponent did not click Ready! in time -> Cancelling.');
                clickPoint(coords.declineBtn);
              }
              await api('/api/bot/cancel', 'POST', {
                jobId: match.id,
                reason: inGameCancelled ? 'Player cancelled trade' : 'Opponent did not Ready up',
              });
              continue;
            }

            // Wait 2.2s so PS99's (1.4) anti-scam timer finishes before clicking Ready!
            await sleep(2200);
            const rawGems = ocrRect(coords.theirGemsBox);
            let detectedGems = parseOcrGems(rawGems);
            const detectedTradeVal = coords.theirTradeValueBox
              ? parseOcrGems(ocrRect(coords.theirTradeValueBox))
              : detectedGems;
            const queuedPets = Array.isArray(match.pets) ? match.pets.slice(0, 12) : [];

            console.log(
              `  Opponent is READY! OCR Gems: "${rawGems}" -> ${detectedGems.toLocaleString()} | Trade Value: ${detectedTradeVal.toLocaleString()} | Queued Pets: ${queuedPets.length}/12`
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
            const confirmState = await waitForConfirmButton(25_000);
            if (confirmState !== 'confirm') {
              console.log(`  [${confirmState.toUpperCase()}] Stopping deposit.`);
              if (confirmState === 'timeout') clickPoint(coords.declineBtn);
              await api('/api/bot/cancel', 'POST', {
                jobId: match.id,
                reason: confirmState === 'cancelled' ? 'Player cancelled trade' : 'Timed out waiting for Confirm',
              });
              continue;
            }

            const recheckGems = parseOcrGems(ocrRect(coords.theirGemsBox));
            if (recheckGems > 0) finalGems = recheckGems;
            if (finalGems === 0 && match.amount > 0) {
              finalGems = match.amount;
            }

            clickPoint(coords.confirmBtn);
            console.log('  Clicked Confirm! Verifying trade completion...');
            const doneState = await waitForTradeCompleted(25_000);
            if (doneState !== 'completed') {
              console.log(`  [${doneState.toUpperCase()}] Stopping deposit (NOT crediting).`);
              await api('/api/bot/cancel', 'POST', {
                jobId: match.id,
                reason: doneState === 'cancelled' ? 'Player cancelled trade' : 'Trade did not complete',
              });
              continue;
            }
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
