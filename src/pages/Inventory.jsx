import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Backpack, PackageOpen } from 'lucide-react';
import { useGame } from '../store/useGame.js';
import { useToast } from '../store/toast.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { PetCard } from '../components/PetCard.jsx';
import { GemAmount } from '../components/GemAmount.jsx';
import { Modal } from '../components/Modal.jsx';

export function Inventory() {
  const inventory = useGame((s) => s.inventory);
  const sellItem = useGame((s) => s.sellItem);
  const sellAll = useGame((s) => s.sellAll);
  const pushToast = useToast((s) => s.push);

  const [tierFilter, setTierFilter] = useState('all');
  const [sortBy, setSortBy] = useState('value-desc');
  const [confirmSellAll, setConfirmSellAll] = useState(false);

  const totalValue = useMemo(
    () => inventory.reduce((s, p) => s + p.value, 0),
    [inventory]
  );

  const visible = useMemo(() => {
    const list = inventory.filter(
      (p) => tierFilter === 'all' || (p.tier || 'normal') === tierFilter
    );
    return [...list].sort((a, b) => {
      if (sortBy === 'value-desc') return b.value - a.value;
      if (sortBy === 'value-asc') return a.value - b.value;
      return a.name.localeCompare(b.name);
    });
  }, [inventory, tierFilter, sortBy]);

  const handleSellOne = (pet) => {
    const gained = sellItem(pet.uid);
    if (gained > 0) {
      sound.cashout();
      pushToast(`Sold ${pet.name} for +${formatGems(gained)} gems!`, 'success');
    }
  };

  const handleConfirmSellAll = () => {
    const res = sellAll();
    setConfirmSellAll(false);
    if (res.count > 0) {
      sound.cashout();
      pushToast(`Sold ${res.count} pets for +${formatGems(res.total)} gems!`, 'success');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Backpack size={28} className="text-gem" />
            <span>Pet Inventory ({inventory.length})</span>
          </h1>
          <div className="text-muted" style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>Total Value:</span>
            <GemAmount value={totalValue} iconSize={15} className="text-gem" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-green"
            disabled={inventory.length === 0}
            onClick={() => {
              sound.click();
              setConfirmSellAll(true);
            }}
          >
            Sell All ({formatGems(totalValue)})
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div className="seg-group" style={{ maxWidth: 460 }}>
          {['all', 'normal', 'huge', 'titanic', 'gargantuan'].map((t) => (
            <button
              key={t}
              type="button"
              className={`seg-btn ${tierFilter === t ? 'active' : ''}`}
              onClick={() => setTierFilter(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <select
          className="input"
          style={{ width: 'auto' }}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="value-desc">Value: High → Low</option>
          <option value="value-asc">Value: Low → High</option>
          <option value="name">Name: A → Z</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="card" style={{ padding: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>📦</div>
          <h3>No pets here yet!</h3>
          <p className="text-muted">Open custom PS99 Crates or win a Case Battle to fill your inventory.</p>
          <Link to="/cases" className="btn btn-primary" style={{ marginTop: 10 }}>
            <PackageOpen size={17} /> Browse Crates
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
            gap: 12,
          }}
        >
          {visible.map((pet) => (
            <PetCard
              key={pet.uid}
              pet={pet}
              actionLabel={`Sell ${formatGems(pet.value)}`}
              onAction={handleSellOne}
            />
          ))}
        </div>
      )}

      <Modal
        open={confirmSellAll}
        onClose={() => setConfirmSellAll(false)}
        title="Sell Entire Inventory?"
      >
        <p className="text-muted" style={{ marginTop: 0 }}>
          Sell all <strong>{inventory.length}</strong> pets in your inventory for{' '}
          <strong className="text-gem">{formatGems(totalValue)}</strong> play gems?
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{ flex: 1 }}
            onClick={() => setConfirmSellAll(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-green"
            style={{ flex: 1 }}
            onClick={handleConfirmSellAll}
          >
            Confirm Sell All
          </button>
        </div>
      </Modal>
    </div>
  );
}
