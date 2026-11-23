import React, { useEffect, useState } from 'react';
import { Megaphone, Wrench } from 'lucide-react';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { LiveDropsTicker } from './LiveDropsTicker.jsx';
import { Chat } from './Chat.jsx';
import { Toasts } from './Toasts.jsx';
import { DepositModal } from './DepositModal.jsx';
import { WithdrawModal } from './WithdrawModal.jsx';
import { FairnessModal } from './FairnessModal.jsx';
import { AuthModal } from './AuthModal.jsx';
import { startFakeFeed } from '../lib/bots.js';
import { useFeed } from '../store/feed.js';
import { startFakeDrops, useDrops } from '../store/drops.js';
import { useAuth } from '../store/useAuth.js';
import { useSiteConfig } from '../store/siteConfig.js';

export function AppShell({ children }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const botsEnabled = useSiteConfig((s) => s.botsEnabled);
  const banner = useSiteConfig((s) => s.banner);
  const maintenanceMode = useSiteConfig((s) => s.maintenanceMode);

  useEffect(() => {
    const auth = useAuth.getState();
    auth.initAuth();
    const stopLiveSync = auth.startLiveSync();
    return () => {
      stopLiveSync();
    };
  }, []);

  useEffect(() => {
    if (!botsEnabled) return undefined;
    const push = useFeed.getState().push;
    const pushDrop = useDrops.getState().pushDrop;
    const stopFeed = startFakeFeed((bet) => push(bet));
    const stopDrops = startFakeDrops((drop) => pushDrop(drop));
    return () => {
      stopFeed();
      stopDrops();
    };
  }, [botsEnabled]);

  return (
    <div className="app-shell">
      <Sidebar onOpenFairness={() => setFairnessOpen(true)} />

      <div className="app-center">
        <Topbar
          onOpenDeposit={() => setDepositOpen(true)}
          onOpenWithdraw={() => setWithdrawOpen(true)}
          onOpenFairness={() => setFairnessOpen(true)}
          onToggleChat={() => setChatOpen((o) => !o)}
          chatOpen={chatOpen}
        />

        <LiveDropsTicker />

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

        <main className="app-main">{children}</main>

        <footer className="app-footer">
          Fan-made demo. Play-money gems only – no real value, no real deposits. Not affiliated with
          BIG Games or Roblox.
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
