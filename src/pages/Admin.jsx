import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  Bot,
  CheckCircle2,
  Coins,
  Database,
  Download,
  ExternalLink,
  Gamepad2,
  Gem,
  Gift,
  KeyRound,
  LayoutDashboard,
  LogIn,
  Megaphone,
  Menu,
  PackageOpen,
  Palette,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Swords,
  Ticket,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import ps99 from '../data/ps99.json';
import { useAuth } from '../store/useAuth.js';
import { getLevel } from '../store/useGame.js';
import {
  ALL_GAMES,
  THEME_PRESETS,
  getEffectiveCratePrice,
  useSiteConfig,
} from '../store/siteConfig.js';
import { useBattles } from '../store/battles.js';
import { useDrops } from '../store/drops.js';
import { useChat } from '../store/chat.js';
import { useToast } from '../store/toast.js';
import { formatGems, formatGemsFull, parseGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { GemAmount } from '../components/GemAmount.jsx';
import { PetImage } from '../components/PetImage.jsx';
import { Modal } from '../components/Modal.jsx';
import './Admin.css';

const TIER_RANK = { gargantuan: 4, titanic: 3, huge: 2, normal: 1 };

function buildPetCatalog() {
  const byName = new Map();
  for (const crate of ps99.crates || []) {
    for (const item of crate.items || []) {
      if (!byName.has(item.name)) {
        byName.set(item.name, {
          name: item.name,
          thumb: item.thumb,
          value: item.value,
          tier: item.tier || 'normal',
          crateId: crate.id,
        });
      }
    }
  }
  return Array.from(byName.values()).sort((a, b) => {
    const tr = (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0);
    return tr !== 0 ? tr : b.value - a.value;
  });
}

function ToggleRow({ title, desc, checked, onChange }) {
  return (
    <div className="admin-toggle-row">
      <div className="admin-toggle-info">
        <span className="admin-toggle-title">{title}</span>
        <span className="admin-toggle-desc">{desc}</span>
      </div>
      <button
        type="button"
        className={`btn btn-sm ${checked ? 'btn-green' : 'btn-outline'}`}
        onClick={() => onChange(!checked)}
      >
        {checked ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

function CrateControlCard({ crate, siteConfig }) {
  const effective = getEffectiveCratePrice(crate, siteConfig);
  const override = siteConfig.cratePriceOverrides?.[crate.id];
  const isDisabled = (siteConfig.crateDisabledIds || []).includes(crate.id);
  const [priceInput, setPriceInput] = useState(() =>
    override ? formatGems(override) : ''
  );
  const pushToast = useToast((s) => s.push);

  useEffect(() => {
    setPriceInput(override ? formatGems(override) : '');
  }, [override]);

  const applyPrice = async (e) => {
    e.preventDefault();
    const parsed = parseGems(priceInput);
    if (!Number.isFinite(parsed) || parsed < 1000) {
      pushToast('Enter a valid gem price (>= 1,000, e.g. 5M).', 'error');
      return;
    }
    sound.click();
    const res = await siteConfig.setCratePriceOverride(crate.id, parsed, crate.name);
    if (res.ok) {
      pushToast(`Updated ${crate.name} price to ${formatGems(parsed)}.`, 'success');
    } else {
      pushToast(res.error || 'Could not update crate price.', 'error');
    }
  };

  const resetOne = async () => {
    sound.click();
    const res = await siteConfig.setCratePriceOverride(crate.id, null, crate.name);
    if (res.ok) {
      setPriceInput('');
      pushToast(`Restored ${crate.name} default RAP price.`, 'info');
    } else {
      pushToast(res.error || 'Could not reset crate price.', 'error');
    }
  };

  const toggleDisabled = async () => {
    sound.click();
    const res = await siteConfig.setCrateDisabled(crate.id, !isDisabled, crate.name);
    if (res.ok) {
      pushToast(
        `${crate.name} is now ${!isDisabled ? 'HIDDEN' : 'LIVE'}.`,
        !isDisabled ? 'info' : 'success'
      );
    } else {
      pushToast(res.error || 'Could not update crate visibility.', 'error');
    }
  };

  return (
    <div
      className="card admin-crate-card"
      style={isDisabled ? { opacity: 0.65, borderColor: 'rgba(255,71,87,0.35)' } : undefined}
    >
      <div className="admin-crate-head">
        <img
          src={crate.icon}
          alt={crate.name}
          style={{ width: 52, height: 52, objectFit: 'contain' }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13.5,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {crate.name}
          </div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>
            Default: {formatGems(crate.price)} · Active:{' '}
            <strong className="text-gem">{formatGems(effective)}</strong>
          </div>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${isDisabled ? 'btn-red' : 'btn-green'}`}
          onClick={toggleDisabled}
          title={isDisabled ? 'Enable crate' : 'Hide crate from players'}
        >
          {isDisabled ? 'OFF' : 'ON'}
        </button>
      </div>

      <form onSubmit={applyPrice} style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          placeholder={`Custom (def ${formatGems(crate.price)})`}
        />
        <button type="submit" className="btn btn-sm btn-primary">
          Set
        </button>
        {override && (
          <button type="button" className="btn btn-sm btn-outline" onClick={resetOne}>
            Reset
          </button>
        )}
      </form>
    </div>
  );
}

function ManageUserModal({ targetKey, account, isSelf, onClose, petCatalog }) {
  const auth = useAuth();
  const pushToast = useToast((s) => s.push);

  const [gemInput, setGemInput] = useState('10M');
  const [petFilter, setPetFilter] = useState('');
  const [selectedPetName, setSelectedPetName] = useState(() => petCatalog[0]?.name || '');
  const [announceDrop, setAnnounceDrop] = useState(true);
  const [xpInput, setXpInput] = useState(() => String(Math.round(account?.data?.xp || 0)));
  const [resetPass, setResetPass] = useState('');
  const [banReason, setBanReason] = useState(() => account?.banReason || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setXpInput(String(Math.round(account?.data?.xp || 0)));
    setBanReason(account?.banReason || '');
    setResetPass('');
    setConfirmDelete(false);
  }, [targetKey, account?.data?.xp, account?.banReason]);

  const filteredPets = useMemo(() => {
    const q = petFilter.trim().toLowerCase();
    return petCatalog.filter((p) => !q || p.name.toLowerCase().includes(q) || p.tier.includes(q));
  }, [petCatalog, petFilter]);

  useEffect(() => {
    if (filteredPets.length > 0 && !filteredPets.some((p) => p.name === selectedPetName)) {
      setSelectedPetName(filteredPets[0].name);
    }
  }, [filteredPets, selectedPetName]);

  if (!account) return null;

  const data = account.data || {};
  const bal = data.balance || 0;
  const inv = data.inventory || [];

  const handleFeedback = (res, successMsg) => {
    if (!res.ok) {
      sound.lose();
      pushToast(res.error || 'Action failed.', 'error');
      return false;
    }
    sound.win();
    pushToast(successMsg, 'success');
    return true;
  };

  const quickGem = async (delta) => {
    sound.click();
    const res = await auth.adminAdjustBalance(targetKey, delta);
    handleFeedback(res, `${delta > 0 ? 'Added' : 'Removed'} ${formatGems(Math.abs(delta))} gems!`);
  };

  const customGem = async (mode) => {
    const parsed = parseGems(gemInput);
    if (!Number.isFinite(parsed) || (mode !== 'set' && parsed <= 0) || parsed < 0) {
      pushToast('Enter a valid gem amount (e.g. 5M or 250K).', 'error');
      return;
    }
    sound.click();
    if (mode === 'give') {
      handleFeedback(
        await auth.adminAdjustBalance(targetKey, parsed),
        `Gave ${formatGems(parsed)} gems to ${account.username}!`
      );
    } else if (mode === 'take') {
      handleFeedback(
        await auth.adminAdjustBalance(targetKey, -parsed),
        `Took ${formatGems(parsed)} gems from ${account.username}!`
      );
    } else {
      handleFeedback(
        await auth.adminSetBalance(targetKey, parsed),
        `Set ${account.username} balance to ${formatGems(parsed)}!`
      );
    }
  };

  const grantPet = async () => {
    const pet = petCatalog.find((p) => p.name === selectedPetName);
    if (!pet) return;
    sound.click();
    handleFeedback(
      await auth.adminGrantPet(targetKey, pet, announceDrop),
      `Granted ${pet.name} to ${account.username}!`
    );
  };

  const applyXp = async (e) => {
    e.preventDefault();
    const num = Math.max(0, Math.round(Number(xpInput) || 0));
    sound.click();
    handleFeedback(await auth.adminSetXp(targetKey, num), `Updated ${account.username} XP to ${num}!`);
  };

  const applyPassReset = async (e) => {
    e.preventDefault();
    const res = await auth.adminResetPassword(targetKey, resetPass);
    if (handleFeedback(res, `Updated password for ${account.username}!`)) {
      setResetPass('');
    }
  };

  const toggleRole = async () => {
    const next = account.role === 'admin' ? 'user' : 'admin';
    handleFeedback(
      await auth.adminSetRole(targetKey, next),
      `${account.username} is now ${next.toUpperCase()}.`
    );
  };

  const toggleBan = async () => {
    const nextBan = !account.banned;
    handleFeedback(
      await auth.adminSetBanned(targetKey, nextBan, banReason),
      nextBan ? `Banned ${account.username}.` : `Unbanned ${account.username}.`
    );
  };

  const removeInvItem = async (uid) => {
    sound.click();
    handleFeedback(
      await auth.adminRemoveInventoryItem(targetKey, uid),
      'Removed item from inventory.'
    );
  };

  const doDelete = async () => {
    const res = await auth.adminDeleteAccount(targetKey);
    if (handleFeedback(res, `Deleted account ${account.username}.`)) {
      onClose();
    }
  };

  return (
    <Modal open={Boolean(account)} onClose={onClose} title={`Manage User: ${account.username}`} maxWidth={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`role-badge ${account.role === 'admin' ? 'role-badge-admin' : 'role-badge-user'}`}>
              {account.role}
            </span>
            {account.banned && <span className="role-badge role-badge-banned">BANNED</span>}
            {isSelf && <span className="tier-badge tier-badge-huge">YOU</span>}
          </div>
          <div style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>
              Bal: <strong className="text-gem">{formatGemsFull(bal)}</strong>
            </span>
            <span className="text-muted">Lvl {getLevel(data.xp || 0)}</span>
            <span className="text-muted">{inv.length} pets</span>
          </div>
        </div>

        <div className="admin-modal-section">
          <div className="admin-modal-title">
            <Gem size={14} className="text-gem" />
            <span>Gem Balance Controls</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[1_000_000, 10_000_000, 100_000_000, 1_000_000_000].map((amt) => (
              <button key={amt} type="button" className="btn btn-sm btn-green" onClick={() => quickGem(amt)}>
                +{formatGems(amt)}
              </button>
            ))}
            <button type="button" className="btn btn-sm btn-red" onClick={() => quickGem(-1_000_000)}>
              -1M
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={async () =>
                handleFeedback(
                  await auth.adminSetBalance(targetKey, 0),
                  `Zeroed ${account.username} balance.`
                )
              }
            >
              Zero
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 130 }}
              value={gemInput}
              onChange={(e) => setGemInput(e.target.value)}
              placeholder="Amount (e.g. 25M)"
            />
            <button type="button" className="btn btn-sm btn-green" onClick={() => customGem('give')}>
              Give
            </button>
            <button type="button" className="btn btn-sm btn-red" onClick={() => customGem('take')}>
              Take
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => customGem('set')}>
              Set Exact
            </button>
          </div>
        </div>

        <div className="admin-modal-section">
          <div className="admin-modal-title">
            <Gift size={14} className="text-gold" />
            <span>Grant PS99 Pet</span>
          </div>
          <input
            className="input"
            value={petFilter}
            onChange={(e) => setPetFilter(e.target.value)}
            placeholder="Search pets by name or tier (gargantuan, titanic, huge)…"
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              className="input"
              style={{ flex: 1, minWidth: 200 }}
              value={selectedPetName}
              onChange={(e) => setSelectedPetName(e.target.value)}
            >
              {filteredPets.map((p) => (
                <option key={p.name} value={p.name}>
                  [{p.tier.toUpperCase()}] {p.name} ({formatGems(p.value)})
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm btn-gold" onClick={grantPet}>
              Grant Pet
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={announceDrop} onChange={(e) => setAnnounceDrop(e.target.checked)} />
            <span>Broadcast granted pet in top Live Drops ticker</span>
          </label>

          {inv.length > 0 && (
            <div className="admin-inv-list">
              {inv.slice(0, 20).map((item) => (
                <div key={item.uid} className="admin-inv-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <PetImage thumb={item.thumb} alt={item.name} size={24} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </span>
                    <span className="text-gem">{formatGems(item.value)}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-red"
                    style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                    onClick={() => removeInvItem(item.uid)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="admin-modal-section">
          <div className="admin-modal-title">
            <Sparkles size={14} className="text-purple" />
            <span>XP, Daily &amp; Password</span>
          </div>
          <form onSubmit={applyXp} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              type="number"
              min="0"
              className="input"
              style={{ flex: 1, minWidth: 120 }}
              value={xpInput}
              onChange={(e) => setXpInput(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-primary">
              Set XP
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={async () =>
                handleFeedback(
                  await auth.adminResetDailyCooldown(targetKey),
                  `Reset Daily cooldown for ${account.username}.`
                )
              }
            >
              Reset Daily
            </button>
          </form>

          <form onSubmit={applyPassReset} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              type="password"
              className="input"
              style={{ flex: 1, minWidth: 150 }}
              value={resetPass}
              onChange={(e) => setResetPass(e.target.value)}
              placeholder="New password (min 4 chars)"
            />
            <button type="submit" className="btn btn-sm btn-outline">
              <KeyRound size={13} /> Reset Password
            </button>
          </form>
        </div>

        <div className="admin-modal-section">
          <div className="admin-modal-title">
            <ShieldCheck size={14} className="text-gold" />
            <span>Role, Ban &amp; Danger Zone</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-outline" onClick={toggleRole}>
              {account.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={async () =>
                handleFeedback(
                  await auth.adminResetAccountData(targetKey),
                  `Reset gameplay data for ${account.username}.`
                )
              }
            >
              <RotateCcw size={13} /> Reset Data
            </button>
          </div>

          {!isSelf && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 140 }}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Ban reason (optional)"
                />
                <button
                  type="button"
                  className={`btn btn-sm ${account.banned ? 'btn-green' : 'btn-red'}`}
                  onClick={toggleBan}
                >
                  <Ban size={13} /> {account.banned ? 'Unban' : 'Ban User'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-red"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={13} /> Delete Account
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn-sm btn-red" onClick={doDelete}>
                      Confirm Permanent Delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

const NAV_GROUPS = [
  {
    group: 'Command Center',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'branding', label: 'Branding & Theme', icon: Palette },
      { id: 'games', label: 'Games & Multipliers', icon: Gamepad2 },
    ],
  },
  {
    group: 'Economy & Live Ops',
    items: [
      { id: 'users', label: 'Users & Airdrops', icon: Users },
      { id: 'crates', label: 'Crates & Pricing', icon: PackageOpen },
      { id: 'battles', label: 'Battles & Drops', icon: Swords },
      { id: 'promos', label: 'Promo Codes', icon: Ticket },
    ],
  },
  {
    group: 'System',
    items: [
      { id: 'controls', label: 'Site Controls & Chat', icon: Sliders },
      { id: 'system', label: 'Backup & Audit Log', icon: Database },
    ],
  },
];

export function Admin() {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const promoCodes = useAuth((s) => s.promoCodes);
  const onlineCount = useAuth((s) => s.onlineCount);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const refreshLiveState = useAuth((s) => s.refreshLiveState);
  const adminCreateAccount = useAuth((s) => s.adminCreateAccount);
  const adminCreatePromo = useAuth((s) => s.adminCreatePromo);
  const adminTogglePromo = useAuth((s) => s.adminTogglePromo);
  const adminDeletePromo = useAuth((s) => s.adminDeletePromo);
  const adminAnnouncePromo = useAuth((s) => s.adminAnnouncePromo);

  const siteConfig = useSiteConfig();
  const rooms = useBattles((s) => s.rooms);
  const callBot = useBattles((s) => s.callBot);
  const leaveRoom = useBattles((s) => s.leaveRoom);
  const drops = useDrops((s) => s.drops);
  const sendAdminBroadcast = useChat((s) => s.sendAdminBroadcast);
  const clearMessages = useChat((s) => s.clearMessages);
  const pushToast = useToast((s) => s.push);

  const actor = currentUserKey ? accounts[currentUserKey] || null : null;
  const isAdmin = actor?.role === 'admin';

  const [tab, setTab] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Users state
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newBal, setNewBal] = useState('500K');

  // Airdrop state
  const [airdropInput, setAirdropInput] = useState('5M');
  const [airdropAnnounce, setAirdropAnnounce] = useState(true);

  // Branding & Theme state
  const [brandName, setBrandName] = useState(siteConfig.branding?.siteName || 'PETFLIP');
  const [brandSuffix, setBrandSuffix] = useState(siteConfig.branding?.siteSuffix || '99');
  const [currencyName, setCurrencyName] = useState(siteConfig.branding?.currencyName || 'Gems');
  const [heroTitle, setHeroTitle] = useState(siteConfig.branding?.heroTitle || '');
  const [heroSubtitle, setHeroSubtitle] = useState(siteConfig.branding?.heroSubtitle || '');
  const [footerText, setFooterText] = useState(siteConfig.branding?.footerText || '');

  const [themeColors, setThemeColors] = useState(() => ({
    preset: siteConfig.theme?.preset || 'cyber',
    primary: siteConfig.theme?.primary || '#4f6bff',
    gem: siteConfig.theme?.gem || '#38d9ff',
    gold: siteConfig.theme?.gold || '#ffc531',
    bg: siteConfig.theme?.bg || '#0b0d14',
    panel: siteConfig.theme?.panel || '#12151f',
  }));

  // Games & Multipliers state
  const [minBetInput, setMinBetInput] = useState(() => formatGems(siteConfig.games?.minBet ?? 1000));
  const [maxBetInput, setMaxBetInput] = useState(() =>
    siteConfig.games?.maxBet ? formatGems(siteConfig.games.maxBet) : '0'
  );
  const [xpMultInput, setXpMultInput] = useState(() => String(siteConfig.games?.xpMultiplier ?? 1));
  const [dailyMultInput, setDailyMultInput] = useState(() =>
    String(siteConfig.games?.dailyMultiplier ?? 1)
  );

  // Controls state
  const [bannerText, setBannerText] = useState(siteConfig.banner?.text || '');
  const [bannerTone, setBannerTone] = useState(siteConfig.banner?.tone || 'info');
  const [broadcastText, setBroadcastText] = useState('');
  const [startBalInput, setStartBalInput] = useState(() => formatGems(siteConfig.startingBalance));
  const [discountInput, setDiscountInput] = useState(String(siteConfig.crateDiscountPct || 0));

  // Promos state
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoGemsInput, setPromoGemsInput] = useState('250K');
  const [promoMaxUses, setPromoMaxUses] = useState('0');
  const [promoMinLevel, setPromoMinLevel] = useState('1');
  const [promoMinWager, setPromoMinWager] = useState('0');
  const [promoAnnounce, setPromoAnnounce] = useState(true);

  // Backup / Audit state
  const [restoreJson, setRestoreJson] = useState('');
  const [auditSearch, setAuditSearch] = useState('');

  useEffect(() => {
    setBrandName(siteConfig.branding?.siteName || 'PETFLIP');
    setBrandSuffix(siteConfig.branding?.siteSuffix ?? '99');
    setCurrencyName(siteConfig.branding?.currencyName || 'Gems');
    setHeroTitle(siteConfig.branding?.heroTitle || '');
    setHeroSubtitle(siteConfig.branding?.heroSubtitle || '');
    setFooterText(siteConfig.branding?.footerText || '');
  }, [siteConfig.branding]);

  useEffect(() => {
    if (siteConfig.theme) {
      setThemeColors({
        preset: siteConfig.theme.preset || 'cyber',
        primary: siteConfig.theme.primary || '#4f6bff',
        gem: siteConfig.theme.gem || '#38d9ff',
        gold: siteConfig.theme.gold || '#ffc531',
        bg: siteConfig.theme.bg || '#0b0d14',
        panel: siteConfig.theme.panel || '#12151f',
      });
    }
  }, [siteConfig.theme]);

  useEffect(() => {
    setMinBetInput(formatGems(siteConfig.games?.minBet ?? 1000));
    setMaxBetInput(siteConfig.games?.maxBet ? formatGems(siteConfig.games.maxBet) : '0');
    setXpMultInput(String(siteConfig.games?.xpMultiplier ?? 1));
    setDailyMultInput(String(siteConfig.games?.dailyMultiplier ?? 1));
  }, [siteConfig.games]);

  useEffect(() => {
    setBannerText(siteConfig.banner?.text || '');
    setBannerTone(siteConfig.banner?.tone || 'info');
  }, [siteConfig.banner?.text, siteConfig.banner?.tone]);

  useEffect(() => {
    setStartBalInput(formatGems(siteConfig.startingBalance));
  }, [siteConfig.startingBalance]);

  useEffect(() => {
    setDiscountInput(String(siteConfig.crateDiscountPct || 0));
  }, [siteConfig.crateDiscountPct]);

  const petCatalog = useMemo(() => buildPetCatalog(), []);

  const stats = useMemo(() => {
    const list = Object.values(accounts);
    let totalGems = 0;
    let totalWagered = 0;
    let totalUserProfit = 0;
    let totalBets = 0;
    let bannedCount = 0;
    for (const acc of list) {
      totalGems += acc?.data?.balance || 0;
      totalWagered += acc?.data?.stats?.wagered || 0;
      totalUserProfit += acc?.data?.stats?.profit || 0;
      totalBets += acc?.data?.stats?.bets || 0;
      if (acc?.banned) bannedCount++;
    }
    return {
      totalAccounts: list.length,
      totalGems,
      totalWagered,
      houseProfit: -totalUserProfit,
      totalBets,
      bannedCount,
    };
  }, [accounts]);

  const topPlayers = useMemo(() => {
    return Object.entries(accounts)
      .sort((a, b) => (b[1]?.data?.balance || 0) - (a[1]?.data?.balance || 0))
      .slice(0, 6);
  }, [accounts]);

  const accountEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(accounts)
      .filter(([, acc]) => {
        if (!q) return true;
        return acc.username.toLowerCase().includes(q) || (acc.role || '').includes(q);
      })
      .sort((a, b) => {
        if (a[1].role !== b[1].role) return a[1].role === 'admin' ? -1 : 1;
        return (b[1].data?.balance || 0) - (a[1].data?.balance || 0);
      });
  }, [accounts, search]);

  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return (siteConfig.auditLog || []).filter(
      (e) =>
        !q ||
        (e.action || '').toLowerCase().includes(q) ||
        (e.admin || '').toLowerCase().includes(q)
    );
  }, [siteConfig.auditLog, auditSearch]);

  const activeBattles = useMemo(
    () => rooms.filter((r) => r.status === 'waiting' || r.status === 'playing'),
    [rooms]
  );

  // Auth gate
  if (!actor || !isAdmin) {
    return (
      <div className="admin-gate-wrap">
        <div className="card" style={{ padding: 32, maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <div className="admin-dash-brand-icon" style={{ margin: '0 auto 14px', width: 52, height: 52 }}>
            <ShieldAlert size={26} />
          </div>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Admin Command Center</h1>
          <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 20 }}>
            {!actor
              ? 'Sign in with an administrator account to access the full standalone dashboard.'
              : `Signed in as "${actor.username}" (${actor.role}). Administrator privileges are required.`}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {!actor && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openAuthModal('login')}
              >
                <LogIn size={16} /> Admin Sign In
              </button>
            )}
            <a href="/" className="btn btn-outline">
              <ExternalLink size={15} /> Open Live Site
            </a>
          </div>
        </div>
      </div>
    );
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    sound.click();
    await refreshLiveState();
    setRefreshing(false);
    pushToast('Synced live server state.', 'info');
  };

  const toggleConfig = async (label, fn, val) => {
    sound.click();
    const res = await fn(val);
    if (res.ok) {
      pushToast(`${label} -> ${val ? 'ON' : 'OFF'}`, 'info');
    } else {
      pushToast(res.error || 'Could not update setting.', 'error');
    }
  };

  const handleSaveBranding = async (e) => {
    e.preventDefault();
    sound.click();
    const res = await siteConfig.updateBranding(
      {
        siteName: brandName,
        siteSuffix: brandSuffix,
        currencyName,
        heroTitle,
        heroSubtitle,
        footerText,
      },
      `Updated site branding (${brandName} ${brandSuffix})`
    );
    if (res.ok) {
      sound.win();
      pushToast('Branding & copy updated live across the site!', 'success');
    } else {
      pushToast(res.error || 'Could not save branding.', 'error');
    }
  };

  const handleApplyThemePreset = async (presetKey) => {
    const preset = THEME_PRESETS[presetKey];
    if (!preset) return;
    sound.click();
    const next = {
      preset: presetKey,
      primary: preset.primary,
      gem: preset.gem,
      gold: preset.gold,
      bg: preset.bg,
      panel: preset.panel,
    };
    setThemeColors(next);
    const res = await siteConfig.updateTheme(next, `Applied theme preset: ${preset.label}`);
    if (res.ok) {
      sound.win();
      pushToast(`Applied "${preset.label}" theme live!`, 'success');
    } else {
      pushToast(res.error || 'Could not apply theme.', 'error');
    }
  };

  const handleSaveCustomTheme = async (e) => {
    e.preventDefault();
    sound.click();
    const res = await siteConfig.updateTheme(
      { ...themeColors, preset: 'custom' },
      'Applied custom color palette'
    );
    if (res.ok) {
      sound.win();
      pushToast('Custom color palette is now live!', 'success');
    } else {
      pushToast(res.error || 'Could not apply custom colors.', 'error');
    }
  };

  const handleSaveGamesRules = async (e) => {
    e.preventDefault();
    const parsedMin = parseGems(minBetInput);
    const parsedMax = maxBetInput.trim() === '0' ? 0 : parseGems(maxBetInput);
    const xpMult = Math.max(0.25, Math.min(20, Number(xpMultInput) || 1));
    const dailyMult = Math.max(0.25, Math.min(20, Number(dailyMultInput) || 1));
    if (!Number.isFinite(parsedMin) || parsedMin < 1) {
      pushToast('Enter a valid Minimum Bet (>= 1).', 'error');
      return;
    }
    sound.click();
    const res = await siteConfig.updateGamesConfig(
      {
        minBet: parsedMin,
        maxBet: Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 0,
        xpMultiplier: xpMult,
        dailyMultiplier: dailyMult,
      },
      `Updated game rules (Min ${formatGems(parsedMin)}, Max ${parsedMax > 0 ? formatGems(parsedMax) : '∞'}, XP ${xpMult}x, Daily ${dailyMult}x)`
    );
    if (res.ok) {
      sound.win();
      pushToast('Game limits & multipliers saved!', 'success');
    } else {
      pushToast(res.error || 'Could not save game rules.', 'error');
    }
  };

  const handleToggleAllGames = async (enableAll) => {
    sound.click();
    const enabledMap = Object.fromEntries(ALL_GAMES.map((g) => [g.id, enableAll]));
    const res = await siteConfig.updateGamesConfig(
      { enabled: enabledMap },
      enableAll ? 'Enabled all 11 games' : 'Disabled all 11 games'
    );
    if (res.ok) {
      pushToast(enableAll ? 'All 11 games are now ON.' : 'All 11 games are now PAUSED.', 'info');
    }
  };

  const handleAirdropAll = async (e) => {
    e.preventDefault();
    const parsed = parseGems(airdropInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      pushToast('Enter a valid gem amount (e.g. 5M or 500K).', 'error');
      return;
    }
    sound.click();
    const res = await siteConfig.airdropAll(parsed, airdropAnnounce, false);
    if (res.ok) {
      sound.win();
      await refreshLiveState();
      pushToast(`Airdropped +${formatGems(parsed)} gems to ${res.count} accounts!`, 'success');
    } else {
      pushToast(res.error || 'Airdrop failed.', 'error');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const parsedBal = parseGems(newBal);
    const res = await adminCreateAccount({
      username: newUser,
      password: newPass,
      role: newRole,
      balance: Number.isFinite(parsedBal) ? parsedBal : siteConfig.startingBalance,
    });
    if (!res.ok) {
      sound.lose();
      pushToast(res.error || 'Could not create account.', 'error');
      return;
    }
    sound.win();
    pushToast(`Created account "${res.account.username}"!`, 'success');
    setNewUser('');
    setNewPass('');
    setShowCreate(false);
  };

  const handleExportSnapshot = async () => {
    sound.click();
    const res = await siteConfig.exportSnapshot();
    if (!res.ok) {
      pushToast(res.error || 'Export failed.', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `petflip-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Downloaded full JSON backup!', 'success');
  };

  const handleRestoreSnapshot = async (e) => {
    e.preventDefault();
    let parsed;
    try {
      parsed = JSON.parse(restoreJson);
    } catch {
      pushToast('Invalid JSON format. Paste a valid backup snapshot.', 'error');
      return;
    }
    sound.click();
    const res = await siteConfig.restoreSnapshot(parsed);
    if (res.ok) {
      sound.win();
      await refreshLiveState();
      setRestoreJson('');
      pushToast('Restored backup snapshot successfully!', 'success');
    } else {
      pushToast(res.error || 'Restore failed.', 'error');
    }
  };

  const publishBanner = async (e) => {
    e.preventDefault();
    sound.click();
    const res = await siteConfig.setBanner(bannerText, bannerTone);
    if (res.ok) pushToast('Updated global site banner!', 'success');
  };

  const sendBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    sound.click();
    const res = await sendAdminBroadcast(broadcastText);
    if (res.ok) {
      setBroadcastText('');
      pushToast('Sent Trollbox admin broadcast!', 'success');
    }
  };

  const saveStartingBalance = async (e) => {
    e.preventDefault();
    const parsed = parseGems(startBalInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      pushToast('Enter a valid starting balance.', 'error');
      return;
    }
    sound.click();
    const res = await siteConfig.setStartingBalance(parsed);
    if (res.ok) pushToast(`Starting balance set to ${formatGems(res.saved)}.`, 'success');
  };

  const applyDiscount = async (pct) => {
    sound.click();
    const res = await siteConfig.setCrateDiscountPct(pct);
    if (res.ok) pushToast(`Global crate discount set to ${res.saved}%.`, 'success');
  };

  const activeNavItem =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === tab) || NAV_GROUPS[0].items[0];

  return (
    <div className="admin-dash-shell">
      {mobileNavOpen && (
        <div className="admin-dash-backdrop" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Dedicated Full-Screen Admin Sidebar */}
      <aside className={`admin-dash-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="admin-dash-brand">
          <div className="admin-dash-brand-icon">
            <ShieldAlert size={20} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="admin-dash-brand-title">
              {siteConfig.branding?.siteName || 'PETFLIP'}{' '}
              <span className="text-gold">{siteConfig.branding?.siteSuffix || '99'}</span>
            </div>
            <div className="admin-dash-brand-sub">Admin Command Center</div>
          </div>
          <button
            type="button"
            className="icon-btn admin-dash-mobile-btn"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="admin-dash-nav">
          {NAV_GROUPS.map((grp) => (
            <React.Fragment key={grp.group}>
              <div className="admin-dash-nav-group">{grp.group}</div>
              {grp.items.map((item) => {
                const Icon = item.icon;
                let badge = null;
                if (item.id === 'users') badge = stats.totalAccounts;
                if (item.id === 'battles' && activeBattles.length > 0) badge = activeBattles.length;
                if (item.id === 'promos' && promoCodes.length > 0) badge = promoCodes.length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-dash-nav-btn ${tab === item.id ? 'active' : ''}`}
                    onClick={() => {
                      sound.click();
                      setTab(item.id);
                      setMobileNavOpen(false);
                    }}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    {badge !== null && <span className="admin-dash-nav-badge">{badge}</span>}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        <div className="admin-dash-sidebar-foot">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-primary"
            style={{ width: '100%' }}
          >
            <ExternalLink size={14} /> Open Live Site ↗
          </a>
          <div className="text-muted" style={{ fontSize: 11.5, textAlign: 'center' }}>
            Signed in as <strong style={{ color: 'var(--text)' }}>{actor.username}</strong>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="admin-dash-main">
        <header className="admin-dash-topbar">
          <div className="admin-dash-topbar-left">
            <button
              type="button"
              className="icon-btn admin-dash-mobile-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={19} />
            </button>
            <div>
              <h1 style={{ fontSize: 18, lineHeight: 1.2 }}>{activeNavItem.label}</h1>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Live server controls — every change syncs to all players in real time
              </div>
            </div>
          </div>

          <div className="admin-dash-topbar-right">
            <span
              className={`admin-status-pill ${
                siteConfig.maintenanceMode ? 'admin-status-maint' : 'admin-status-live'
              }`}
            >
              <Activity size={13} />
              {siteConfig.maintenanceMode ? 'MAINTENANCE' : `LIVE · ${onlineCount} ONLINE`}
            </span>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={14} />
              <span>{refreshing ? 'Syncing…' : 'Sync'}</span>
            </button>

            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-gold"
            >
              <ExternalLink size={14} />
              <span>Live Site</span>
            </a>
          </div>
        </header>

        <div className="admin-dash-content">
          {/* 1. OVERVIEW */}
          {tab === 'overview' && (
            <>
              <div className="admin-kpi-grid">
                <div className="card admin-kpi-card">
                  <div className="admin-kpi-label">
                    <span>Total Accounts</span>
                    <Users size={15} className="text-primary" />
                  </div>
                  <div className="admin-kpi-value">{stats.totalAccounts}</div>
                  <div className="admin-kpi-sub">
                    {onlineCount} online · {stats.bannedCount} banned
                  </div>
                </div>

                <div className="card admin-kpi-card">
                  <div className="admin-kpi-label">
                    <span>Economy Balance</span>
                    <Gem size={15} className="text-gem" />
                  </div>
                  <div className="admin-kpi-value text-gem">{formatGems(stats.totalGems)}</div>
                  <div className="admin-kpi-sub">Across all player wallets</div>
                </div>

                <div className="card admin-kpi-card">
                  <div className="admin-kpi-label">
                    <span>Total Wagered</span>
                    <Coins size={15} className="text-gold" />
                  </div>
                  <div className="admin-kpi-value text-gold">{formatGems(stats.totalWagered)}</div>
                  <div className="admin-kpi-sub">{stats.totalBets.toLocaleString()} total bets</div>
                </div>

                <div className="card admin-kpi-card">
                  <div className="admin-kpi-label">
                    <span>Net House Profit</span>
                    <Zap size={15} className="text-green" />
                  </div>
                  <div
                    className={`admin-kpi-value ${stats.houseProfit >= 0 ? 'text-green' : 'text-red'}`}
                  >
                    {stats.houseProfit >= 0 ? '+' : '-'}
                    {formatGems(Math.abs(stats.houseProfit))}
                  </div>
                  <div className="admin-kpi-sub">
                    XP {siteConfig.games?.xpMultiplier || 1}× · Daily{' '}
                    {siteConfig.games?.dailyMultiplier || 1}×
                  </div>
                </div>

                <div className="card admin-kpi-card">
                  <div className="admin-kpi-label">
                    <span>Active Battles</span>
                    <Swords size={15} className="text-purple" />
                  </div>
                  <div className="admin-kpi-value text-purple">{activeBattles.length}</div>
                  <div className="admin-kpi-sub">{rooms.length} total rooms</div>
                </div>
              </div>

              <div className="admin-two-col">
                <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Wrench size={16} className="text-gold" />
                    <span>Instant Quick Switches</span>
                  </div>
                  <ToggleRow
                    title="Maintenance Mode"
                    desc="Immediately pause all betting for non-admins"
                    checked={siteConfig.maintenanceMode}
                    onChange={(v) => toggleConfig('Maintenance Mode', siteConfig.setMaintenanceMode, v)}
                  />
                  <ToggleRow
                    title="Free Demo Deposits"
                    desc="Allow players to claim free demo gems"
                    checked={siteConfig.allowDeposits}
                    onChange={(v) => toggleConfig('Free Demo Deposits', siteConfig.setAllowDeposits, v)}
                  />
                  <ToggleRow
                    title="Bot Activity & Fake Drops"
                    desc="Toggle simulated bot bets, drops, and chat"
                    checked={siteConfig.botsEnabled}
                    onChange={(v) => toggleConfig('Bot Activity', siteConfig.setBotsEnabled, v)}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                    <button type="button" className="btn btn-sm btn-gold" onClick={() => applyDiscount(25)}>
                      Start 25% Crate Sale
                    </button>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => applyDiscount(0)}>
                      End Sale
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setTab('branding')}>
                      Customize Theme →
                    </button>
                  </div>
                </div>

                <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={16} className="text-gem" />
                    <span>Quick Gem Rain (All Players)</span>
                  </div>
                  <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
                    Drop free gems into every active player&apos;s wallet at once and announce it in Trollbox.
                  </p>
                  <form onSubmit={handleAirdropAll} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['1M', '5M', '25M', '100M'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`btn btn-sm ${airdropInput === preset ? 'btn-gold' : 'btn-outline'}`}
                          onClick={() => setAirdropInput(preset)}
                        >
                          +{preset}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="input"
                        value={airdropInput}
                        onChange={(e) => setAirdropInput(e.target.value)}
                        placeholder="e.g. 10M"
                      />
                      <button type="submit" className="btn btn-sm btn-green">
                        <Gift size={14} /> Rain Gems
                      </button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={airdropAnnounce}
                        onChange={(e) => setAirdropAnnounce(e.target.checked)}
                      />
                      <span>Broadcast Admin Rain in Trollbox Chat</span>
                    </label>
                  </form>
                </div>
              </div>

              <div className="admin-two-col">
                <div className="card live-bets-card">
                  <div className="live-bets-header">
                    <div className="live-bets-title">Richest Players</div>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setTab('users')}>
                      Manage All
                    </button>
                  </div>
                  <div className="live-bets-table-wrap">
                    <table className="live-bets-table">
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Balance</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topPlayers.map(([key, acc]) => (
                          <tr key={key}>
                            <td>
                              <strong>{acc.username}</strong>{' '}
                              <span className={`role-badge ${acc.role === 'admin' ? 'role-badge-admin' : 'role-badge-user'}`}>
                                {acc.role}
                              </span>
                            </td>
                            <td className="text-gem">
                              <GemAmount value={acc.data?.balance || 0} iconSize={13} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => setSelectedKey(key)}
                              >
                                Manage
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card live-bets-card">
                  <div className="live-bets-header">
                    <div className="live-bets-title">Recent Admin Actions</div>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setTab('system')}>
                      Full Log
                    </button>
                  </div>
                  <div className="live-bets-table-wrap">
                    <table className="live-bets-table">
                      <tbody>
                        {(siteConfig.auditLog || []).slice(0, 6).map((entry) => (
                          <tr key={entry.id}>
                            <td className="text-muted" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                              {new Date(entry.time).toLocaleTimeString()}
                            </td>
                            <td style={{ fontSize: 12.5 }}>{entry.action}</td>
                          </tr>
                        ))}
                        {(!siteConfig.auditLog || siteConfig.auditLog.length === 0) && (
                          <tr>
                            <td className="text-muted" style={{ textAlign: 'center', padding: 20 }}>
                              No admin actions recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 2. BRANDING & THEME STUDIO */}
          {tab === 'branding' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Palette size={17} className="text-gold" />
                  <span>One-Click Theme Presets</span>
                </div>
                <div className="admin-theme-presets">
                  {Object.entries(THEME_PRESETS).map(([key, p]) => (
                    <button
                      key={key}
                      type="button"
                      className={`admin-preset-btn ${themeColors.preset === key ? 'active' : ''}`}
                      onClick={() => handleApplyThemePreset(key)}
                    >
                      <div className="admin-swatch-row">
                        <span className="admin-swatch" style={{ background: p.primary }} />
                        <span className="admin-swatch" style={{ background: p.gem }} />
                        <span className="admin-swatch" style={{ background: p.gold }} />
                        <span className="admin-swatch" style={{ background: p.bg }} />
                      </div>
                      <strong style={{ fontSize: 13 }}>{p.label}</strong>
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSaveCustomTheme} style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Custom Color Palette</div>
                  <div className="admin-color-grid">
                    {[
                      { key: 'primary', label: 'Primary Accent' },
                      { key: 'gem', label: 'Gem / Cyan' },
                      { key: 'gold', label: 'Gold / VIP' },
                      { key: 'bg', label: 'Page Background' },
                      { key: 'panel', label: 'Card / Panel' },
                    ].map((c) => (
                      <label key={c.key} className="admin-color-field">
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {c.label}
                        </span>
                        <div className="admin-color-row">
                          <input
                            type="color"
                            value={themeColors[c.key]}
                            onChange={(e) =>
                              setThemeColors((prev) => ({ ...prev, [c.key]: e.target.value }))
                            }
                          />
                          <input
                            className="input"
                            style={{ height: 32, fontSize: 12.5, fontFamily: 'monospace' }}
                            value={themeColors[c.key]}
                            onChange={(e) =>
                              setThemeColors((prev) => ({ ...prev, [c.key]: e.target.value }))
                            }
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                  <div>
                    <button type="submit" className="btn btn-sm btn-primary">
                      <CheckCircle2 size={14} /> Apply Custom Colors Live
                    </button>
                  </div>
                </form>
              </div>

              <div className="admin-two-col">
                <form
                  onSubmit={handleSaveBranding}
                  className="card"
                  style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>Site Identity &amp; Copy</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                    <label className="field-label">
                      <span>Site Name</span>
                      <input
                        className="input"
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        maxLength={28}
                      />
                    </label>
                    <label className="field-label">
                      <span>Badge</span>
                      <input
                        className="input"
                        value={brandSuffix}
                        onChange={(e) => setBrandSuffix(e.target.value)}
                        maxLength={10}
                      />
                    </label>
                    <label className="field-label">
                      <span>Currency</span>
                      <input
                        className="input"
                        value={currencyName}
                        onChange={(e) => setCurrencyName(e.target.value)}
                        maxLength={20}
                      />
                    </label>
                  </div>

                  <label className="field-label">
                    <span>Homepage Hero Headline</span>
                    <input
                      className="input"
                      value={heroTitle}
                      onChange={(e) => setHeroTitle(e.target.value)}
                      maxLength={90}
                    />
                  </label>

                  <label className="field-label">
                    <span>Homepage Hero Subtitle</span>
                    <input
                      className="input"
                      value={heroSubtitle}
                      onChange={(e) => setHeroSubtitle(e.target.value)}
                      maxLength={200}
                    />
                  </label>

                  <label className="field-label">
                    <span>Footer Disclaimer Text</span>
                    <input
                      className="input"
                      value={footerText}
                      onChange={(e) => setFooterText(e.target.value)}
                      maxLength={260}
                    />
                  </label>

                  <div>
                    <button type="submit" className="btn btn-sm btn-green">
                      Save Branding Live
                    </button>
                  </div>
                </form>

                <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>Layout &amp; UI Visibility</div>
                  <ToggleRow
                    title="Live Drops Ticker"
                    desc="Show the scrolling top live pet drops bar across the site"
                    checked={siteConfig.ui?.showLiveTicker !== false}
                    onChange={(v) =>
                      toggleConfig(
                        'Live Drops Ticker',
                        (val) => siteConfig.updateUiConfig({ showLiveTicker: val }, `Set Live Drops Ticker -> ${val ? 'ON' : 'OFF'}`),
                        v
                      )
                    }
                  />
                  <ToggleRow
                    title="Sidebar Daily Rewards Card"
                    desc="Show the golden Daily Rewards promo card at the bottom of the sidebar"
                    checked={siteConfig.ui?.showPromoSidebar !== false}
                    onChange={(v) =>
                      toggleConfig(
                        'Sidebar Promo Card',
                        (val) => siteConfig.updateUiConfig({ showPromoSidebar: val }, `Set Sidebar Promo Card -> ${val ? 'ON' : 'OFF'}`),
                        v
                      )
                    }
                  />
                  <ToggleRow
                    title="Footer Fairness Link"
                    desc="Show the discreet Fairness & House Edge link in the site footer"
                    checked={siteConfig.ui?.showFairnessLink !== false}
                    onChange={(v) =>
                      toggleConfig(
                        'Footer Fairness Link',
                        (val) => siteConfig.updateUiConfig({ showFairnessLink: val }, `Set Footer Fairness Link -> ${val ? 'ON' : 'OFF'}`),
                        v
                      )
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. GAMES & MULTIPLIERS */}
          {tab === 'games' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <form
                onSubmit={handleSaveGamesRules}
                className="card"
                style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                <div style={{ fontWeight: 700, fontSize: 15.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Zap size={17} className="text-gold" />
                  <span>Global Bet Limits &amp; Event Multipliers</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                    gap: 12,
                  }}
                >
                  <label className="field-label">
                    <span>Minimum Bet</span>
                    <input
                      className="input"
                      value={minBetInput}
                      onChange={(e) => setMinBetInput(e.target.value)}
                      placeholder="e.g. 1K"
                    />
                  </label>
                  <label className="field-label">
                    <span>Maximum Bet (0 = Unlimited)</span>
                    <input
                      className="input"
                      value={maxBetInput}
                      onChange={(e) => setMaxBetInput(e.target.value)}
                      placeholder="0 or e.g. 500M"
                    />
                  </label>
                  <label className="field-label">
                    <span>XP Multiplier (e.g. 2 = Double XP)</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="20"
                      className="input"
                      value={xpMultInput}
                      onChange={(e) => setXpMultInput(e.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>Daily Reward Multiplier</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="20"
                      className="input"
                      value={dailyMultInput}
                      onChange={(e) => setDailyMultInput(e.target.value)}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="submit" className="btn btn-sm btn-green">
                    Save Game Rules
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-gold"
                    onClick={() => {
                      setXpMultInput('2');
                      setDailyMultInput('2');
                    }}
                  >
                    2× Weekend Preset
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setXpMultInput('1');
                      setDailyMultInput('1');
                    }}
                  >
                    Normal 1×
                  </button>
                </div>
              </form>

              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Gamepad2 size={17} className="text-gem" />
                    <span>Individual Game Switches (11 Games)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-sm btn-green" onClick={() => handleToggleAllGames(true)}>
                      Enable All
                    </button>
                    <button type="button" className="btn btn-sm btn-red" onClick={() => handleToggleAllGames(false)}>
                      Disable All
                    </button>
                  </div>
                </div>

                <div className="admin-games-grid">
                  {ALL_GAMES.map((g) => {
                    const isEnabled = siteConfig.games?.enabled?.[g.id] !== false;
                    return (
                      <div key={g.id} className={`admin-game-card ${isEnabled ? '' : 'disabled'}`}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{g.label}</div>
                          <div className="text-muted" style={{ fontSize: 11.5 }}>{g.path}</div>
                        </div>
                        <button
                          type="button"
                          className={`btn btn-sm ${isEnabled ? 'btn-green' : 'btn-red'}`}
                          onClick={async () => {
                            sound.click();
                            const res = await siteConfig.toggleGameEnabled(g.id, !isEnabled, g.label);
                            if (res.ok) {
                              pushToast(`${g.label} -> ${!isEnabled ? 'ON' : 'OFF'}`, 'info');
                            }
                          }}
                        >
                          {isEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 4. USERS & AIRDROPS */}
          {tab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form
                onSubmit={handleAirdropAll}
                className="card"
                style={{
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>Mass Gem Rain / Airdrop</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    Credit gems to all non-banned accounts simultaneously.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    style={{ width: 130 }}
                    value={airdropInput}
                    onChange={(e) => setAirdropInput(e.target.value)}
                    placeholder="e.g. 5M"
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={airdropAnnounce}
                      onChange={(e) => setAirdropAnnounce(e.target.checked)}
                    />
                    <span>Chat Announce</span>
                  </label>
                  <button type="submit" className="btn btn-sm btn-gold">
                    <Gift size={14} /> Airdrop All
                  </button>
                </div>
              </form>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                  <Search
                    size={15}
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
                    style={{ paddingLeft: 34 }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search accounts by username or role…"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-green"
                  onClick={() => {
                    sound.click();
                    setShowCreate((v) => !v);
                  }}
                >
                  <UserPlus size={15} />
                  <span>{showCreate ? 'Hide Form' : 'Create Account'}</span>
                </button>
              </div>

              {showCreate && (
                <form onSubmit={handleCreateUser} className="card" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Create New Account</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    <input
                      className="input"
                      value={newUser}
                      onChange={(e) => setNewUser(e.target.value)}
                      placeholder="Username (3-20 chars)"
                      maxLength={20}
                      required
                    />
                    <input
                      type="password"
                      className="input"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      placeholder="Password (min 4)"
                      required
                    />
                    <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                      <option value="user">Role: User</option>
                      <option value="admin">Role: Admin</option>
                    </select>
                    <input
                      className="input"
                      value={newBal}
                      onChange={(e) => setNewBal(e.target.value)}
                      placeholder="Starting balance (e.g. 500K)"
                    />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button type="submit" className="btn btn-sm btn-primary">
                      Create Account
                    </button>
                  </div>
                </form>
              )}

              <div className="card live-bets-card">
                <div className="live-bets-header">
                  <div className="live-bets-title">All Accounts ({accountEntries.length})</div>
                </div>
                <div className="live-bets-table-wrap">
                  <table className="live-bets-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Balance</th>
                        <th>Level / Bets / Pets</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountEntries.map(([key, acc]) => {
                        const d = acc.data || {};
                        return (
                          <tr key={key}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <strong>{acc.username}</strong>
                                <span className={`role-badge ${acc.role === 'admin' ? 'role-badge-admin' : 'role-badge-user'}`}>
                                  {acc.role}
                                </span>
                                {acc.banned && <span className="role-badge role-badge-banned">BANNED</span>}
                                {key === currentUserKey && <span className="tier-badge tier-badge-huge">YOU</span>}
                              </div>
                            </td>
                            <td className="text-gem">
                              <GemAmount value={d.balance || 0} iconSize={14} />
                            </td>
                            <td className="text-muted">
                              Lvl {getLevel(d.xp || 0)} · {d.stats?.bets || 0} bets · {(d.inventory || []).length} pets
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  sound.click();
                                  setSelectedKey(key);
                                }}
                              >
                                Manage
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 5. CRATES & PRICING */}
          {tab === 'crates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                className="card"
                style={{
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Global Crate Sale Discount</div>
                  <div className="text-muted" style={{ fontSize: 12.5 }}>
                    Apply 0%–80% off across Crates, Case Opening, and Case Battles — or toggle individual crates ON/OFF below.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {[0, 10, 25, 50, 75].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className={`btn btn-sm ${siteConfig.crateDiscountPct === pct ? 'btn-gold' : 'btn-outline'}`}
                      onClick={() => applyDiscount(pct)}
                    >
                      {pct === 0 ? 'No Sale' : `-${pct}%`}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="0"
                    max="80"
                    className="input"
                    style={{ width: 72 }}
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                  />
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => applyDiscount(discountInput)}>
                    Apply %
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-red"
                    onClick={async () => {
                      sound.click();
                      const res = await siteConfig.resetCratePricing();
                      if (res.ok) pushToast('Restored default pricing & enabled all crates.', 'info');
                    }}
                  >
                    Reset All
                  </button>
                </div>
              </div>

              <div className="admin-crates-grid">
                {ps99.crates.map((crate) => (
                  <CrateControlCard key={crate.id} crate={crate} siteConfig={siteConfig} />
                ))}
              </div>
            </div>
          )}

          {/* 6. BATTLES & DROPS */}
          {tab === 'battles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Live Case Battles &amp; Drops Ticker</div>
                  <div className="text-muted" style={{ fontSize: 12.5 }}>
                    {rooms.length} battle rooms · {drops.length} live ticker drops
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={async () => {
                      sound.click();
                      const res = await siteConfig.clearFinishedBattles();
                      if (res.ok) {
                        await refreshLiveState();
                        pushToast(`Cleared ${res.removed} finished battles.`, 'info');
                      }
                    }}
                  >
                    <Trash2 size={14} /> Clear Finished Battles
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-red"
                    onClick={async () => {
                      sound.click();
                      const res = await siteConfig.clearDropsFeed();
                      if (res.ok) {
                        await refreshLiveState();
                        pushToast('Cleared Live Drops Ticker feed.', 'info');
                      }
                    }}
                  >
                    <Trash2 size={14} /> Clear Drops Ticker
                  </button>
                </div>
              </div>

              <div className="card live-bets-card">
                <div className="live-bets-header">
                  <div className="live-bets-title">All Case Battle Rooms ({rooms.length})</div>
                </div>
                <div className="live-bets-table-wrap">
                  <table className="live-bets-table">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Mode</th>
                        <th>Cost</th>
                        <th>Players</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Admin Controls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>
                            No active or recent Case Battles.
                          </td>
                        </tr>
                      ) : (
                        rooms.map((b) => {
                          const seated = (b.players || []).filter(Boolean).length;
                          return (
                            <tr key={b.id}>
                              <td>
                                <strong>{b.creatorName || 'Player'}</strong>{' '}
                                <span className="text-muted" style={{ fontSize: 11.5 }}>
                                  ({b.crates?.length || 0} crates)
                                </span>
                              </td>
                              <td>{b.mode}</td>
                              <td className="text-gem">
                                <GemAmount value={b.cost || 0} iconSize={13} />
                              </td>
                              <td>
                                {seated} / {b.seatsCount}
                              </td>
                              <td>
                                <span
                                  className={`tier-badge ${
                                    b.status === 'waiting'
                                      ? 'tier-badge-huge'
                                      : b.status === 'playing'
                                        ? 'tier-badge-titanic'
                                        : ''
                                  }`}
                                >
                                  {String(b.status || '').toUpperCase()}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  {b.status === 'waiting' && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-gold"
                                        onClick={async () => {
                                          sound.click();
                                          const res = await callBot(b.id, null, true);
                                          if (res.ok) pushToast('Filled battle with bots!', 'success');
                                          else pushToast(res.error || 'Failed.', 'error');
                                        }}
                                      >
                                        <Bot size={13} /> Fill Bots
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-red"
                                        onClick={async () => {
                                          sound.click();
                                          const res = await leaveRoom(b.id);
                                          if (res.ok) pushToast('Cancelled & refunded battle!', 'info');
                                          else pushToast(res.error || 'Failed.', 'error');
                                        }}
                                      >
                                        Cancel &amp; Refund
                                      </button>
                                    </>
                                  )}
                                  <a
                                    href={`/#/battles/${b.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-sm btn-outline"
                                  >
                                    View ↗
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 7. PROMO CODES */}
          {tab === 'promos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form
                className="card"
                style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const parsedGems = parseGems(promoGemsInput);
                  if (!Number.isFinite(parsedGems) || parsedGems < 1000) {
                    pushToast('Enter a valid gem reward (>= 1,000, e.g. 250K or 1M).', 'error');
                    return;
                  }
                  const parsedMinWager = promoMinWager.trim() === '0' ? 0 : parseGems(promoMinWager);
                  const res = await adminCreatePromo({
                    code: promoCodeInput,
                    gems: parsedGems,
                    maxUses: Math.max(0, Math.round(Number(promoMaxUses) || 0)),
                    minLevel: Math.max(1, Math.round(Number(promoMinLevel) || 1)),
                    minWagered: Number.isFinite(parsedMinWager) ? Math.max(0, parsedMinWager) : 0,
                    announce: promoAnnounce,
                  });
                  if (!res.ok) {
                    sound.lose();
                    pushToast(res.error || 'Could not create promo code.', 'error');
                    return;
                  }
                  sound.win();
                  setPromoCodeInput('');
                  pushToast(`Created promo code "${res.promo.code}"!`, 'success');
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
                  <Ticket size={17} className="text-gold" />
                  <span>Create Promo Code</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 10 }}>
                  <label className="field-label">
                    <span>Code</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        className="input"
                        style={{ textTransform: 'uppercase', fontWeight: 700 }}
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                        placeholder="e.g. HUGE250K"
                        maxLength={24}
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ height: 40 }}
                        onClick={() => {
                          sound.click();
                          const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
                          setPromoCodeInput(`PET99-${rnd}`);
                        }}
                        title="Generate random code"
                      >
                        <Sparkles size={14} />
                      </button>
                    </div>
                  </label>
                  <label className="field-label">
                    <span>Gem Reward</span>
                    <input
                      className="input"
                      value={promoGemsInput}
                      onChange={(e) => setPromoGemsInput(e.target.value)}
                      required
                    />
                  </label>
                  <label className="field-label">
                    <span>Max Uses (0 = ∞)</span>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={promoMaxUses}
                      onChange={(e) => setPromoMaxUses(e.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>Min Level</span>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={promoMinLevel}
                      onChange={(e) => setPromoMinLevel(e.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    <span>Min Wagered</span>
                    <input
                      className="input"
                      value={promoMinWager}
                      onChange={(e) => setPromoMinWager(e.target.value)}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={promoAnnounce}
                      onChange={(e) => setPromoAnnounce(e.target.checked)}
                    />
                    <span>Announce new promo code in Trollbox Chat</span>
                  </label>
                  <button type="submit" className="btn btn-sm btn-green">
                    <Ticket size={15} /> Create Promo Code
                  </button>
                </div>
              </form>

              <div className="card live-bets-card">
                <div className="live-bets-header">
                  <div className="live-bets-title">All Promo Codes ({promoCodes.length})</div>
                </div>
                <div className="live-bets-table-wrap">
                  <table className="live-bets-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Reward</th>
                        <th>Uses</th>
                        <th>Requirements</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promoCodes.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>
                            No promo codes created yet.
                          </td>
                        </tr>
                      ) : (
                        promoCodes.map((p) => {
                          const exhausted = (p.maxUses || 0) > 0 && (p.uses || 0) >= p.maxUses;
                          return (
                            <tr key={p.code}>
                              <td>
                                <strong className="text-gold">{p.code}</strong>
                              </td>
                              <td className="text-gem">
                                <GemAmount value={p.gems} iconSize={14} />
                              </td>
                              <td>
                                {p.uses || 0} / {p.maxUses > 0 ? p.maxUses : '∞'}
                              </td>
                              <td className="text-muted">
                                Lvl {p.minLevel || 1}+
                                {(p.minWagered || 0) > 0 ? ` · ${formatGems(p.minWagered)}+` : ''}
                              </td>
                              <td>
                                {exhausted ? (
                                  <span className="role-badge role-badge-banned">EXHAUSTED</span>
                                ) : p.active ? (
                                  <span className="tier-badge tier-badge-huge" style={{ color: 'var(--green)' }}>
                                    ACTIVE
                                  </span>
                                ) : (
                                  <span className="tier-badge">PAUSED</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-gold"
                                    onClick={async () => {
                                      sound.click();
                                      const res = await adminAnnouncePromo(p.code);
                                      if (res.ok) pushToast(`Announced "${p.code}" in chat!`, 'success');
                                    }}
                                  >
                                    <Megaphone size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline"
                                    onClick={async () => {
                                      sound.click();
                                      const res = await adminTogglePromo(p.code, !p.active);
                                      if (res.ok) pushToast(`${p.code} ${!p.active ? 'enabled' : 'paused'}.`, 'info');
                                    }}
                                  >
                                    {p.active ? <Pause size={13} /> : <Play size={13} />}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-red"
                                    onClick={async () => {
                                      sound.click();
                                      const res = await adminDeletePromo(p.code);
                                      if (res.ok) pushToast(`Deleted "${p.code}".`, 'info');
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 8. SITE CONTROLS & CHAT */}
          {tab === 'controls' && (
            <div className="admin-two-col">
              <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
                  <Megaphone size={17} className="text-gold" />
                  <span>Site Banner &amp; Trollbox Broadcast</span>
                </div>

                <form onSubmit={publishBanner} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="field-label">
                    <span>Top Announcement Banner</span>
                    <input
                      className="input"
                      value={bannerText}
                      onChange={(e) => setBannerText(e.target.value)}
                      placeholder="Optional global banner above games…"
                      maxLength={180}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      className="input"
                      style={{ width: 'auto', minWidth: 120 }}
                      value={bannerTone}
                      onChange={(e) => setBannerTone(e.target.value)}
                    >
                      <option value="info">Blue Info</option>
                      <option value="gold">Gold Event</option>
                      <option value="danger">Red Alert</option>
                    </select>
                    <button type="submit" className="btn btn-sm btn-primary">
                      Update Banner
                    </button>
                    {siteConfig.banner?.text && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={async () => {
                          sound.click();
                          const res = await siteConfig.setBanner('', 'info');
                          if (res.ok) pushToast('Cleared banner.', 'info');
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>

                <form
                  onSubmit={sendBroadcast}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}
                >
                  <label className="field-label">
                    <span>Trollbox Admin Broadcast</span>
                    <input
                      className="input"
                      value={broadcastText}
                      onChange={(e) => setBroadcastText(e.target.value)}
                      placeholder="Announce an event or drop in chat…"
                      maxLength={200}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="submit" className="btn btn-sm btn-gold">
                      Send Broadcast
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-red"
                      onClick={async () => {
                        sound.click();
                        const res = await clearMessages();
                        if (res.ok) pushToast('Cleared Trollbox chat.', 'info');
                      }}
                    >
                      Clear Chat
                    </button>
                  </div>
                </form>
              </div>

              <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
                  <Sliders size={17} className="text-gem" />
                  <span>Economy &amp; Feature Toggles</span>
                </div>

                <form onSubmit={saveStartingBalance} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <label className="field-label" style={{ flex: 1, minWidth: 160 }}>
                    <span>New Account Starting Balance</span>
                    <input
                      className="input"
                      value={startBalInput}
                      onChange={(e) => setStartBalInput(e.target.value)}
                      placeholder="e.g. 500K"
                    />
                  </label>
                  <button type="submit" className="btn btn-sm btn-primary" style={{ height: 40 }}>
                    Save
                  </button>
                </form>

                <ToggleRow
                  title="Allow Free Demo Deposits"
                  desc="Allow regular users to claim free gems from the + Deposit modal"
                  checked={siteConfig.allowDeposits}
                  onChange={(v) => toggleConfig('Allow Free Demo Deposits', siteConfig.setAllowDeposits, v)}
                />
                <ToggleRow
                  title="Allow New Registrations"
                  desc="Let visitors create new username + password accounts"
                  checked={siteConfig.allowRegistration}
                  onChange={(v) => toggleConfig('Allow New Registrations', siteConfig.setAllowRegistration, v)}
                />
                <ToggleRow
                  title="Maintenance Mode"
                  desc="Pause all bets for non-admin accounts and display maintenance bar"
                  checked={siteConfig.maintenanceMode}
                  onChange={(v) => toggleConfig('Maintenance Mode', siteConfig.setMaintenanceMode, v)}
                />
                <ToggleRow
                  title="Trollbox Chat Enabled"
                  desc="Allow regular players to post messages in live chat"
                  checked={siteConfig.chatEnabled}
                  onChange={(v) => toggleConfig('Trollbox Chat', siteConfig.setChatEnabled, v)}
                />
                <ToggleRow
                  title="Bot Activity & Fake Drops"
                  desc="Toggle simulated bot chat messages, live bets, and drop feed"
                  checked={siteConfig.botsEnabled}
                  onChange={(v) => toggleConfig('Bot Activity & Fake Drops', siteConfig.setBotsEnabled, v)}
                />
              </div>
            </div>
          )}

          {/* 9. BACKUP & AUDIT LOG */}
          {tab === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="admin-two-col">
                <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Download size={16} className="text-gem" />
                    <span>Export Full Backup &amp; Reset</span>
                  </div>
                  <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
                    Download a full JSON snapshot of all accounts, balances, site config, theme, and promo codes.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={handleExportSnapshot}>
                      <Download size={14} /> Download Backup JSON
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-red"
                      onClick={async () => {
                        sound.click();
                        const res = await siteConfig.resetAllConfig();
                        if (res.ok) pushToast('Reset all site settings & theme to defaults.', 'info');
                      }}
                    >
                      <RotateCcw size={14} /> Reset Config to Defaults
                    </button>
                  </div>
                </div>

                <form
                  onSubmit={handleRestoreSnapshot}
                  className="card"
                  style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Upload size={16} className="text-gold" />
                    <span>Restore From Backup JSON</span>
                  </div>
                  <textarea
                    className="input"
                    rows={3}
                    style={{ height: 'auto', padding: 10, fontFamily: 'monospace', fontSize: 12 }}
                    value={restoreJson}
                    onChange={(e) => setRestoreJson(e.target.value)}
                    placeholder='Paste backup JSON here ({"accounts": ..., "siteConfig": ...})'
                  />
                  <div>
                    <button type="submit" className="btn btn-sm btn-gold" disabled={!restoreJson.trim()}>
                      <Upload size={14} /> Restore Snapshot
                    </button>
                  </div>
                </form>
              </div>

              <div className="card live-bets-card">
                <div className="live-bets-header" style={{ flexWrap: 'wrap', gap: 10 }}>
                  <div className="live-bets-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ScrollText size={16} className="text-gold" />
                    <span>Admin Audit Log ({filteredAudit.length})</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="input"
                      style={{ height: 32, width: 200, fontSize: 12.5 }}
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      placeholder="Filter audit log…"
                    />
                    {(siteConfig.auditLog?.length || 0) > 0 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={async () => {
                          sound.click();
                          const res = await siteConfig.clearAuditLog();
                          if (res.ok) pushToast('Cleared audit log.', 'info');
                        }}
                      >
                        Clear Log
                      </button>
                    )}
                  </div>
                </div>
                <div className="live-bets-table-wrap">
                  <table className="live-bets-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Admin</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAudit.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>
                            No matching admin actions.
                          </td>
                        </tr>
                      ) : (
                        filteredAudit.map((entry) => (
                          <tr key={entry.id}>
                            <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                              {new Date(entry.time).toLocaleString()}
                            </td>
                            <td>
                              <span className="role-badge role-badge-admin">{entry.admin}</span>
                            </td>
                            <td>{entry.action}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ManageUserModal
        targetKey={selectedKey}
        account={selectedKey ? accounts[selectedKey] || null : null}
        isSelf={selectedKey === currentUserKey}
        onClose={() => setSelectedKey(null)}
        petCatalog={petCatalog}
      />
    </div>
  );
}
