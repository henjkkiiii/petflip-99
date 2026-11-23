import React, { useState } from 'react';
import { img } from '../lib/assets.js';

export function PetImage({ thumb, alt, size = 72, className = '', lazy = true }) {
  const [failed, setFailed] = useState(false);

  if (!thumb || failed) {
    return (
      <div
        className={`pet-fallback ${className}`}
        style={{
          width: size,
          height: size,
          display: 'grid',
          placeItems: 'center',
          fontSize: Math.max(18, Math.round(size * 0.45)),
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 12,
        }}
        title={alt}
      >
        🐾
      </div>
    );
  }

  return (
    <img
      src={img(thumb)}
      alt={alt}
      loading={lazy ? 'lazy' : undefined}
      onError={() => setFailed(true)}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        userSelect: 'none',
      }}
      draggable={false}
    />
  );
}
