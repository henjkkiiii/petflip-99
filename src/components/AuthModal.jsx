import React, { useEffect, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Lock, LogIn, User, UserPlus } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { useAuth } from '../store/useAuth.js';
import { useSiteConfig } from '../store/siteConfig.js';
import { useToast } from '../store/toast.js';
import { formatGems } from '../lib/format.js';
import { sound } from '../lib/sound.js';

export function AuthModal() {
  const open = useAuth((s) => s.authModalOpen);
  const initialTab = useAuth((s) => s.authModalTab);
  const closeAuthModal = useAuth((s) => s.closeAuthModal);
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);

  const allowRegistration = useSiteConfig((s) => s.allowRegistration);
  const startingBalance = useSiteConfig((s) => s.startingBalance);
  const pushToast = useToast((s) => s.push);

  const [tab, setTab] = useState(initialTab);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTab(initialTab || 'login');
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setShowPass(false);
      setError('');
      setSubmitting(false);
    }
  }, [open, initialTab]);

  const switchTab = (next) => {
    sound.click();
    setTab(next);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    if (tab === 'register') {
      if (!allowRegistration) {
        setError('New registrations are currently disabled by an admin.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res =
        tab === 'login'
          ? await login(username, password)
          : await register(username, password);

      if (!res.ok) {
        sound.lose();
        setError(res.error || 'Authentication failed.');
      } else {
        sound.win();
        pushToast(
          tab === 'login'
            ? `Welcome back, ${res.account.username}!`
            : `Account created! Starting with ${formatGems(res.account.data.balance)} play gems.`,
          'success'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : closeAuthModal}
      title={tab === 'login' ? 'Sign In to PETFLIP 99' : 'Create Account'}
      maxWidth={430}
    >
      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
          onClick={() => switchTab('login')}
        >
          <LogIn size={15} />
          <span>Sign In</span>
        </button>
        <button
          type="button"
          className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
          onClick={() => switchTab('register')}
        >
          <UserPlus size={15} />
          <span>Create Account</span>
        </button>
      </div>

      {tab === 'register' && !allowRegistration && (
        <div className="auth-error">
          <AlertCircle size={15} />
          <span>New registrations are currently closed by an administrator.</span>
        </div>
      )}

      {error && (
        <div className="auth-error">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="modal-form">
        <label className="field-label">
          <span>Username</span>
          <div className="input-icon-wrap">
            <User size={16} />
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3–20 letters, numbers, or _"
              autoComplete="username"
              autoFocus
              maxLength={20}
              required
            />
          </div>
        </label>

        <label className="field-label">
          <span>Password</span>
          <div className="input-icon-wrap">
            <Lock size={16} />
            <input
              type={showPass ? 'text' : 'password'}
              className="input"
              style={{ paddingLeft: 36, paddingRight: 38 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
            />
            <button
              type="button"
              className="input-eye-btn"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>

        {tab === 'register' && (
          <label className="field-label">
            <span>Confirm Password</span>
            <div className="input-icon-wrap">
              <Lock size={16} />
              <input
                type={showPass ? 'text' : 'password'}
                className="input"
                style={{ paddingLeft: 36 }}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                required
              />
            </div>
          </label>
        )}

        <button
          type="submit"
          disabled={submitting || (tab === 'register' && !allowRegistration)}
          className={`btn btn-lg ${tab === 'login' ? 'btn-primary' : 'btn-green'}`}
          style={{ width: '100%' }}
        >
          {submitting
            ? 'Please wait…'
            : tab === 'login'
              ? 'Sign In'
              : `Create Account (${formatGems(startingBalance)} Gems)`}
        </button>
      </form>
    </Modal>
  );
}
