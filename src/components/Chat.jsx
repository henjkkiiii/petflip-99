import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, ShieldAlert, Users, X } from 'lucide-react';
import { useAuth } from '../store/useAuth.js';
import { useChat } from '../store/chat.js';
import { useSiteConfig } from '../store/siteConfig.js';
import { useToast } from '../store/toast.js';
import { sound } from '../lib/sound.js';

export function Chat({ open, onClose }) {
  const currentUserKey = useAuth((s) => s.currentUserKey);
  const accounts = useAuth((s) => s.accounts);
  const onlineCount = useAuth((s) => s.onlineCount);
  const openAuthModal = useAuth((s) => s.openAuthModal);
  const account = currentUserKey ? accounts[currentUserKey] || null : null;

  const messages = useChat((s) => s.messages);
  const sendUserMessage = useChat((s) => s.sendUserMessage);

  const chatEnabled = useSiteConfig((s) => s.chatEnabled);
  const pushToast = useToast((s) => s.push);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const isAdmin = account?.role === 'admin';
  const inputBlocked = Boolean(account && !chatEnabled && !isAdmin);

  const send = async (e) => {
    e.preventDefault();
    if (!account) {
      sound.click();
      openAuthModal('login');
      return;
    }
    if (inputBlocked || sending) return;
    const text = input.trim();
    if (!text) return;

    sound.click();
    setSending(true);
    try {
      const res = await sendUserMessage(text);
      if (!res.ok) {
        sound.lose();
        pushToast(res.error || 'Could not send message.', 'error');
      } else {
        setInput('');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className={`chat-panel ${open ? 'open' : ''}`}>
      <div className="chat-header">
        <div className="chat-title">
          <MessageSquare size={16} className="text-gem" />
          <span>Trollbox Chat</span>
        </div>
        <div className="chat-header-right">
          <span className="online-pill">
            <Users size={12} />
            {onlineCount}
          </span>
          <button
            type="button"
            className="chat-close-btn"
            onClick={onClose}
            aria-label="Close chat"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!chatEnabled && (
        <div className="chat-muted-notice">
          <ShieldAlert size={13} />
          <span>Chat is currently muted by admin</span>
        </div>
      )}

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <div className="text-muted" style={{ textAlign: 'center', padding: '24px 12px', fontSize: 12.5 }}>
            No messages yet — say hi to start the chat!
          </div>
        ) : (
          messages.map((m) => {
          const isOwn = Boolean(
            m.isUser || (account && m.isReal && m.user?.toLowerCase() === account.username?.toLowerCase())
          );
          return (
            <div
              key={m.id}
              className={`chat-msg ${isOwn ? 'chat-msg-user' : ''} ${
                m.isBroadcast ? 'chat-msg-admin' : ''
              }`}
            >
              <span className="chat-mini-avatar">{(m.user?.[0] || 'P').toUpperCase()}</span>
              <div className="chat-msg-body">
                {m.isAdmin ? (
                  <span className="chat-admin-badge">ADMIN</span>
                ) : (
                  <span className="chat-lvl">{m.level}</span>
                )}
                <span className="chat-author">{m.user}:</span>{' '}
                <span className="chat-text">{m.text}</span>
              </div>
            </div>
          );
          })
        )}
      </div>

      <form className="chat-form" onSubmit={send}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={inputBlocked || sending}
          placeholder={
            !account
              ? 'Sign in to chat…'
              : inputBlocked
                ? 'Chat muted by admin'
                : 'Say something…'
          }
          maxLength={160}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={inputBlocked || sending}
          aria-label="Send message"
        >
          <Send size={15} />
        </button>
      </form>
    </aside>
  );
}
