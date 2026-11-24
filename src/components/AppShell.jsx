import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lock, Megaphone, Wrench } from 'lucide-react';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { LiveDropsTicker } from './LiveDropsTicker.jsx';
import { Chat } from './Chat.jsx';
import { Toasts } from './Toasts.jsx';
import { DepositModal } from './DepositModal.jsx';
import { WithdrawModal } from './WithdrawModal.jsx';
import { FairnessModal } from './FairnessModal.jsx';
import { AuthModal } from './AuthModal.jsx';
import { useAuth } from '../store/useAuth.js';
import { ALL_GAMES, useSiteConfig } from '../store/siteConfig.js';

export function AppShell({ children }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const location = useLocation();
  const banner = useSiteConfig((s) => s.banner);
  const maintenanceMode = useSiteConfig((s) => s.maintenanceMode);
  const branding = useSiteConfig((s) => s.branding);
  const games = useSiteConfig((s) => s.games);
  const ui = useSiteConfig((s) => s.ui);

  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const isAdmin = Boolean(currentUserKey && accounts[currentUserKey]?.role === 'admin');

  const activeGame = ALL_GAMES.find(
    (g) => location.pathname === g.path || location.pathname.startsWith(`${g.path}/`)
  );
  const isCurrentGameDisabled = Boolean(
    activeGame && games?.enabled?.[activeGame.id] === false && !isAdmin
  );

  useEffect(() => {
    const auth = useAuth.getState();
    auth.initAuth();
    const stopLiveSync = auth.startLiveSync();
    return () => {
      stopLiveSync();
    };
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-center">
        <Topbar
          onOpenDeposit={() => setDepositOpen(true)}
          onOpenWithdraw={() => setWithdrawOpen(true)}
          onToggleChat={() => setChatOpen((o) => !o)}
          chatOpen={chatOpen}
        />

        {ui?.showLiveTicker !== false && <LiveDropsTicker />}

        {maintenanceMode && (
          <div className="site-banner site-banner-danger">
            <Wrench size={14} />
            <span>Maintenance Mode is active — betting is paused for non-admin accounts.</span>
          </div>
        )}

        {banner?.text && (
          <div className={`site-banner site-banner-${banner.tone || 'info'}`}>
            <Megaphone size={14} />
            <span>{banner.text}</span>
          </div>
        )}

        <main className="app-main">
          {isCurrentGameDisabled ? (
            <div className="card" style={{ padding: 36, textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
              <Lock size={34} className="text-gold" style={{ marginBottom: 10 }} />
              <h2 style={{ fontSize: 20, marginBottom: 6 }}>{activeGame.label} is Temporarily Paused</h2>
              <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
                An administrator has disabled this game for maintenance. Please try another game!
              </p>
              <Link to="/" className="btn btn-primary">
                Back to Lobby
              </Link>
            </div>
          ) : (
            children
          )}
        </main>

        <footer className="app-footer">
          {branding?.footerText ||
            'Fan-made demo. Play-money gems only – no real value, no real deposits. Not affiliated with BIG Games or Roblox.'}{' '}
          {ui?.showFairnessLink !== false && (
            <button
              type="button"
              onClick={() => setFairnessOpen(true)}
              style={{
                color: 'inherit',
                textDecoration: 'underline',
                opacity: 0.72,
                fontSize: 'inherit',
                marginLeft: 4,
              }}
            >
              Fairness &amp; House Edge
            </button>
          )}
        </footer>
      </div>

      <Chat open={chatOpen} onClose={() => setChatOpen(false)} />

      <AuthModal />
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
      <WithdrawModal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
      <FairnessModal open={fairnessOpen} onClose={() => setFairnessOpen(false)} />
      <Toasts />
    </div>
  );
}
