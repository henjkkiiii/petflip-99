import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { useFeed } from '../store/feed.js';
import { GemAmount } from './GemAmount.jsx';

export function LiveBets() {
  const items = useFeed((s) => s.items);

  return (
    <div className="card live-bets-card">
      <div className="live-bets-header">
        <div className="live-bets-title">
          <span className="live-dot" />
          <Activity size={16} />
          <span>Live Gem Bets</span>
        </div>
        <span className="text-muted" style={{ fontSize: 12 }}>
          Real-time lobby activity
        </span>
      </div>

      <div className="live-bets-table-wrap">
        <table className="live-bets-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Game</th>
              <th>Bet</th>
              <th>Multiplier</th>
              <th style={{ textAlign: 'right' }}>Payout</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 20 }}>
                  No live bets yet — place a bet to appear here!
                </td>
              </tr>
            ) : (
              <AnimatePresence initial={false}>
                {items.slice(0, 15).map((item) => {
                const win = item.payout > item.amount || (item.payout > 0 && item.multiplier >= 1);
                return (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={item.isUser ? 'live-row-user' : ''}
                  >
                    <td>
                      <span className="live-user-pill">
                        <span className="mini-avatar">
                          {(item.user?.[0] || 'P').toUpperCase()}
                        </span>
                        {item.isUser && <span className="you-tag">YOU</span>}
                        {item.user}
                      </span>
                    </td>
                    <td>
                      <span className="game-tag">{item.game}</span>
                    </td>
                    <td>
                      <GemAmount value={item.amount} iconSize={14} />
                    </td>
                    <td>
                      <span
                        className={`mult-pill ${
                          item.multiplier >= 10
                            ? 'mult-gold'
                            : item.multiplier >= 1
                            ? 'mult-green'
                            : 'mult-red'
                        }`}
                      >
                        {item.multiplier.toFixed(2)}×
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={win ? 'text-green' : 'text-red'}>
                        <GemAmount
                          value={item.payout}
                          iconSize={14}
                          prefix={win ? '+' : ''}
                        />
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
