import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Swords, Trash2, Users } from 'lucide-react';
import ps99 from '../data/ps99.json';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { useBattles } from '../store/battles.js';
import { useGame } from '../store/useGame.js';
import { getEffectiveCratePrice, useSiteConfig } from '../store/siteConfig.js';
import { useToast } from '../store/toast.js';
import { PetImage } from '../components/PetImage.jsx';
import { GemAmount } from '../components/GemAmount.jsx';
import { Modal } from '../components/Modal.jsx';

export function Battles() {
  const navigate = useNavigate();
  const rooms = useBattles((s) => s.rooms);
  const refreshLobby = useBattles((s) => s.refreshLobby);
  const createRoom = useBattles((s) => s.createRoom);
  const joinRoom = useBattles((s) => s.joinRoom);

  const placeBet = useGame((s) => s.placeBet);
  const username = useGame((s) => s.username);
  const pushToast = useToast((s) => s.push);

  const [createOpen, setCreateOpen] = useState(false);
  const [mode, setMode] = useState('1v1');
  const [selectedCrates, setSelectedCrates] = useState(() => [
    ps99.crates[0],
    ps99.crates[1] || ps99.crates[0],
  ]);
  const [crateSearch, setCrateSearch] = useState('');

  const crateDiscountPct = useSiteConfig((s) => s.crateDiscountPct);
  const cratePriceOverrides = useSiteConfig((s) => s.cratePriceOverrides);
  const pricingCfg = useMemo(
    () => ({ crateDiscountPct, cratePriceOverrides }),
    [crateDiscountPct, cratePriceOverrides]
  );

  const filteredCrates = useMemo(() => {
    const q = crateSearch.trim().toLowerCase();
    return ps99.crates.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [crateSearch]);

  const totalCost = selectedCrates.reduce(
    (s, c) => s + getEffectiveCratePrice(c, pricingCfg),
    0
  );

  const addCrate = (crate) => {
    if (selectedCrates.length >= 10) {
      pushToast('Max 10 crates per battle!', 'info');
      return;
    }
    sound.click();
    setSelectedCrates((prev) => [...prev, crate]);
  };

  const removeCrateAt = (idx) => {
    sound.click();
    setSelectedCrates((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = () => {
    if (selectedCrates.length === 0) {
      pushToast('Pick at least 1 crate for the battle!', 'error');
      return;
    }
    if (!placeBet(totalCost)) return;
    sound.click();
    const room = createRoom({ mode, crates: selectedCrates, username });
    setCreateOpen(false);
    navigate(`/battles/${room.id}`);
  };

  const handleJoin = (room) => {
    const alreadyIn = room.players.some((p) => p?.isUser);
    if (!alreadyIn) {
      if (!placeBet(room.cost)) return;
      const ok = joinRoom(room.id, username);
      if (!ok) {
        pushToast('Battle room is already full!', 'error');
        return;
      }
    }
    sound.click();
    navigate(`/battles/${room.id}`);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Swords size={26} className="text-gold" />
            <span>Case Battles</span>
          </h1>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            Unbox custom PS99 crates head-to-head against bots — highest total pet value takes
            everything! (Live PS99 RAP)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              sound.click();
              refreshLobby();
            }}
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            type="button"
            className="btn btn-green"
            onClick={() => {
              sound.click();
              setCreateOpen(true);
            }}
          >
            <Plus size={17} /> Create Battle
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {rooms.map((room) => {
          const filled = room.players.filter(Boolean).length;
          const isFull = filled >= room.seatsCount;
          const userIn = room.players.some((p) => p?.isUser);

          return (
            <div
              key={room.id}
              className="card"
              style={{
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span
                  className="game-tag"
                  style={{ background: 'rgba(255,197,49,0.16)', color: 'var(--gold)' }}
                >
                  {room.mode}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {room.crates.slice(0, 6).map((crate, i) => (
                    <PetImage
                      key={i}
                      thumb={crate.icon}
                      alt={crate.name}
                      size={38}
                      className="rounded-crate"
                    />
                  ))}
                  {room.crates.length > 6 && (
                    <span className="text-muted" style={{ fontSize: 12, fontWeight: 700 }}>
                      +{room.crates.length - 6}
                    </span>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {room.crates.length} {room.crates.length === 1 ? 'Round' : 'Rounds'}
                  </div>
                  <div
                    className="text-muted"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <Users size={13} />
                    <span>
                      {filled}/{room.seatsCount} players
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ textAlign: 'right' }}>
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    Entry Cost
                  </div>
                  <GemAmount value={room.cost} iconSize={15} />
                </div>

                {room.status === 'finished' || (isFull && !userIn) ? (
                  <Link to={`/battles/${room.id}`} className="btn btn-outline">
                    {room.status === 'finished' ? 'Results' : 'Watch'}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleJoin(room)}
                  >
                    {userIn ? 'Enter Room' : `Join (${formatGems(room.cost)})`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Case Battle"
        maxWidth={660}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-label">
            <span>Battle Mode</span>
            <div className="seg-group">
              {['1v1', '1v1v1', '1v1v1v1'].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`seg-btn ${mode === m ? 'active' : ''}`}
                  onClick={() => {
                    sound.click();
                    setMode(m);
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="field-label">
            <span>Selected Crates ({selectedCrates.length}/10 rounds)</span>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: 10,
                background: 'var(--bg-deep)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                minHeight: 58,
              }}
            >
              {selectedCrates.length === 0 ? (
                <span className="text-muted" style={{ fontSize: 12.5 }}>
                  Click crates below to add up to 10 rounds
                </span>
              ) : (
                selectedCrates.map((crate, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => removeCrateAt(idx)}
                    title={`Remove ${crate.name}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 8px',
                      borderRadius: 9,
                      background: 'var(--panel)',
                      border: '1px solid var(--border-light)',
                      fontSize: 12,
                    }}
                  >
                    <PetImage thumb={crate.icon} alt={crate.name} size={24} />
                    <span>{formatGems(getEffectiveCratePrice(crate, pricingCfg))}</span>
                    <Trash2 size={12} className="text-red" />
                  </button>
                ))
              )}
            </div>
          </div>

          <input
            className="input"
            value={crateSearch}
            onChange={(e) => setCrateSearch(e.target.value)}
            placeholder="Filter PS99 crates…"
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(125px, 1fr))',
              gap: 8,
              maxHeight: 240,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {filteredCrates.map((crate) => (
              <button
                key={crate.id}
                type="button"
                onClick={() => addCrate(crate)}
                style={{
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <PetImage thumb={crate.icon} alt={crate.name} size={48} />
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {crate.name}
                </div>
                <div className="text-gem" style={{ fontSize: 11.5 }}>
                  {formatGems(getEffectiveCratePrice(crate, pricingCfg))}
                </div>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-lg btn-green"
            disabled={selectedCrates.length === 0}
            onClick={handleCreate}
          >
            Create {mode} Battle for {formatGems(totalCost)}
          </button>
        </div>
      </Modal>
    </div>
  );
}
