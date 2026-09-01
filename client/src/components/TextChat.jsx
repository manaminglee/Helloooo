import { useCallback, useEffect, useRef, useState } from 'react';
import { countryToFlag } from '../utils/countryFlag';
import { mmDebug } from '../utils/mmDebug';
import { nextMsgId } from '../utils/uniqueId';
import { CoinBadge } from './CoinBadge';
import { AdSlot } from './AdSlot';
import { ReportSafetyModal } from './ReportSafetyModal';
import { ChatInputWithEmoji } from './ChatInputWithEmoji';
import { PHASE_2 } from '../constants/features';
import { ensureNotifyPermission, notifyIfBackground } from '../utils/browserNotify';
import { playDing, playPop } from '../utils/sounds';
import { usePrefs } from '../utils/userPrefs';
import { SettingsPanel, SettingsGearButton } from './SettingsPanel';
import { HellooooBrand, HellooooLogo } from './HellooooBrand';
import { ChatMatchStatus } from './VideoSessionUI';
import { SkipProSheet } from './SkipProSheet';
import { loadProMatchPrefs } from '../utils/proMatchPrefs';

const ICEBREAKER_POOL = [
  'Hey! 👋', 'Where are you from?', 'What are you up to?',
  'Got any hobbies?', 'Favorite music right now?', 'Coffee or tea?',
  'Seen anything good lately?', 'What made you smile today?',
  'Beach or mountains?', 'Dogs or cats?',
];

const QUICK_EMOJIS = ['👋', '😂', '❤️', '🔥'];

function pickIcebreakers(n = 3) {
  const shuffled = [...ICEBREAKER_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

const SEARCHING_STATUSES = [
  'Searching for a next user…',
  'Matching interests…',
  'Finding someone nearby…',
  'Connecting secure channel…',
];

const BlueTick = () => (
  <span className="mm-text-chat__verified" aria-label="Verified creator">
    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
  </span>
);

function ChatBubble({ m, isMe }) {
  const { vanishMessages } = usePrefs();
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    if (m.system || !vanishMessages) return;
    const age = Math.floor((Date.now() - (m.ts || Date.now())) / 1000);
    const rem = Math.max(0, 60 - age);
    setTimeLeft(rem);
    if (rem <= 0) return;
    const int = setInterval(() => setTimeLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(int);
  }, [m.ts, m.system, vanishMessages]);

  if (!m.system && vanishMessages && timeLeft <= 0) return null;

  if (m.system) {
    return (
      <div className="mm-text-chat__system">
        <span>{m.text}</span>
      </div>
    );
  }

  const time = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className={`mm-text-chat__row ${isMe ? 'mm-text-chat__row--me' : ''}`}>
      <div className={`mm-text-chat__bubble ${isMe ? 'mm-text-chat__bubble--me' : 'mm-text-chat__bubble--them'}`}>
        {!isMe && (
          <span className="mm-text-chat__bubble-name">
            {m.isCreator ? `@${m.nickname}` : (m.nickname || 'Stranger')}
            {m.isCreator && <BlueTick />}
          </span>
        )}
        {m.type === 'voice' ? (
          <audio controls src={m.audio || m.text} className="mm-text-chat__voice" />
        ) : (
          <p className="mm-text-chat__bubble-text">{m.text}</p>
        )}
        <div className="mm-text-chat__bubble-meta">
          {vanishMessages && (
            <span className={`mm-text-chat__ttl ${timeLeft <= 10 ? 'mm-text-chat__ttl--warn' : ''}`}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
          {time && <span>{time}</span>}
        </div>
      </div>
    </div>
  );
}

export default function TextChat({ socket, connected, country, onlineCount, interest = 'general', nickname = 'Anonymous', language = '', region = '', isCreator = false, onBack, onJoined, onFindNewPartner, adsEnabled = false, adScripts = {}, coinState, registered = false, currentActiveSeconds = 0, conversationMode = 'free', topicContract = 'chill', calmMode: calmModeProp = false, isPro = false, subscription = null }) {
  const { balance, streak, canClaim, nextClaim, claimCoins } = coinState;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [peer, setPeer] = useState(null);
  const [sharedInterests, setSharedInterests] = useState([]);
  const [quickPrompts, setQuickPrompts] = useState(() => pickIcebreakers());
  const [status, setStatus] = useState('searching');
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [searchStatusIndex, setSearchStatusIndex] = useState(0);
  const [connectedSecs, setConnectedSecs] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkipSheet, setShowSkipSheet] = useState(false);
  const roomIdRef = useRef(null);
  const chatScrollRef = useRef(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const statusRef = useRef(status);
  const skipRef = useRef(null);
  const backRef = useRef(null);
  const startRef = useRef(null);
  const messagesRef = useRef(messages);
  const userLeftTimerRef = useRef(null);
  const initialFindEmittedRef = useRef(false);
  const handleSkipRef = useRef(null);
  const onJoinedRef = useRef(onJoined);
  const socketRef = useRef(socket);
  const connectedRef = useRef(connected);
  const hadSocketConnectRef = useRef(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const prefs = usePrefs();
  const proMatchOptsRef = useRef({});
  statusRef.current = status;
  messagesRef.current = messages;
  onJoinedRef.current = onJoined;
  socketRef.current = socket;
  connectedRef.current = connected;

  // Small local toast (matches other chat surfaces)
  useEffect(() => {
    if (!toast) return;
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(toastTimerRef.current);
  }, [toast]);

  const isConnected = !!peer && !!roomId;

  useEffect(() => {
    const box = chatScrollRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [messages, strangerTyping]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  const isFromMe = (m) => {
    if (!m) return false;
    return m.socketId === socket.id || m.fromSelf;
  };

  const emitFind = useCallback(() => {
    if (!socket || !connected) return;
    const prefs = loadProMatchPrefs();
    const proOpts = proMatchOptsRef.current || {};
    socket.emit('find-partner', {
      mode: 'text',
      interest: interest || 'general',
      nickname: nickname || 'Anonymous',
      language,
      region: region || country,
      conversationMode,
      topicContract,
      interests: interest && interest !== 'general' ? [interest] : [],
      matchCountryOnly: proOpts.matchCountryOnly ?? prefs.matchCountryOnly,
      matchRegionOnly: proOpts.matchRegionOnly ?? prefs.matchRegionOnly,
      reconnectToUserId: proOpts.reconnectToUserId || undefined,
    });
    proMatchOptsRef.current = {};
  }, [socket, connected, interest, nickname, language, region, country, conversationMode, topicContract]);

  const clearRoom = useCallback(() => {
    setPeer(null);
    setSharedInterests([]);
    setRoomId(null);
    setMessages([]);
    roomIdRef.current = null;
  }, []);

  // Auto-start matchmaking on mount (once, when socket is connected) — mirrors VideoChat's pattern
  // Registered after socket listeners below so partner-found is never missed.
  useEffect(() => {
    if (!socket) return;

    const onPartnerFound = (data) => {
      mmDebug('chat.match', data.roomId);
      roomIdRef.current = data.roomId;
      setRoomId(data.roomId);
      setPeer(data.peer);
      setSharedInterests(Array.isArray(data.sharedInterests) ? data.sharedInterests : []);
      setQuickPrompts(pickIcebreakers());
      if (data.mutualSkipReconnect) setToast('↩️ Reconnected — you both skipped at the same time');
      setStatus('connected');
      onJoinedRef.current?.(data.roomId);
      notifyIfBackground('Text match', 'You have a new Helloooo text chat 💬.');
      setTimeout(() => inputRef.current?.focus(), 100);
    };

    const onHistory = (data) => {
      if (data.roomId === roomIdRef.current) setMessages(data.messages || []);
    };

    const onMessage = (data) => {
      if (data.roomId === roomIdRef.current) {
        setMessages((m) => [...m.slice(-100), data]);
        if (!isFromMe(data)) playDing();
      }
    };

    const onUserLeft = () => {
      clearTimeout(userLeftTimerRef.current);
      handleSkipRef.current?.();
    };

    const onStrangerTyping = (data) => {
      setStrangerTyping(data.isTyping);
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setStrangerTyping(false), 2500);
    };

    const onWaiting = () => setStatus('searching');
    const onSystemMsg = (data) => setMessages((m) => [...m, { id: nextMsgId('sys'), system: true, text: `📢 ADMIN: ${data.message}`, ts: Date.now() }]);

    const onContentFlagged = (data) => {
      setMessages(m => [...m, { id: nextMsgId('sys'), system: true, text: `🛡️ ${data.message}`, ts: Date.now() }]);
    };

    const onServerError = (data) => {
      setToast(data?.message || 'Something went wrong.');
      if (!roomIdRef.current && statusRef.current === 'searching') {
        setTimeout(() => {
          if (!roomIdRef.current && connectedRef.current && socketRef.current) emitFind();
        }, 1500);
      }
    };

    const onDisconnect = (reason) => {
      if (reason === 'io server disconnect') {
        clearTimeout(userLeftTimerRef.current);
        handleSkipRef.current?.();
      }
    };

    socket.on('partner-found', onPartnerFound);
    socket.on('chat-history', onHistory);
    socket.on('chat-message', onMessage);
    socket.on('user-left', onUserLeft);
    socket.on('stranger-typing', onStrangerTyping);
    socket.on('waiting-for-partner', onWaiting);
    socket.on('system-announcement', onSystemMsg);
    socket.on('content-flagged', onContentFlagged);
    socket.on('error', onServerError);
    socket.on('disconnect', onDisconnect);

    return () => {
      clearTimeout(userLeftTimerRef.current);
      socket.off('partner-found', onPartnerFound);
      socket.off('chat-history', onHistory);
      socket.off('chat-message', onMessage);
      socket.off('user-left', onUserLeft);
      socket.off('stranger-typing', onStrangerTyping);
      socket.off('waiting-for-partner', onWaiting);
      socket.off('system-announcement', onSystemMsg);
      socket.off('content-flagged', onContentFlagged);
      socket.off('error', onServerError);
      socket.off('disconnect', onDisconnect);
    };
  // Handlers read latest values through refs — register once per socket
  }, [socket, emitFind]);

  useEffect(() => {
    if (!socket || !connected || initialFindEmittedRef.current || roomIdRef.current) return;
    initialFindEmittedRef.current = true;
    setStatus('searching');
    emitFind();
  }, [socket, connected, emitFind]);

  useEffect(() => {
    if (!socket) return undefined;
    const onReconnect = () => {
      if (!hadSocketConnectRef.current) {
        hadSocketConnectRef.current = true;
        return;
      }
      if (roomIdRef.current) {
        socket.emit('leave-room', { roomId: roomIdRef.current });
        clearRoom();
      }
      if (statusRef.current === 'connected' || statusRef.current === 'searching' || statusRef.current === 'idle') {
        setStatus('searching');
        initialFindEmittedRef.current = true;
        emitFind();
      }
    };
    if (socket.connected) hadSocketConnectRef.current = true;
    socket.on('connect', onReconnect);
    return () => socket.off('connect', onReconnect);
  }, [socket, emitFind, clearRoom]);

  // Rotating searching status
  useEffect(() => {
    if (status !== 'searching') return;
    const t = setInterval(() => setSearchStatusIndex((i) => (i + 1) % SEARCHING_STATUSES.length), 1200);
    return () => clearInterval(t);
  }, [status]);

  // Connection timer when connected
  useEffect(() => {
    if (!isConnected) {
      setConnectedSecs(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setConnectedSecs(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isConnected, peer?.socketId]);

  // Keyboard shortcuts — same map as video chat so muscle memory carries over:
  //   →  / Esc  skip to the next stranger      ←  back out of the mode
  //   Enter / S start searching when idle
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = statusRef.current;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (s === 'connected') skipRef.current?.();
        else startRef.current?.();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        backRef.current?.();
        return;
      }
      if ((e.key === 'Enter' || e.key.toLowerCase() === 's') && s === 'idle') {
        e.preventDefault();
        startRef.current?.();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (s === 'connected' || s === 'searching') skipRef.current?.();
        else backRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Fix #4: Cleanup typing timer on unmount
  useEffect(() => () => clearTimeout(typingTimerRef.current), []);

  const submitSafetyReport = ({ reason, block }) => {
    const targetId = peer?.socketId;
    if (socket && roomIdRef.current) {
      socket.emit('report-user', {
        roomId: roomIdRef.current,
        reason: String(reason || 'unspecified'),
        ...(targetId ? { targetSocketId: targetId } : {}),
        ...(block ? { block: true } : {}),
      });
    }
    handleSkipRef.current?.();
  };

  const handleStart = () => {
    if (!socket || !connected) return;
    void ensureNotifyPermission();
    clearRoom();
    setStatus('searching');
    emitFind();
  };

  startRef.current = handleStart;

  const executeSkip = useCallback((opts = {}) => {
    proMatchOptsRef.current = opts;
    if (roomIdRef.current && socket) {
      socket.emit('leave-room', { roomId: roomIdRef.current });
    } else {
      socket?.emit('cancel-find-partner');
    }
    clearRoom();
    setStatus('searching');
    emitFind();
  }, [socket, clearRoom, emitFind]);

  const requestSkip = useCallback(() => {
    if (statusRef.current === 'connected') {
      setShowSkipSheet(true);
      return;
    }
    executeSkip({});
  }, [executeSkip]);

  skipRef.current = requestSkip;
  handleSkipRef.current = executeSkip;

  const handleStop = () => {
    if (roomIdRef.current && socket) socket.emit('leave-room', { roomId: roomIdRef.current });
    socket?.emit('cancel-find-partner');
    clearRoom();
    setStatus('idle');
  };

  const handleBack = useCallback(() => {
    handleStop();
    onBack?.();
  }, [onBack]);

  backRef.current = handleBack;

  // Leave matchmaking when leaving text chat (history back / unmount)
  useEffect(() => () => {
    try {
      const s = socketRef.current;
      if (roomIdRef.current) s?.emit('leave-room', { roomId: roomIdRef.current });
      s?.emit('cancel-find-partner');
    } catch { /* ignore */ }
  }, []);

  const sendMsg = () => {
    const t = input.trim();
    // Fix #10 minor: Use only ref (single source of truth), never fall back to stale state
    if (!t || !socket || !roomIdRef.current) return;
    const r = roomIdRef.current;
    socket.emit('typing', { roomId: r, isTyping: false });
    const payload = { roomId: r, text: t };
    socket.emit('send-message', payload);
    playPop();
    setInput('');
  };

  const handleVoiceMessage = (audioDataUrl) => {
    if (!socket || !roomIdRef.current) return;
    socket.emit('send-message', { roomId: roomIdRef.current, text: audioDataUrl, type: 'voice' });
  };

  const handleInputChange = (value) => {
    setInput(value);
    const r = roomIdRef.current;
    if (socket && r) {
      socket.emit('typing', { roomId: r, isTyping: value.length > 0 });
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => socket.emit('typing', { roomId: r, isTyping: false }), 2000);
    }
  };

  const sendQuickEmoji = (emoji) => {
    if (!socket || !roomIdRef.current) return;
    socket.emit('send-message', { roomId: roomIdRef.current, text: emoji });
  };

  const shuffleIcebreaker = () => {
    setInput(pickIcebreakers(1)[0]);
    inputRef.current?.focus();
  };

  const formatTimer = (secs) =>
    `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div className="mm-text-chat">
      <header className="mm-text-chat__header">
        <div className="mm-text-chat__header-start">
          <button type="button" id="text-back-btn" onClick={handleBack} className="mm-text-chat__icon-btn" aria-label="Leave chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="mm-text-chat__brand">
            <HellooooLogo size={24} />
            <div>
              <HellooooBrand size="sm" />
              <p className="mm-text-chat__topic">#{interest || 'general'}</p>
            </div>
          </div>
        </div>
        <div className="mm-text-chat__header-end">
          {connected && (
            <CoinBadge
              balance={balance}
              streak={streak}
              canClaim={canClaim}
              nextClaim={nextClaim ?? 0}
              claimCoins={claimCoins}
              registered={registered}
              currentActiveSeconds={currentActiveSeconds}
              isCreator={isCreator}
            />
          )}
          <SettingsGearButton onClick={() => setShowSettings(true)} className="mm-text-chat__icon-btn" />
        </div>
      </header>

      {adsEnabled && (
        <AdSlot slotKey="chat_banner" script={adScripts?.chat_banner} adsEnabled={adsEnabled} compact className="mm-text-chat__ad" />
      )}

      {status === 'connected' && peer && (
        <div className="mm-text-chat__peer">
          <div className="mm-text-chat__peer-info">
            <span className="mm-text-chat__peer-avatar" aria-hidden>{peer.isCreator ? '⭐' : '👤'}</span>
            <div className="min-w-0">
              <p className="mm-text-chat__peer-name">
                {countryToFlag(peer?.country)}{' '}
                {peer.isCreator ? `@${peer.nickname}` : (peer.nickname || 'Stranger')}
                {peer.isCreator && <BlueTick />}
              </p>
              <p className="mm-text-chat__peer-meta">Connected · {formatTimer(connectedSecs)}</p>
            </div>
          </div>
          <div className="mm-text-chat__peer-actions">
            <button type="button" className="mm-text-chat__peer-btn" onClick={() => setShowReportModal(true)}>Report</button>
            <button type="button" className="mm-text-chat__peer-btn mm-text-chat__peer-btn--skip" onClick={requestSkip}>Skip</button>
          </div>
        </div>
      )}

      <main className="mm-text-chat__main">
        {(status === 'idle' || status === 'searching') && (
          <div className="mm-text-chat__empty">
            <div className="mm-text-chat__empty-icon" aria-hidden>{status === 'idle' ? '💬' : '🔍'}</div>
            <h2>{status === 'idle' ? 'Text chat' : SEARCHING_STATUSES[searchStatusIndex]}</h2>
            <p>{status === 'idle' ? 'Tap start to match with someone new.' : 'Hang tight — finding your next chat…'}</p>
            {status === 'searching' && (
              <div className="mm-text-chat__dots" aria-hidden>
                <span /><span /><span />
              </div>
            )}
          </div>
        )}

        {status === 'connected' && (
          <div ref={chatScrollRef} className="mm-text-chat__messages custom-scrollbar" id="text-chat-messages">
            {messages.length === 0 && (
              <div className="mm-text-chat__welcome">
                <p>👋 You&apos;re connected</p>
                <span>Say hello to start the conversation.</span>
              </div>
            )}
            {messages.map((m) => (
              <ChatBubble key={m.id ?? `${m.socketId}-${m.ts}`} m={m} isMe={isFromMe(m)} />
            ))}
            {strangerTyping && (
              <div className="mm-text-chat__typing" aria-live="polite">
                <span className="mm-typing-dot" /><span className="mm-typing-dot" /><span className="mm-typing-dot" />
                <span>typing…</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </main>

      <footer className="mm-text-chat__footer">
        {(status === 'connected' || status === 'searching') && (
          <ChatMatchStatus
            className="mm-chat-match-status--text"
            status={status === 'connected' ? 'connected' : 'searching'}
            peerCountry={peer?.country}
            peerName={peer?.nickname}
            matchedInterests={status === 'connected' ? sharedInterests : []}
          />
        )}

        {status === 'connected' && (
          <div className="mm-text-chat__prompts">
            {quickPrompts.map((q) => (
              <button key={q} type="button" className="mm-text-chat__prompt" onClick={() => setInput(q)}>{q}</button>
            ))}
            <button type="button" className="mm-text-chat__prompt mm-text-chat__prompt--shuffle" onClick={shuffleIcebreaker}>💡 Idea</button>
          </div>
        )}

        <SkipProSheet
          open={showSkipSheet}
          onClose={() => setShowSkipSheet(false)}
          onSkip={executeSkip}
          isPro={isPro || subscription === 'pro'}
          partnerName={peer?.nickname || 'stranger'}
          partnerUserId={peer?.userId}
          userCountry={country}
          onActivated={() => window.location.reload()}
        />

        <div className="mm-text-chat__input-bar">
          {status === 'idle' ? (
            <button type="button" className="mm-btn mm-btn--primary mm-text-chat__start" onClick={handleStart}>Start chat</button>
          ) : (
            <>
              <button type="button" className="mm-text-chat__skip-btn" onClick={requestSkip}>
                {status === 'searching' ? 'Stop' : 'Skip'}
              </button>
              {status === 'connected' && (
                <div className="mm-text-chat__emoji-row">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" className="mm-text-chat__emoji-btn" onClick={() => sendQuickEmoji(emoji)} aria-label={`Send ${emoji}`}>{emoji}</button>
                  ))}
                </div>
              )}
              {(status === 'connected' || status === 'searching') && (
                <ChatInputWithEmoji
                  value={input}
                  onChange={handleInputChange}
                  onSend={sendMsg}
                  placeholder={status === 'connected' ? 'Type a message…' : 'Searching for a next user…'}
                  disabled={status !== 'connected'}
                  showVoice={PHASE_2.voiceMessages}
                  onVoiceMessage={handleVoiceMessage}
                  enterToSend={prefs.enterToSend}
                  className="flex-1 min-w-0"
                  inputClassName="mm-text-chat__input"
                />
              )}
            </>
          )}
        </div>
      </footer>

      {toast && (
        <div className="mm-text-chat__toast" role="status">{toast}</div>
      )}

      <ReportSafetyModal open={showReportModal} onClose={() => setShowReportModal(false)} onSubmit={submitSafetyReport} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
