import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { MmIcon } from '../icons/MmIcon';
import { GiftArt } from '../icons/GiftArt';

const THEMES = [
  { id: 'midnight', label: 'Midnight' },
  { id: 'rose', label: 'Rose' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'nutmeg', label: 'Nutmeg' },
];

function sessionHeaders() {
  const tok = localStorage.getItem('mm_audio_session') || '';
  return {
    'Content-Type': 'application/json',
    ...(tok ? { 'x-audio-session': tok } : {}),
  };
}

/**
 * 1:1 DM — text, gifts, images, themes.
 */
export default function DmChatSheet({
  open,
  onClose,
  socket,
  peerKey,
  peerLabel,
  identity,
}) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [theme, setTheme] = useState('midnight');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  const openThread = useCallback(async () => {
    if (!peerKey) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/dm/open`, {
        method: 'POST',
        headers: sessionHeaders(),
        credentials: 'include',
        body: JSON.stringify({ peerKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not open chat');
        return;
      }
      setConversationId(data.conversation.id);
      setTheme(data.conversation.themeId || 'midnight');
      setMessages(data.messages || []);
      socket?.emit('dm:join', { conversationId: data.conversation.id });
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }, [peerKey, socket]);

  useEffect(() => {
    if (open && peerKey) void openThread();
  }, [open, peerKey, openThread]);

  useEffect(() => {
    if (!socket || !conversationId) return undefined;
    const onMsg = (msg) => {
      if (msg.conversationId !== conversationId) return;
      setMessages((m) => [...m, msg]);
    };
    socket.on('dm:message', onMsg);
    return () => socket.off('dm:message', onMsg);
  }, [socket, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const send = async (payload) => {
    if (!conversationId) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/dm/send`, {
        method: 'POST',
        headers: sessionHeaders(),
        credentials: 'include',
        body: JSON.stringify({ conversationId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error || 'Send failed');
      else if (data.message) setMessages((m) => [...m, data.message]);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  const onSendText = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    void send({ kind: 'text', body });
  };

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 1.2e6) {
      setError('Image must be under 1.2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      void send({ kind: 'image', imageDataUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const setThemeId = async (themeId) => {
    setTheme(themeId);
    if (!conversationId) return;
    await fetch(`${API_BASE}/api/dm/theme`, {
      method: 'POST',
      headers: sessionHeaders(),
      credentials: 'include',
      body: JSON.stringify({ conversationId, themeId }),
    });
  };

  if (!open) return null;

  return (
    <div className="live-sheet-backdrop" onClick={onClose}>
      <div
        className={`live-sheet dm-sheet dm-sheet--${theme}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="live-sheet__head">
          <h3>{peerLabel || peerKey}</h3>
          <button type="button" className="live-icon-btn" onClick={onClose} aria-label="Close">
            <MmIcon name="close" size={14} />
          </button>
        </header>

        <div className="dm-themes">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`dm-themes__btn${theme === t.id ? ' is-on' : ''}`}
              onClick={() => setThemeId(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="dm-messages">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`dm-bubble${m.senderKey?.includes(identity?.username || '___') ? ' dm-bubble--me' : ''}`}
            >
              {m.kind === 'image' && m.imageUrl && (
                <img src={m.imageUrl} alt="" className="dm-bubble__img" />
              )}
              {m.kind === 'gift' && (
                <div className="dm-bubble__gift">
                  <GiftArt id={m.giftId} size={48} />
                  <span>Sent a gift</span>
                </div>
              )}
              {m.kind === 'text' && <p>{m.body}</p>}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <p className="prelive-error">{error}</p>}

        <form className="dm-composer" onSubmit={onSendText}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          <button type="button" className="live-icon-btn" onClick={() => fileRef.current?.click()} aria-label="Image">
            <MmIcon name="image" size={16} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder="Message…"
            className="dm-composer__input"
          />
          <button type="submit" className="live-icon-btn" disabled={busy || !text.trim()}>
            <MmIcon name="send" size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
