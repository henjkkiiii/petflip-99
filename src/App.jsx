import React, { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from './components/AppShell.jsx';
import { AuthModal } from './components/AuthModal.jsx';
import { Toasts } from './components/Toasts.jsx';
import { useAuth } from './store/useAuth.js';
import { Home } from './pages/Home.jsx';
import { Crash } from './pages/Crash.jsx';
import { Mines } from './pages/Mines.jsx';
import { Towers } from './pages/Towers.jsx';
import { Plinko } from './pages/Plinko.jsx';
import { Dice } from './pages/Dice.jsx';
import { Limbo } from './pages/Limbo.jsx';
import { Coinflip } from './pages/Coinflip.jsx';
import { Roulette } from './pages/Roulette.jsx';
import { Blackjack } from './pages/Blackjack.jsx';
import { Cases } from './pages/Cases.jsx';
import { CaseOpen } from './pages/CaseOpen.jsx';
import { Battles } from './pages/Battles.jsx';
import { BattleRoom } from './pages/BattleRoom.jsx';
import { Inventory } from './pages/Inventory.jsx';
import { Profile } from './pages/Profile.jsx';
import { Rewards } from './pages/Rewards.jsx';
import { Admin } from './pages/Admin.jsx';
import './pages/Pages.css';

function StandaloneAdminShell() {
  useEffect(() => {
    const auth = useAuth.getState();
    auth.initAuth();
    const stopLiveSync = auth.startLiveSync();
    return () => {
      stopLiveSync();
    };
  }, []);

  return (
    <>
      <Admin />
      <AuthModal />
      <Toasts />
    </>
  );
}

export default function App() {
  const location = useLocation();
  const isAdminRoute =
    location.pathname === '/admin' || location.pathname.startsWith('/admin/');

  if (isAdminRoute) {
    return <StandaloneAdminShell />;
  }

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
        >
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/crash" element={<Crash />} />
            <Route path="/mines" element={<Mines />} />
            <Route path="/towers" element={<Towers />} />
            <Route path="/plinko" element={<Plinko />} />
            <Route path="/dice" element={<Dice />} />
            <Route path="/limbo" element={<Limbo />} />
            <Route path="/coinflip" element={<Coinflip />} />
            <Route path="/roulette" element={<Roulette />} />
            <Route path="/blackjack" element={<Blackjack />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/:id" element={<CaseOpen />} />
            <Route path="/battles" element={<Battles />} />
            <Route path="/battles/:id" element={<BattleRoom />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
