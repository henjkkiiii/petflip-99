import React from 'react';
import { GEM } from '../lib/assets.js';

export function GemIcon({ size = 18, className = '' }) {
  return (
    <img
      src={GEM}
      alt="Gem"
      className={`gem-icon ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
