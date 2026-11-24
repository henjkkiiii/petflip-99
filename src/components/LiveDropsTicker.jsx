import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useDrops } from '../store/drops.js';
import { PetImage } from './PetImage.jsx';
import { GemAmount } from './GemAmount.jsx';

export function LiveDropsTicker() {
  const drops = useDrops((s) => s.drops);
  const [hugesOnly, setHugesOnly] = useState(false);

  const visible = useMemo(() => {
    if (!hugesOnly) return drops;
    return drops.filter((d) =>
      ['huge', 'titanic', 'gargantuan'].includes(d.tier)
    );
  }, [drops, hugesOnly]);

  return (
    <div className="drops-ticker">
      <div className="drops-ticker-head">
        <div className="drops-live-title">
          <span className="live-dot" />
          <Sparkles size={13} className="text-gold" />
          <span>LIVE DROPS</span>
        </div>
        <div className="drops-filter-tabs">
          <button
            type="button"
            className={`drops-tab ${!hugesOnly ? 'active' : ''}`}
            onClick={() => setHugesOnly(false)}
          >
            All
          </button>
          <button
            type="button"
            className={`drops-tab ${hugesOnly ? 'active' : ''}`}
            onClick={() => setHugesOnly(true)}
          >
            Huges+
          </button>
        </div>
      </div>

      <div className="drops-ticker-strip">
        {visible.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 12, padding: '6px 10px' }}>
            No live drops yet — open a crate to appear here!
          </div>
        ) : (
          <AnimatePresence initial={false}>
          {visible.slice(0, 14).map((drop) => (
            <motion.div
              key={drop.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ flexShrink: 0 }}
            >
              <Link
                to={`/cases/${drop.crateId}`}
                className={`drop-chip drop-tier-${drop.tier || 'normal'} ${
                  drop.isUser ? 'drop-chip-user' : ''
                }`}
                title={`${drop.name} from ${drop.crateName}`}
              >
                <div className="drop-chip-img">
                  <PetImage thumb={drop.thumb} alt={drop.name} size={34} lazy={false} />
                </div>
                <div className="drop-chip-info">
                  <div className="drop-chip-name">{drop.name}</div>
                  <div className="drop-chip-meta">
                    <span className="drop-chip-user-name">
                      {drop.isUser && <span className="you-tag">YOU</span>}
                      {drop.user}
                    </span>
                    <GemAmount value={drop.value} iconSize={11} />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
