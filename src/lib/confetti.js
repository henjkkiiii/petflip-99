import confetti from 'canvas-confetti';

export function fireConfetti(big = false) {
  try {
    confetti({
      particleCount: big ? 110 : 55,
      spread: big ? 85 : 60,
      origin: { y: 0.62 },
      colors: ['#3ee0ff', '#9b5cff', '#ffcc33', '#34d17a', '#ff58d6'],
    });
  } catch {
    // ignore in environments without canvas support
  }
}
