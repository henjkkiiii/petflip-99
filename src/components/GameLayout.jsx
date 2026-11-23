import React from 'react';
import { LiveBets } from './LiveBets.jsx';

export function GameLayout({ title, subtitle, icon, controls, board, extra }) {
  return (
    <div className="game-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {icon}
            <span>{title}</span>
          </h1>
          {subtitle && <div className="text-muted" style={{ fontSize: 13.5, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>

      <div className="game-layout card">
        <div className="game-controls">{controls}</div>
        <div className="game-board">{board}</div>
      </div>

      {extra}

      <div style={{ marginTop: 24 }}>
        <LiveBets />
      </div>
    </div>
  );
}
