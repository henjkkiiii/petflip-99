import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Crown, Flame, PackageOpen, RotateCw, Sparkles, Trophy, Zap } from 'lucide-react';
import ps99 from '../data/ps99.json';
import { weightedPick } from '../lib/rng.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { fireConfetti } from '../lib/confetti.js';
import { useGame } from '../store/useGame.js';
import { useSiteConfig, getEffectiveCratePrice } from '../store/siteConfig.js';
import { useToast } from '../store/toast.js';
import { useDrops } from '../store/drops.js';
import { CaseReel } from '../components/CaseReel.jsx';
import { MythicCutscene } from '../components/MythicCutscene.jsx';
import { PetCard } from '../components/PetCard.jsx';
import { PetImage } from '../components/PetImage.jsx';
import { GemAmount } from '../components/GemAmount.jsx';
import { Modal } from '../components/Modal.jsx';
import { LiveBets } from '../components/LiveBets.jsx';

const TIER_RANK = { normal: 0, huge: 1, titanic: 2, gargantuan: 3 };

export function CaseOpen() {
  const { id } = useParams();
  const crate = useMemo(
    () => ps99.crates.find((c) => c.id === id) || ps99.crates[0],
    [id]
  );
  const topDrop = useMemo(
    () => [...(crate.items || [])].sort((a, b) => (b.value || 0) - (a.value || 0))[0] || null,
    [crate]
  );

  const placeBet = useGame((s) => s.placeBet);
  const recordBet = useGame((s) => s.recordBet);
  const addItems = useGame((s) => s.addItems);
  const sellItemsByUids = useGame((s) => s.sellItemsByUids);
  const pushToast = useToast((s) => s.push);

  const [count, setCount] = useState(1);
  const [fast, setFast] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winners, setWinners] = useState([]);
  const [spinNonce, setSpinNonce] = useState(0);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [wonStamped, setWonStamped] = useState([]);
  const [lastSpent, setLastSpent] = useState(0);
  const [recentPulls, setRecentPulls] = useState([]);
  const [sessionOpened, setSessionOpened] = useState(0);
  const [sessionBest, setSessionBest] = useState(null);
  const [cutscenePet, setCutscenePet] = useState(null);

  const doneCountRef = useRef(0);
  const activeRunRef = useRef(null);
  const modalTimerRef = useRef(null);

  useEffect(() => {
    setRecentPulls([]);
    setSessionOpened(0);
    setSessionBest(null);
  }, [id]);

  useEffect(() => {
    return () => {
      if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
    };
  }, []);

  const crateDiscountPct = useSiteConfig((s) => s.crateDiscountPct);
  const cratePriceOverrides = useSiteConfig((s) => s.cratePriceOverrides);
  const effectivePrice = getEffectiveCratePrice(crate, {
    crateDiscountPct,
    cratePriceOverrides,
  });
  const totalCost = effectivePrice * count;

  const openCrate = () => {
    if (spinning) return;
    if (!placeBet(totalCost)) return;
    if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
    sound.open();

    const picked = Array.from({ length: count }, () =>
      weightedPick(crate.items, 'chance')
    );
    doneCountRef.current = 0;
    activeRunRef.current = {
      picked,
      totalCost,
      crateId: crate.id,
      crateName: crate.name,
    };
    setWinners(picked);
    setSpinNonce((n) => n + 1);
    setSpinning(true);
    setResultModalOpen(false);
  };

  const handleReelDone = () => {
    doneCountRef.current += 1;
    const run = activeRunRef.current;
    if (!run || doneCountRef.current < run.picked.length) return;

    setSpinning(false);
    const stamped = run.picked.map((pet) => ({
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: pet.name,
      thumb: pet.thumb,
      value: pet.value,
      tier: pet.tier,
      from: run.crateName,
    }));

    addItems(stamped);
    setWonStamped(stamped);
    setLastSpent(run.totalCost);
    setRecentPulls((prev) => [...stamped, ...prev].slice(0, 6));
    setSessionOpened((n) => n + stamped.length);
    setSessionBest((prev) => {
      const topThisSpin = [...stamped].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
      if (!prev || (topThisSpin && (topThisSpin.value || 0) > (prev.value || 0))) {
        return topThisSpin;
      }
      return prev;
    });

    const pushDrop = useDrops.getState().pushDrop;
    const uname = useGame.getState().username;
    stamped.forEach((pet) => {
      pushDrop({
        user: uname,
        name: pet.name,
        thumb: pet.thumb,
        value: pet.value,
        tier: pet.tier,
        crateId: run.crateId,
        crateName: run.crateName,
        isUser: true,
      });
    });

    const totalValue = stamped.reduce((s, p) => s + p.value, 0);
    const mult = totalValue / run.totalCost;
    recordBet({
      game: 'Cases',
      amount: run.totalCost,
      multiplier: mult,
      payout: totalValue,
    });

    const mythicWinner = [...stamped]
      .filter((p) => p.tier === 'gargantuan' || p.tier === 'titanic')
      .sort((a, b) => (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0) || (b.value || 0) - (a.value || 0))[0];

    if (mythicWinner) {
      if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
      setCutscenePet(mythicWinner);
      return;
    }

    const hasRare = stamped.some((p) =>
      ['huge', 'titanic', 'gargantuan'].includes(p.tier)
    );
    if (hasRare || mult >= 2) {
      sound.bigWin();
      fireConfetti(true);
    } else if (mult >= 1) {
      sound.win();
    } else {
      sound.lose();
    }

    if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
    modalTimerRef.current = setTimeout(() => {
      setResultModalOpen(true);
    }, fast ? 240 : 480);
  };

  const wonTotal = wonStamped.reduce((s, p) => s + p.value, 0);
  const netProfit = wonTotal - lastSpent;
  const resultMult = lastSpent > 0 ? (wonTotal / lastSpent).toFixed(2) : '0.00';

  const bestPulledTier = wonStamped.reduce(
    (best, p) => ((TIER_RANK[p.tier] || 0) > (TIER_RANK[best] || 0) ? p.tier : best),
    'normal'
  );
  const modalHeadline =
    bestPulledTier === 'gargantuan'
      ? 'GARGANTUAN JACKPOT!'
      : bestPulledTier === 'titanic'
        ? 'TITANIC MEGA PULL!'
        : bestPulledTier === 'huge'
          ? 'HUGE PET UNBOXED!'
          : netProfit >= 0
            ? 'PROFIT PULL!'
            : 'UNBOXED!';

  const handleSellWon = () => {
    const uids = wonStamped.map((p) => p.uid);
    const res = sellItemsByUids(uids);
    if (res.count > 0) {
      sound.cashout();
      pushToast(`Sold ${res.count} pets for ${formatGems(res.total)} gems!`, 'success');
    }
    setResultModalOpen(false);
  };

  const handleSellAndSpinAgain = () => {
    const uids = wonStamped.map((p) => p.uid);
    const res = sellItemsByUids(uids);
    if (res.count > 0) {
      sound.cashout();
    }
    setResultModalOpen(false);
    openCrate();
  };

  const handleKeepAndSpinAgain = () => {
    setResultModalOpen(false);
    openCrate();
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link to="/cases" className="btn btn-sm btn-ghost">
          <ArrowLeft size={15} /> Back to All Crates
        </Link>
      </div>

      <div className={`card case-open-card case-open-tier-${topDrop?.tier || 'normal'}`}>
        <div className="case-open-head">
          <div className="case-open-info">
            <img
              src={crate.icon}
              alt={crate.name}
              className={`case-open-icon ${spinning ? 'egg-wobble crate-spinning-aura' : ''}`}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 className="page-title" style={{ fontSize: 24 }}>
                  {crate.name}
                </h1>
                <span className="tier-badge tier-badge-huge">{crate.tag}</span>
              </div>
              <div
                className="text-gem"
                style={{
                  fontSize: 16,
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                <GemAmount value={effectivePrice} iconSize={16} /> per crate
                {crateDiscountPct > 0 && (
                  <span className="tier-badge tier-badge-titanic">-{crateDiscountPct}% SALE</span>
                )}
              </div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                Live PS99 RAP · {crate.desc}
              </div>
            </div>
          </div>

          <div className="case-open-controls">
            <div className="seg-group">
              {[1, 2, 3, 4].map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={spinning}
                  className={`seg-btn ${count === c ? 'active' : ''}`}
                  onClick={() => {
                    sound.click();
                    setCount(c);
                  }}
                >
                  {c}×
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={spinning}
              className={`btn btn-sm ${fast ? 'btn-gold' : 'btn-outline'}`}
              onClick={() => {
                sound.click();
                setFast((f) => !f);
              }}
            >
              <Zap size={14} /> Fast
            </button>

            <button
              type="button"
              disabled={spinning}
              className="btn btn-lg btn-green case-open-cta"
              onClick={openCrate}
            >
              <PackageOpen size={18} />
              <span>Open for {formatGems(totalCost)}</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {topDrop && (
            <div className="case-chase-pill" style={{ marginBottom: 0 }}>
              <Trophy size={14} className="text-gold" />
              <span className="text-muted">Top Drop:</span>
              <PetImage thumb={topDrop.thumb} alt={topDrop.name} size={22} />
              <strong>{topDrop.name}</strong>
              <GemAmount value={topDrop.value} iconSize={13} className="text-gold" />
            </div>
          )}

          {sessionOpened > 0 && sessionBest && (
            <div className="case-session-pill">
              <Flame size={13} className="text-purple" />
              <span className="text-muted">Opened:</span>
              <strong>{sessionOpened}</strong>
              <span className="text-muted">· Best:</span>
              <strong className="text-gem">{formatGems(sessionBest.value)}</strong>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: count }, (_, idx) => (
            <CaseReel
              key={`${idx}-${spinNonce}`}
              items={crate.items}
              winner={winners[idx] || crate.items[crate.items.length - 1]}
              spinning={spinning}
              fast={fast}
              compact={count > 1}
              onDone={handleReelDone}
            />
          ))}
        </div>

        {recentPulls.length > 0 && (
          <div className="case-recent-strip">
            <span
              className="text-muted"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Sparkles size={12} className="text-gem" /> Recent:
            </span>
            {recentPulls.map((pet) => (
              <div
                key={pet.uid}
                className={`tier-badge tier-badge-${pet.tier || 'normal'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  whiteSpace: 'nowrap',
                  textTransform: 'none',
                }}
              >
                <PetImage thumb={pet.thumb} alt={pet.name} size={18} />
                <span>{pet.name}</span>
                <strong>{formatGems(pet.value)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section-head">
        <h2>Crate Contents</h2>
      </div>

      <div className="case-contents-grid">
        {crate.items.map((item) => (
          <PetCard key={item.name} pet={item} showChance />
        ))}
      </div>

      <LiveBets />

      <Modal
        open={resultModalOpen}
        onClose={() => setResultModalOpen(false)}
        title={`Unboxed from ${crate.name}!`}
        maxWidth={560}
      >
        <div
          className={`case-result-hero tier-${bestPulledTier} ${
            netProfit >= 0 ? 'is-profit' : 'is-loss'
          }`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Crown
              size={18}
              className={
                bestPulledTier === 'gargantuan' || bestPulledTier === 'titanic'
                  ? 'text-gold'
                  : bestPulledTier === 'huge'
                    ? 'text-purple'
                    : netProfit >= 0
                      ? 'text-green'
                      : 'text-gem'
              }
            />
            <span style={{ fontWeight: 800, letterSpacing: '0.04em', fontSize: 14 }}>
              {modalHeadline}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GemAmount value={wonTotal} animate iconSize={16} className="text-gem" />
            <span className={`mult-pill ${Number(resultMult) >= 1 ? 'mult-green' : 'mult-red'}`}>
              {resultMult}×
            </span>
          </div>
        </div>

        <div className="case-result-grid">
          {wonStamped.map((pet) => (
            <PetCard key={pet.uid} pet={pet} compact />
          ))}
        </div>

        <div className="case-result-actions" style={{ flexDirection: 'column' }}>
          <button
            type="button"
            className="btn btn-lg btn-gold"
            style={{ width: '100%' }}
            onClick={handleSellAndSpinAgain}
          >
            <RotateCw size={17} />
            <span>
              Sell ({formatGems(wonTotal)}) &amp; Spin Again ({formatGems(totalCost)})
            </span>
          </button>

          <div style={{ display: 'flex', gap: 8, width: '100%', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-green"
              style={{ flex: 1 }}
              onClick={handleSellWon}
            >
              Sell for {formatGems(wonTotal)}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleKeepAndSpinAgain}
            >
              Keep &amp; Spin Again
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ flex: '0 1 auto' }}
              onClick={() => setResultModalOpen(false)}
            >
              Keep
            </button>
          </div>
        </div>
      </Modal>

      <MythicCutscene
        pet={cutscenePet}
        onDone={() => {
          setCutscenePet(null);
          setResultModalOpen(true);
        }}
      />
    </div>
  );
}
