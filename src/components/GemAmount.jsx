import React, { useEffect, useRef, useState } from 'react';
import { formatGems } from '../lib/format.js';
import { GemIcon } from './GemIcon.jsx';

export function GemAmount({
  value,
  animate = false,
  iconSize = 16,
  showIcon = true,
  flash = false,
  prefix = '',
  className = '',
}) {
  const [display, setDisplay] = useState(value);
  const [flashState, setFlashState] = useState(null); // 'up' | 'down' | null
  const prevRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;

    if (from === to) {
      setDisplay(to);
      return;
    }

    if (flash) {
      setFlashState(to > from ? 'up' : 'down');
      const timer = setTimeout(() => setFlashState(null), 700);
      if (!animate) {
        setDisplay(to);
        return () => clearTimeout(timer);
      }
    }

    if (!animate) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const duration = 420;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, animate, flash]);

  const flashClass =
    flashState === 'up'
      ? 'gem-flash-up'
      : flashState === 'down'
      ? 'gem-flash-down'
      : '';

  return (
    <span className={`gem-inline ${flashClass} ${className}`}>
      {showIcon && <GemIcon size={iconSize} />}
      <span>
        {prefix}
        {formatGems(display)}
      </span>
    </span>
  );
}
