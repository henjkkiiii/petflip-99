import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  CheckCircle2,
  Gem,
  Gift,
  KeyRound,
  LogIn,
  Megaphone,
  PackageOpen,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Ticket,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import ps99 from '../data/ps99.json';
import { useAuth } from '../store/useAuth.js';
import { getLevel } from '../store/useGame.js';
import { getEffectiveCratePrice, useSiteConfig } from '../store/siteConfig.js';
import { useChat } from '../store/chat.js';
import { useToast } from '../store/toast.js';
import { formatGems, formatGemsFull, parseGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { GemAmount } from '../components/GemAmount.jsx';
import { PetImage } from '../components/PetImage.jsx';
import { Modal } from '../components/Modal.jsx';

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

function CratePriceRow({ crate, siteConfig, adminUsername }) {
  const effective = getEffectiveCratePrice(crate, siteConfig);
  const override = siteConfig.cratePriceOverrides?.[crate.id];
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

  return (
    <div className="card admin-crate-card">
      <div className="admin-crate-head">
        <img
          src={crate.icon}
          alt={crate.name}
          style={{ width: 52, height: 52, objectFit: 'contain' }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {crate.name}
          </div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>
            Default: {formatGems(crate.price)} · Active:{' '}
            <strong className="text-gem">{formatGems(effective)}</strong>
          </div>
        </div>
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
    handleFeedback(
      res,
      `${delta > 0 ? 'Added' : 'Removed'} ${formatGems(Math.abs(delta))} gems!`
    );
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
    handleFeedback(
      await auth.adminSetXp(targetKey, num),
      `Updated ${account.username} XP to ${num}!`
    );
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
    <Modal
      open={Boolean(account)}
      onClose={onClose}
      title={`Manage User: ${account.username}`}
      maxWidth={600}
    >
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
            <span
              className={`role-badge ${
                account.role === 'admin' ? 'role-badge-admin' : 'role-badge-user'
              }`}
            >
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

        {/* Balance Controls */}
        <div className="admin-modal-section">
          <div className="admin-modal-title">
            <Gem size={14} className="text-gem" />
            <span>Gem Balance Controls</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[1_000_000, 10_000_000, 100_000_000, 1_000_000_000].map((amt) => (
              <button
                key={amt}
                type="button"
                className="btn btn-sm btn-green"
                onClick={() => quickGem(amt)}
              >
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

        {/* Grant PS99 Pet */}
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
            <input
              type="checkbox"
              checked={announceDrop}
              onChange={(e) => setAnnounceDrop(e.target.checked)}
            />
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

        {/* XP, Cooldown, Security */}
        <div className="admin-modal-section">
          <div className="admin-modal-title">
            <KeyRound size={14} className="text-purple" />
            <span>Progress, Password &amp; Moderation</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <form onSubmit={applyXp} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }}>
              <input
                type="number"
                min="0"
                className="input"
                value={xpInput}
                onChange={(e) => setXpInput(e.target.value)}
                placeholder="XP"
              />
              <button type="submit" className="btn btn-sm btn-outline">
                Set XP
              </button>
            </form>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={async () =>
                handleFeedback(
                  await auth.adminResetDaily(targetKey),
                  `Reset Daily Reward cooldown for ${account.username}.`
                )
              }
            >
              Reset Daily Cooldown
            </button>
          </div>

          <form onSubmit={applyPassReset} style={{ display: 'flex', gap: 6 }}>
            <input
              type="password"
              className="input"
              value={resetPass}
              onChange={(e) => setResetPass(e.target.value)}
              placeholder="New password (min 4 chars)"
            />
            <button type="submit" className="btn btn-sm btn-primary">
              Reset Password
            </button>
          </form>

          {!isSelf && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 160 }}
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Ban reason (optional)"
              />
              <button
                type="button"
                className={`btn btn-sm ${account.banned ? 'btn-green' : 'btn-red'}`}
                onClick={toggleBan}
              >
                <Ban size={14} />
                <span>{account.banned ? 'Unban' : 'Ban User'}</span>
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
            <button type="button" className="btn btn-sm btn-gold" onClick={toggleRole}>
              <ShieldCheck size={14} />
              <span>{account.role === 'admin' ? 'Demote to User' : 'Make Admin'}</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={async () =>
                handleFeedback(
                  await auth.adminResetAccountData(targetKey),
                  `Reset progress & inventory for ${account.username}.`
                )
              }
            >
              <RotateCcw size={14} />
              <span>Reset Progress</span>
            </button>

            {!isSelf &&
              (confirmDelete ? (
                <button type="button" className="btn btn-sm btn-red" onClick={doDelete}>
                  <Trash2 size={14} />
                  <span>Confirm Delete</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={14} />
                  <span>Delete Account</span>
                </button>
              ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function Admin() {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const promoCodes = useAuth((s) => s.promoCodes) || [];
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const adminCreateAccount = useAuth((s) => s.adminCreateAccount);
  const adminCreatePromo = useAuth((s) => s.adminCreatePromo);
  const adminTogglePromo = useAuth((s) => s.adminTogglePromo);
  const adminDeletePromo = useAuth((s) => s.adminDeletePromo);
  const adminAnnouncePromo = useAuth((s) => s.adminAnnouncePromo);

  const siteConfig = useSiteConfig();
  const pushAdminBroadcast = useChat((s) => s.pushAdminBroadcast);
  const clearMessages = useChat((s) => s.clearMessages);
  const pushToast = useToast((s) => s.push);

  const actor = currentUserKey ? accounts[currentUserKey] || null : null;
  const isAdmin = actor?.role === 'admin';

  const [tab, setTab] = useState('accounts');
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newBal, setNewBal] = useState(() => formatGems(siteConfig.startingBalance));

  const [bannerText, setBannerText] = useState(() => siteConfig.banner?.text || '');
  const [bannerTone, setBannerTone] = useState(() => siteConfig.banner?.tone || 'info');
  const [broadcastText, setBroadcastText] = useState('');
  const [startBalInput, setStartBalInput] = useState(() =>
    formatGems(siteConfig.startingBalance)
  );
  const [discountInput, setDiscountInput] = useState(() =>
    String(siteConfig.crateDiscountPct || 0)
  );
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoGemsInput, setPromoGemsInput] = useState('250K');
  const [promoMaxUses, setPromoMaxUses] = useState('10');
  const [promoMinLevel, setPromoMinLevel] = useState('1');
  const [promoMinWager, setPromoMinWager] = useState('0');
  const [promoAnnounce, setPromoAnnounce] = useState(true);

  const petCatalog = useMemo(() => buildPetCatalog(), []);

  useEffect(() => {
    setBannerText(siteConfig.banner?.text || '');
    setBannerTone(siteConfig.banner?.tone || 'info');
  }, [siteConfig.banner?.text, siteConfig.banner?.tone]);

  useEffect(() => {
    setDiscountInput(String(siteConfig.crateDiscountPct || 0));
  }, [siteConfig.crateDiscountPct]);

  const accountEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(accounts || {})
      .filter(([, acc]) => !q || acc.username.toLowerCase().includes(q) || acc.role.includes(q))
      .sort((a, b) => {
        if (a[1].role !== b[1].role) return a[1].role === 'admin' ? -1 : 1;
        return (b[1].data?.balance || 0) - (a[1].data?.balance || 0);
      });
  }, [accounts, search]);

  const kpis = useMemo(() => {
    const list = Object.values(accounts || {});
    let totalBal = 0;
    let totalWagered = 0;
    let totalProfit = 0;
    let totalBets = 0;
    let totalPets = 0;
    let adminCount = 0;
    let bannedCount = 0;

    for (const acc of list) {
      if (acc.role === 'admin') adminCount += 1;
      if (acc.banned) bannedCount += 1;
      const d = acc.data || {};
      totalBal += d.balance || 0;
      totalPets += (d.inventory || []).length;
      totalWagered += d.stats?.wagered || 0;
      totalProfit += d.stats?.profit || 0;
      totalBets += d.stats?.bets || 0;
    }

    return {
      totalAccounts: list.length,
      adminCount,
      bannedCount,
      totalBal,
      totalWagered,
      housePnL: -totalProfit,
      totalBets,
      totalPets,
    };
  }, [accounts]);

  if (!isAdmin) {
    return (
      <div
        className="card"
        style={{ padding: 28, textAlign: 'center', maxWidth: 480, margin: '40px auto' }}
      >
        <ShieldAlert size={42} className="text-gold" style={{ margin: '0 auto 12px' }} />
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Admin Access Required</h1>
        <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
          You must sign in with an administrator account to access user controls, economy tools, and
          site settings.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {!actor && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                sound.click();
                openAuthModal('login');
              }}
            >
              <LogIn size={16} /> Sign In as Admin
            </button>
          )}
          <Link to="/" className="btn btn-outline">
            Back to Lobby
          </Link>
        </div>
      </div>
    );
  }

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
    pushToast(`Created account ${res.account.username}!`, 'success');
    setNewUser('');
    setNewPass('');
    setShowCreate(false);
  };

  const publishBanner = async (e) => {
    e.preventDefault();
    sound.click();
    const res = await siteConfig.setBanner(bannerText, bannerTone);
    if (res.ok) {
      pushToast(bannerText.trim() ? 'Site banner updated!' : 'Site banner cleared.', 'success');
    } else {
      pushToast(res.error || 'Could not update banner.', 'error');
    }
  };

  const clearBanner = async () => {
    sound.click();
    setBannerText('');
    const res = await siteConfig.setBanner('', bannerTone);
    if (res.ok) {
      pushToast('Site banner cleared.', 'info');
    } else {
      pushToast(res.error || 'Could not clear banner.', 'error');
    }
  };

  const sendBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    sound.win();
    const res = await pushAdminBroadcast(broadcastText);
    if (res.ok) {
      setBroadcastText('');
      pushToast('Sent admin broadcast to Trollbox Chat!', 'success');
    } else {
      pushToast(res.error || 'Could not send broadcast.', 'error');
    }
  };

  const saveStartingBalance = async (e) => {
    e.preventDefault();
    const parsed = parseGems(startBalInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      pushToast('Enter a valid gem amount (e.g. 500K or 1M).', 'error');
      return;
    }
    sound.click();
    const res = await siteConfig.setStartingBalance(parsed);
    if (res.ok) {
      setStartBalInput(formatGems(res.saved));
      pushToast(`New accounts will start with ${formatGems(res.saved)} gems.`, 'success');
    } else {
      pushToast(res.error || 'Could not save starting balance.', 'error');
    }
  };

  const toggleConfig = async (label, setter, nextVal) => {
    sound.click();
    const res = await setter(nextVal);
    if (res.ok) {
      pushToast(`${label}: ${nextVal ? 'Enabled' : 'Disabled'}`, 'info');
    } else {
      pushToast(res.error || `Could not update ${label}.`, 'error');
    }
  };

  const applyDiscount = async (pctVal) => {
    sound.click();
    const res = await siteConfig.setCrateDiscountPct(pctVal);
    if (res.ok) {
      pushToast(`Crate sale set to ${res.saved}% OFF.`, 'success');
    } else {
      pushToast(res.error || 'Could not update crate discount.', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ShieldAlert size={26} className="text-gold" />
            <span>Admin Panel</span>
          </h1>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            Manage player accounts, gems, PS99 pet inventory, crate pricing, and site controls.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="role-badge role-badge-admin">Signed in as {actor.username}</span>
          {siteConfig.maintenanceMode && (
            <span className="role-badge role-badge-banned">MAINTENANCE ON</span>
          )}
          {siteConfig.crateDiscountPct > 0 && (
            <span className="tier-badge tier-badge-titanic">
              CRATE SALE -{siteConfig.crateDiscountPct}%
            </span>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="admin-kpi-grid">
        <div className="card admin-kpi">
          <div className="admin-kpi-label">
            <span>Registered Accounts</span>
            <Users size={15} className="text-gem" />
          </div>
          <div className="admin-kpi-val">{kpis.totalAccounts}</div>
          <div className="admin-kpi-sub">
            {kpis.adminCount} admin · {kpis.bannedCount} banned
          </div>
        </div>

        <div className="card admin-kpi">
          <div className="admin-kpi-label">
            <span>Total Player Balances</span>
            <Gem size={15} className="text-gem" />
          </div>
          <div className="admin-kpi-val text-gem">
            <GemAmount value={kpis.totalBal} iconSize={18} />
          </div>
          <div className="admin-kpi-sub">Combined wallet liquidity</div>
        </div>

        <div className="card admin-kpi">
          <div className="admin-kpi-label">
            <span>Platform Wagered / House P&amp;L</span>
            <CheckCircle2 size={15} className="text-green" />
          </div>
          <div className="admin-kpi-val">{formatGems(kpis.totalWagered)}</div>
          <div className={`admin-kpi-sub ${kpis.housePnL >= 0 ? 'text-green' : 'text-red'}`}>
            House P&amp;L: {kpis.housePnL >= 0 ? '+' : ''}
            {formatGems(kpis.housePnL)}
          </div>
        </div>

        <div className="card admin-kpi">
          <div className="admin-kpi-label">
            <span>Bets &amp; Pets Held</span>
            <PackageOpen size={15} className="text-purple" />
          </div>
          <div className="admin-kpi-val">{kpis.totalBets.toLocaleString()} bets</div>
          <div className="admin-kpi-sub">{kpis.totalPets.toLocaleString()} pets in inventories</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="admin-tabs">
        {[
          { id: 'accounts', label: 'Accounts & Economy', icon: Users },
          { id: 'promos', label: `Promo Codes (${promoCodes.filter((p) => p.active).length})`, icon: Ticket },
          { id: 'controls', label: 'Site Controls & Broadcasts', icon: Sliders },
          { id: 'crates', label: 'Crates Control', icon: PackageOpen },
          { id: 'audit', label: `Audit Log (${siteConfig.auditLog?.length || 0})`, icon: ScrollText },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`admin-tab ${tab === item.id ? 'active' : ''}`}
              onClick={() => {
                sound.click();
                setTab(item.id);
              }}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Accounts & Economy */}
      {tab === 'accounts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 360 }}>
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
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                Create New Account
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 10,
                }}
              >
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
                <select
                  className="input"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
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
              <div className="live-bets-title">
                All Accounts ({accountEntries.length})
              </div>
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
                            <span
                              className={`role-badge ${
                                acc.role === 'admin' ? 'role-badge-admin' : 'role-badge-user'
                              }`}
                            >
                              {acc.role}
                            </span>
                            {acc.banned && <span className="role-badge role-badge-banned">BANNED</span>}
                            {key === currentUserKey && (
                              <span className="tier-badge tier-badge-huge">YOU</span>
                            )}
                          </div>
                        </td>
                        <td className="text-gem">
                          <GemAmount value={d.balance || 0} iconSize={14} />
                        </td>
                        <td className="text-muted">
                          Lvl {getLevel(d.xp || 0)} · {d.stats?.bets || 0} bets ·{' '}
                          {(d.inventory || []).length} pets
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

      {/* TAB: Promo Codes */}
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

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
                gap: 10,
              }}
            >
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
                  placeholder="e.g. 250K or 2M"
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
                  placeholder="0 or e.g. 1M"
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
              <div className="live-bets-title">
                All Promo Codes ({promoCodes.length})
              </div>
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
                        No promo codes created yet. Create one above!
                      </td>
                    </tr>
                  ) : (
                    promoCodes.map((p) => {
                      const exhausted = (p.maxUses || 0) > 0 && (p.uses || 0) >= p.maxUses;
                      return (
                        <tr key={p.code}>
                          <td>
                            <strong className="text-gold" style={{ letterSpacing: '0.04em' }}>
                              {p.code}
                            </strong>
                          </td>
                          <td className="text-gem">
                            <GemAmount value={p.gems} iconSize={14} />
                          </td>
                          <td>
                            {p.uses || 0} / {p.maxUses > 0 ? p.maxUses : '∞'}
                          </td>
                          <td className="text-muted">
                            Lvl {p.minLevel || 1}+
                            {(p.minWagered || 0) > 0 ? ` · ${formatGems(p.minWagered)}+ wagered` : ''}
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
                            <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-gold"
                                title="Announce in chat"
                                onClick={async () => {
                                  sound.click();
                                  const res = await adminAnnouncePromo(p.code);
                                  if (res.ok) pushToast(`Announced "${p.code}" in Trollbox Chat!`, 'success');
                                }}
                              >
                                <Megaphone size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                title={p.active ? 'Pause code' : 'Enable code'}
                                onClick={async () => {
                                  sound.click();
                                  const res = await adminTogglePromo(p.code, !p.active);
                                  if (res.ok) {
                                    pushToast(`${p.code} ${!p.active ? 'enabled' : 'paused'}.`, 'info');
                                  }
                                }}
                              >
                                {p.active ? <Pause size={13} /> : <Play size={13} />}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-red"
                                title="Delete promo code"
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

      {/* TAB 2: Site Controls & Broadcasts */}
      {tab === 'controls' && (
        <div className="admin-section-grid">
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
                  <button type="button" className="btn btn-sm btn-outline" onClick={clearBanner}>
                    Clear
                  </button>
                )}
              </div>
            </form>

            <form
              onSubmit={sendBroadcast}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
              }}
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

      {/* TAB 3: Crates Control */}
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
                Apply a 0%–50% discount across Crates, Case Opening, and Case Battles.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {[0, 10, 25, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`btn btn-sm ${
                    siteConfig.crateDiscountPct === pct ? 'btn-gold' : 'btn-outline'
                  }`}
                  onClick={() => applyDiscount(pct)}
                >
                  {pct === 0 ? 'No Sale' : `-${pct}%`}
                </button>
              ))}
              <input
                type="number"
                min="0"
                max="50"
                className="input"
                style={{ width: 78 }}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => applyDiscount(discountInput)}
              >
                Apply %
              </button>
              <button
                type="button"
                className="btn btn-sm btn-red"
                onClick={async () => {
                  sound.click();
                  const res = await siteConfig.resetCratePricing();
                  if (res.ok) {
                    pushToast('Restored default RAP pricing on all crates.', 'info');
                  } else {
                    pushToast(res.error || 'Could not reset crate pricing.', 'error');
                  }
                }}
              >
                Reset All
              </button>
            </div>
          </div>

          <div className="admin-crates-grid">
            {ps99.crates.map((crate) => (
              <CratePriceRow
                key={crate.id}
                crate={crate}
                siteConfig={siteConfig}
                adminUsername={actor.username}
              />
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Audit Log */}
      {tab === 'audit' && (
        <div className="card live-bets-card">
          <div className="live-bets-header">
            <div className="live-bets-title">
              Admin Audit Log ({siteConfig.auditLog?.length || 0})
            </div>
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
                {!siteConfig.auditLog || siteConfig.auditLog.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>
                      No admin actions recorded yet.
                    </td>
                  </tr>
                ) : (
                  siteConfig.auditLog.map((entry) => (
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
      )}

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
