import confetti from 'canvas-confetti';

export function fireConfetti(big = false) {
  try {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    confetti({
      particleCount: isMobile ? (big ? 42 : 22) : (big ? 90 : 45),
      spread: isMobile ? (big ? 68 : 50) : (big ? 85 : 60),
      ticks: isMobile ? 110 : 160,
      origin: { y: 0.62 },
      disableForReducedMotion: true,
      colors: ['#3ee0ff', '#9b5cff', '#ffcc33', '#34d17a', '#ff58d6'],
    });
  } catch {
    // ignore in environments without canvas support
  }
}
