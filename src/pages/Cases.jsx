import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageOpen, Search } from 'lucide-react';
import ps99 from '../data/ps99.json';
import { getEffectiveCratePrice, useSiteConfig } from '../store/siteConfig.js';
import { formatGems } from '../lib/format.js';
import { PetImage } from '../components/PetImage.jsx';
import { GemAmount } from '../components/GemAmount.jsx';

export function Cases() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('price-asc');
  const [hoveredId, setHoveredId] = useState(null);

  const crateDiscountPct = useSiteConfig((s) => s.crateDiscountPct);
  const cratePriceOverrides = useSiteConfig((s) => s.cratePriceOverrides);
  const pricingCfg = useMemo(
    () => ({ crateDiscountPct, cratePriceOverrides }),
    [crateDiscountPct, cratePriceOverrides]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = ps99.crates.filter((c) => !q || c.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (sort === 'price-asc') {
        return getEffectiveCratePrice(a, pricingCfg) - getEffectiveCratePrice(b, pricingCfg);
      }
      if (sort === 'price-desc') {
        return getEffectiveCratePrice(b, pricingCfg) - getEffectiveCratePrice(a, pricingCfg);
      }
      return a.name.localeCompare(b.name);
    });
  }, [query, sort, pricingCfg]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <PackageOpen size={26} className="text-purple" />
            <span>PS99 Custom Crates ({ps99.crates.length})</span>
          </h1>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            Custom PS99-themed crates with real PS99 pet drops · Live RAP
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: 220 }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search crates…"
            />
          </div>

          <select
            className="input"
            style={{ width: 'auto' }}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="name">Name: A → Z</option>
          </select>
        </div>
      </div>

      <div className="egg-grid">
        {filtered.map((crate) => {
          const top3 = crate.items.slice(0, 3);
          const isHover = hoveredId === crate.id;
          const effPrice = getEffectiveCratePrice(crate, pricingCfg);
          const hasSale = crateDiscountPct > 0;
          return (
            <Link
              key={crate.id}
              to={`/cases/${crate.id}`}
              className="egg-card"
              onMouseEnter={() => setHoveredId(crate.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 6 }}>
                <span className="tier-badge tier-badge-huge">{crate.tag}</span>
                {hasSale && (
                  <span className="tier-badge tier-badge-titanic">-{crateDiscountPct}%</span>
                )}
              </div>

              <img
                src={crate.icon}
                alt={crate.name}
                style={{
                  width: 112,
                  height: 112,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.45))',
                }}
                className="egg-wobble"
              />

              <div className="egg-card-name" title={crate.name}>
                {crate.name}
              </div>

              {isHover ? (
                <div className="egg-hover-top3" title="Top drops">
                  {top3.map((it) => (
                    <PetImage key={it.name} thumb={it.thumb} alt={it.name} size={28} />
                  ))}
                </div>
              ) : (
                <div
                  className="text-muted"
                  style={{
                    fontSize: 11.5,
                    textAlign: 'center',
                    lineHeight: 1.3,
                    minHeight: 30,
                  }}
                >
                  {crate.desc}
                </div>
              )}

              <div className="text-gem" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {effPrice !== crate.price && crateDiscountPct > 0 && (
                  <span
                    className="text-muted"
                    style={{ fontSize: 11.5, textDecoration: 'line-through' }}
                  >
                    {formatGems(cratePriceOverrides?.[crate.id] || crate.price)}
                  </span>
                )}
                <GemAmount value={effPrice} iconSize={15} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
