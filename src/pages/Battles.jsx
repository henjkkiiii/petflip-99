import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Eye, Plus, RefreshCw, Swords, Trash2, Users } from 'lucide-react';
import ps99 from '../data/ps99.json';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { useBattles } from '../store/battles.js';
import { useAuth } from '../store/useAuth.js';
import { getEffectiveCratePrice, useSiteConfig } from '../store/siteConfig.js';
import { useToast } from '../store/toast.js';
import { PetImage } from '../components/PetImage.jsx';
import { GemAmount } from '../components/GemAmount.jsx';
import { Modal } from '../components/Modal.jsx';

export function Battles() {
  const navigate = useNavigate();
  const rooms = useBattles((s) => s.rooms);
  const createBattle = useBattles((s) => s.createBattle);
  const joinBattle = useBattles((s) => s.joinBattle);

  const currentUserKey = useAuth((s) => s.currentUserKey);
  const syncFromServer = useAuth((s) => s.syncFromServer);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const pushToast = useToast((s) => s.push);

  const [createOpen, setCreateOpen] = useState(false);
  const [mode, setMode] = useState('1v1');
  const [selectedCrates, setSelectedCrates] = useState(() => [
    ps99.crates[0],
    ps99.crates[1] || ps99.crates[0],
  ]);
  const [crateSearch, setCrateSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const crateDiscountPct = useSiteConfig((s) => s.crateDiscountPct);
  const cratePriceOverrides = useSiteConfig((s) => s.cratePriceOverrides);
  const pricingCfg = useMemo(
    () => ({ crateDiscountPct, cratePriceOverrides }),
    [crateDiscountPct, cratePriceOverrides]
  );

  const sortedRooms = useMemo(() => {
    const rank = (s) => (s === 'waiting' ? 0 : s === 'playing' ? 1 : 2);
    return [...rooms].sort((a, b) => {
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [rooms]);

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

  const handleOpenCreate = () => {
    sound.click();
    if (!currentUserKey) {
      pushToast('Sign in or create an account to create a battle!', 'info');
      openAuthModal('login');
      return;
    }
    setCreateOpen(true);
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    sound.click();
    setRefreshing(true);
    try {
      await syncFromServer(false);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreate = async () => {
    if (creating) return;
    if (selectedCrates.length === 0) {
      pushToast('Pick at least 1 crate for the battle!', 'error');
      return;
    }
    sound.click();
    setCreating(true);
    try {
      const res = await createBattle({
        mode,
        crateIds: selectedCrates.map((c) => c.id),
      });
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not create battle.', 'error');
        return;
      }
      setCreateOpen(false);
      navigate(`/battles/${res.battle.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (room) => {
    if (joiningId) return;
    const alreadyIn = Boolean(
      currentUserKey && room.players.some((p) => p && !p.isBot && p.userKey === currentUserKey)
    );
    if (alreadyIn) {
      sound.click();
      navigate(`/battles/${room.id}`);
      return;
    }
    if (!currentUserKey) {
      pushToast('Sign in or create an account to join this battle!', 'info');
      openAuthModal('login');
      return;
    }

    sound.click();
    setJoiningId(room.id);
    try {
      const res = await joinBattle(room.id);
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not join battle.', 'error');
        return;
      }
      navigate(`/battles/${room.id}`);
    } finally {
      setJoiningId(null);
    }
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
            Battle other live players on shared PS99 crates — open seats stay open for real players
            unless the creator calls bots. Highest total pet value wins everything!
          </div>
        </div>

        <div className="battle-header-actions">
          <button
            type="button"
            className="btn btn-outline"
            disabled={refreshing}
            onClick={handleRefresh}
          >
            <RefreshCw size={16} /> {refreshing ? 'Syncing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="btn btn-green"
            onClick={handleOpenCreate}
          >
            <Plus size={17} /> Create Battle
          </button>
        </div>
      </div>

      {sortedRooms.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '38px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Swords size={34} className="text-gold" />
          <h3 style={{ margin: 0 }}>No Case Battles active right now</h3>
          <p className="text-muted" style={{ maxWidth: 460, fontSize: 13.5, margin: 0 }}>
            Create a battle room so other online players can join your open seats, or call bots in
            empty slots whenever you don&apos;t want to wait.
          </p>
          <button
            type="button"
            className="btn btn-green"
            style={{ marginTop: 6 }}
            onClick={handleOpenCreate}
          >
            <Plus size={16} /> Create First Battle
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {sortedRooms.map((room) => {
            const filled = room.players.filter(Boolean).length;
            const isFull = filled >= room.seatsCount;
            const userIn = Boolean(
              currentUserKey &&
                room.players.some((p) => p && !p.isBot && p.userKey === currentUserKey)
            );

            const statusLabel =
              room.status === 'waiting'
                ? 'Waiting'
                : room.status === 'playing'
                  ? 'Live'
                  : 'Finished';
            const statusBg =
              room.status === 'waiting'
                ? 'rgba(56, 217, 255, 0.14)'
                : room.status === 'playing'
                  ? 'rgba(34, 197, 94, 0.16)'
                  : 'rgba(148, 163, 184, 0.14)';
            const statusColor =
              room.status === 'waiting'
                ? 'var(--gem)'
                : room.status === 'playing'
                  ? 'var(--green)'
                  : 'var(--text-muted)';

            return (
              <div key={room.id} className="card battle-lobby-card">
                <div className="battle-lobby-main">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      className="game-tag"
                      style={{ background: 'rgba(255,197,49,0.16)', color: 'var(--gold)' }}
                    >
                      {room.mode}
                    </span>
                    <span
                      className="game-tag"
                      style={{ background: statusBg, color: statusColor }}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {room.crates.slice(0, 6).map((crate, i) => (
                      <PetImage
                        key={i}
                        thumb={crate.icon}
                        alt={crate.name}
                        size={36}
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {room.players.map((p, idx) => {
                      if (!p) {
                        return (
                          <span
                            key={idx}
                            style={{
                              fontSize: 11.5,
                              padding: '3px 8px',
                              borderRadius: 999,
                              border: '1px dashed var(--border-light)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Open
                          </span>
                        );
                      }
                      const isMe = Boolean(currentUserKey && !p.isBot && p.userKey === currentUserKey);
                      return (
                        <span
                          key={idx}
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: isMe
                              ? 'rgba(56, 217, 255, 0.16)'
                              : 'rgba(255, 255, 255, 0.06)',
                            border: `1px solid ${
                              isMe ? 'rgba(56, 217, 255, 0.45)' : 'var(--border)'
                            }`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {p.isBot && <Bot size={11} className="text-muted" />}
                          <span>{p.name}</span>
                          {isMe && <span className="you-tag">YOU</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="battle-lobby-actions">
                  <div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      Entry Cost
                    </div>
                    <GemAmount value={room.cost} iconSize={15} />
                  </div>

                  <div className="battle-lobby-action-btns">
                    {userIn ? (
                      <Link to={`/battles/${room.id}`} className="btn btn-primary">
                        Enter Room
                      </Link>
                    ) : room.status === 'waiting' && !isFull ? (
                      <>
                        <Link to={`/battles/${room.id}`} className="btn btn-outline">
                          <Eye size={15} /> View
                        </Link>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={joiningId === room.id}
                          onClick={() => handleJoin(room)}
                        >
                          {joiningId === room.id ? 'Joining…' : `Join (${formatGems(room.cost)})`}
                        </button>
                      </>
                    ) : (
                      <Link to={`/battles/${room.id}`} className="btn btn-outline">
                        {room.status === 'finished' ? 'Results' : 'Watch'}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={creating ? undefined : () => setCreateOpen(false)}
        title="Create Case Battle"
        maxWidth={660}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                minHeight: 54,
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

          <div className="battle-crate-picker-grid">
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
                <PetImage thumb={crate.icon} alt={crate.name} size={46} />
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
            disabled={creating || selectedCrates.length === 0}
            onClick={handleCreate}
          >
            {creating
              ? 'Creating Battle…'
              : `Create ${mode} Battle for ${formatGems(totalCost)}`}
          </button>
        </div>
      </Modal>
    </div>
  );
}
