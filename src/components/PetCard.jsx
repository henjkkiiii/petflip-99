import React from 'react';
import { PetImage } from './PetImage.jsx';
import { GemAmount } from './GemAmount.jsx';

export function PetCard({
  pet,
  showChance = false,
  actionLabel = null,
  onAction = null,
  selected = false,
  compact = false,
  onClick = null,
}) {
  const tier = pet.tier || 'normal';

  return (
    <div
      className={`tier-frame tier-${tier} pet-card-outer ${onClick ? 'clickable' : ''} ${
        selected ? 'pet-card-selected' : ''
      }`}
      onClick={onClick}
    >
      <div className={`pet-card-inner ${compact ? 'compact' : ''}`}>
        <div className="pet-card-top">
          <span className={`tier-badge tier-badge-${tier}`}>{tier}</span>
          {showChance && pet.chance != null && (
            <span className="pet-chance">
              {pet.chance < 0.1 ? pet.chance.toFixed(2) : Number(pet.chance.toFixed(2))}%
            </span>
          )}
        </div>

        <div className="pet-card-img-wrap">
          <PetImage thumb={pet.thumb} alt={pet.name} size={compact ? 62 : 84} />
        </div>

        <div className="pet-card-name" title={pet.name}>
          {pet.name}
        </div>

        <div className="pet-card-val">
          <GemAmount value={pet.value} iconSize={14} />
        </div>

        {actionLabel && onAction && (
          <button
            type="button"
            className="btn btn-sm btn-green pet-card-action"
            onClick={(e) => {
              e.stopPropagation();
              onAction(pet);
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
