let ctx = null;
let masterGain = null;
let isMutedFn = () => false;

const buffers = {};
let lastTickAt = 0;
let lastPegAt = 0;
let lastTeaseAt = 0;

const SFX_FILES = {
  click: '/sfx/click.ogg',
  tick: '/sfx/tick.ogg',
  peg: '/sfx/peg.ogg',
  flip: '/sfx/flip.ogg',
  gem: '/sfx/gem.ogg',
  open: '/sfx/open.ogg',
  reveal: '/sfx/reveal.ogg',
  win: '/sfx/win.ogg',
  lose: '/sfx/lose.ogg',
  cashout: '/sfx/cashout.ogg',
  coins: '/sfx/coins.ogg',
  deal: '/sfx/deal.ogg',
  explode: '/sfx/explode.ogg',
  'boom-low': '/sfx/boom-low.ogg',
  bigwin: '/sfx/bigwin.wav',
};

export function setMutedGetter(fn) {
  isMutedFn = fn;
}

function initAudio() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(ctx.destination);

    // Preload and decode all CC0 samples
    Object.entries(SFX_FILES).forEach(([key, url]) => {
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((arr) => ctx.decodeAudioData(arr))
        .then((decoded) => {
          buffers[key] = decoded;
        })
        .catch(() => {
          // Ignore individual sample load/decode failures
        });
    });

    const unlock = () => {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  } catch {
    ctx = null;
  }
}

initAudio();

function play(name, { volume = 1, rate = 1, jitter = 0, delay = 0 } = {}) {
  if (isMutedFn() || !ctx || !masterGain) return;
  const buffer = buffers[name];
  if (!buffer) return;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);

    const gain = ctx.createGain();
    gain.gain.value = volume;

    src.connect(gain);
    gain.connect(masterGain);
    src.start(ctx.currentTime + delay);
  } catch {
    // Ignore playback errors
  }
}

export const sound = {
  click() {
    play('click', { volume: 0.5 });
  },
  tick(rate = 1) {
    const now = performance.now();
    if (now - lastTickAt < 28) return;
    lastTickAt = now;
    play('tick', { volume: 0.35, rate, jitter: 0.03 });
  },
  tease() {
    const now = performance.now();
    if (now - lastTeaseAt < 120) return;
    lastTeaseAt = now;
    play('gem', { volume: 0.25, rate: 1.35 });
  },
  peg() {
    const now = performance.now();
    if (now - lastPegAt < 25) return;
    lastPegAt = now;
    play('peg', { volume: 0.25, jitter: 0.08 });
  },
  flip() {
    play('flip', { volume: 0.5 });
  },
  gem() {
    play('gem', { volume: 0.55, jitter: 0.04 });
  },
  open() {
    play('open', { volume: 0.6 });
  },
  reveal() {
    play('reveal', { volume: 0.6 });
  },
  win() {
    play('win', { volume: 0.6 });
    play('coins', { volume: 0.5, delay: 0.08 });
  },
  bigWin() {
    play('bigwin', { volume: 0.7 });
    play('coins', { volume: 0.6 });
  },
  lose() {
    play('lose', { volume: 0.45 });
  },
  cashout() {
    play('cashout', { volume: 0.7 });
  },
  explode() {
    play('explode', { volume: 0.8 });
    play('boom-low', { volume: 0.6 });
  },
  deal() {
    play('deal', { volume: 0.6, jitter: 0.06 });
  },
  coin() {
    play('coins', { volume: 0.6 });
  },
};
