import { useCallback, useEffect, useRef, useState } from 'react';
import { countryToFlag } from '../utils/countryFlag';
import { useLatency } from '../hooks/useLatency';
import { API_BASE } from '../config/apiBase';
import { mmDebug } from '../utils/mmDebug';
import { nextMsgId } from '../utils/uniqueId';
import { CoinBadge } from './CoinBadge';
import { AdSlot } from './AdSlot';
import { ReportSafetyModal } from './ReportSafetyModal';
import { ChatInputWithEmoji } from './ChatInputWithEmoji';
import { PHASE_2, PHASE_3_PRO, PHASE_4_UNIQUE } from '../constants/features';
import { ensureNotifyPermission, notifyIfBackground } from '../utils/browserNotify';
import { playDing, playPop } from '../utils/sounds';
import { usePrefs } from '../utils/userPrefs';
import { SettingsPanel, SettingsGearButton } from './SettingsPanel';
import { HellooooBrand, HellooooLogo } from './HellooooBrand';
import { ProFeaturesMenu } from './ProFeaturesMenu';
import { useUniqueSession } from '../hooks/useUniqueSession';
import {
  AiStatusPill,
  CalmModeToggle,
  CoOpStreakBadge,
  NvidiaCopilotToast,
  TrustScoreChip,
} from './unique/UniqueSessionUI';

const AI_ICEBREAKERS = {
  general: [
    "If you could travel anywhere right now, where would you go?",
    "What's the most interesting thing you've learned recently?",
    "What's your favorite way to spend a rainy afternoon?",
    "If you could have dinner with any historical figure, who would it be?",
    "What's the best piece of advice you've ever received?"
  ],
  telugu: [
    "What's your favorite Telugu movie of all time? 🎬",
    "Which Telugu song are you currently obsessed with? 🎵",
    "Have you tried the new street food spots in Hyderabad lately?",
    "What's your favorite memory related to a Telugu festival?",
    "If you could meet one Telugu actor, who would it be?"
  ],
  music: [
    "What's one song that always puts you in a good mood?",
    "If you could go to any concert in history, which one would it be?",
    "What's your favorite genre of music to listen to while working?",
    "What's the best live performance you've ever seen?",
    "Do you play any musical instruments?"
  ],
  gaming: [
    "What's the first video game you ever played?",
    "What's your all-time favorite game soundtrack?",
    "If you could live in any video game world, which one would it be?",
    "What's the most challenging game you've ever completed?",
    "Are you more of a PC gamer or a console gamer?"
  ]
};

const EMOJIS_3D = [
  { char: '🔥', label: 'Fire', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.webp' },
  { char: '💎', label: 'Gem', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f48e/512.webp' },
  { char: '🚀', label: 'Rocket', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f680/512.webp' },
  { char: '✨', label: 'Sparkle', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2728/512.webp' },
  { char: '🎉', label: 'Party', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f389/512.webp' },
  { char: '❤️', label: 'Heart', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2764_fe0f/512.webp' },
  { char: '😂', label: 'Laugh', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.webp' },
  { char: '👑', label: 'Crown', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f451/512.webp' },
];

const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥'];

const SEARCHING_STATUSES = [
  'Searching nearby users',
  'Matching interests',
  'Checking availability',
  'Connecting secure channel',
  'Finding someone...',
];

const MAX_MEDIA_SIZE_MB = 5;

const BlueTick = () => (
  <span className="inline-flex items-center justify-center w-3 h-3 bg-violet-500 rounded-full ml-1.5 shadow-[0_0_10px_#a78bfa]">
    <svg className="w-2 h-2 text-black" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  </span>
);

function MessageSpark({ x, y }) {
  const [active, setActive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setActive(false), 800);
    return () => clearTimeout(t);
  }, []);
  if (!active) return null;
  return (
    <div className="fixed pointer-events-none z-[3000]" style={{ left: x, top: y }}>
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-violet-400 rounded-full animate-spark"
          style={{
            '--tx': `${(Math.random() - 0.5) * 60}px`,
            '--ty': `${(Math.random() - 0.5) * 60}px`,
            animationDelay: `${i * 50}ms`
          }}
        />
      ))}
    </div>
  );
}

function VanishingMessage({ m, isMe, onReply }) {
  const { vanishMessages } = usePrefs();
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    if (m.system || !vanishMessages) return;
    const age = Math.floor((Date.now() - (m.ts || Date.now())) / 1000);
    const rem = Math.max(0, 60 - age);
    setTimeLeft(rem);

    if (rem <= 0) return;

    const int = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(int);
  }, [m.ts, m.system, vanishMessages]);

  if (!m.system && vanishMessages && timeLeft <= 0) return null;

  if (m.system) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded shadow-sm text-center">
          {m.text}
        </span>
      </div>
    );
  }

  const mStr = Math.floor(timeLeft / 60);
  const sStr = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-message-pop mt-2`}>
        <div className={`msg-bubble ${isMe ? 'me' : 'them'} flex flex-col gap-1 relative group min-w-[60px]`}>
            {!m.system && (
              <button
                onClick={() => onReply && onReply(m)}
                className={`absolute -top-3 ${isMe ? '-left-3' : '-right-3'} opacity-0 group-hover:opacity-100 bg-white/10 hover:bg-white/20 p-1 rounded-full text-xs transition-opacity z-10`}
                title="Reply"
                aria-label="Reply to message"
              >
                ↩️
              </button>
            )}
            {m.replyTo && (
              <div className="text-[10px] opacity-60 mb-1 border-l-2 border-white/20 pl-2 italic">
                <span className="font-black">{m.replyTo.isCreator ? `@${m.replyTo.nickname}` : (m.replyTo.nickname || 'Someone')}</span>: {m.replyTo.text?.slice(0, 40)}{m.replyTo.text?.length > 40 ? '...' : ''}
              </div>
            )}
            <div className="flex items-center gap-1 mb-0.5">
              <span className={`text-[10px] font-semibold ${isMe ? 'text-violet-300/90' : 'text-white/45'}`}>
                {m.isCreator ? `@${m.nickname}` : (isMe ? 'You' : m.nickname || 'Stranger')}
              </span>
              {m.isCreator && <BlueTick />}
            </div>
            <div className="flex gap-2 items-end">
                {m.media ? (
                    <div className="max-w-[180px] rounded-lg overflow-hidden border border-white/10">
                        {m.type === 'video' ? (
                            <video src={m.content} controls className="w-full" autoPlay playsInline muted />
                        ) : (
                            <img src={m.content} className="w-full h-auto" alt="media" />
                        )}
                    </div>
                ) : m.type === 'voice' ? (
                    <audio controls src={m.audio || m.text} className="max-w-[220px] w-full" />
                ) : (
                    <p className="text-[15px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {m.text}
                    </p>
                )}
                {vanishMessages && (
                  <span className={`text-[9px] font-mono shrink-0 mb-[-2px] ${timeLeft <= 10 ? 'text-amber-400 animate-pulse font-bold' : 'opacity-40'}`}>
                      {mStr}:{sStr}
                  </span>
                )}
            </div>
        </div>
    </div>
  );
}

export default function TextChat({ socket, connected, country, onlineCount, interest = 'general', nickname = 'Anonymous', language = '', region = '', isCreator = false, onBack, onJoined, onFindNewPartner, adsEnabled = false, adScripts = {}, coinState, registered = false, currentActiveSeconds = 0, conversationMode = 'free', topicContract = 'chill', calmMode: calmModeProp = false, isPro = false, subscription = null }) {
  const { balance, streak, canClaim, nextClaim, claimCoins } = coinState;
  const [messages, setMessages] = useState([]);
  const [sparks, setSparks] = useState([]);
  const [input, setInput] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [peer, setPeer] = useState(null);
  // status: idle | searching | connected | disconnected
  const [status, setStatus] = useState('searching');
  const [showRating, setShowRating] = useState(false);
  const [lastRoomId, setLastRoomId] = useState(null);
  const latency = useLatency();
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isTranslatorActive, setIsTranslatorActive] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [active3dEmoji, setActive3dEmoji] = useState(null);
  const [mutedStranger, setMutedStranger] = useState(false);
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [searchStatusIndex, setSearchStatusIndex] = useState(0);
  const [connectedSecs, setConnectedSecs] = useState(0);
  const [showSkipSuggestion, setShowSkipSuggestion] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [calmMode, setCalmMode] = useState(calmModeProp);
  const roomIdRef = useRef(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const statusRef = useRef(status);
  const skipRef = useRef(null);
  const backRef = useRef(null);
  const messagesRef = useRef(messages);
  const userLeftTimerRef = useRef(null);
  const initialFindEmittedRef = useRef(false);
  const handleSkipRef = useRef(null);
  const onJoinedRef = useRef(onJoined);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const prefs = usePrefs();
  const [showSettings, setShowSettings] = useState(false);
  statusRef.current = status;
  messagesRef.current = messages;
  onJoinedRef.current = onJoined;

  // Small local toast (matches other chat surfaces)
  useEffect(() => {
    if (!toast) return;
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(toastTimerRef.current);
  }, [toast]);

  const isConnected = !!peer && !!roomId;

  const unique = useUniqueSession({
    socket,
    roomId,
    status,
    messages,
    interest,
    conversationMode,
    topicContract,
    calmMode,
    autoConsent: true,
  });

  const isFromMe = (m) => {
    if (!m) return false;
    return m.socketId === socket.id || m.fromSelf;
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const emitFind = useCallback(() => {
    if (!socket || !connected) return;
    socket.emit('find-partner', {
      mode: 'text',
      interest: interest || 'general',
      nickname: nickname || 'Anonymous',
      language,
      region: region || country,
      conversationMode,
      topicContract,
    });
  }, [socket, connected, interest, nickname, language, region, country, conversationMode, topicContract]);

  const clearRoom = useCallback(() => {
    setPeer(null);
    setRoomId(null);
    setMessages([]);
    roomIdRef.current = null;
  }, []);

  // Auto-start matchmaking on mount (once, when socket is connected) — mirrors VideoChat's pattern
  useEffect(() => {
    if (!socket || !connected || initialFindEmittedRef.current || roomIdRef.current) return;
    initialFindEmittedRef.current = true;
    emitFind();
  }, [socket, connected, emitFind]);

  // ---- socket events ----
  useEffect(() => {
    if (!socket) return;

    const onPartnerFound = (data) => {
      mmDebug('chat.match', data.roomId);
      roomIdRef.current = data.roomId;
      setLastRoomId(data.roomId);
      setRoomId(data.roomId);
      setPeer(data.peer);
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
        // Trigger spark for incoming messages on message location
        const el = document.getElementById('text-chat-messages');
        if (el) {
          const rect = el.getBoundingClientRect();
          // Fix #8: Cap sparks to 20 to prevent memory growth
          setSparks(prev => [...prev.slice(-20), { id: nextMsgId('spark'), x: rect.left + rect.width / 2, y: rect.bottom - 100 }]);
        }
      }
    };

    const onUserLeft = () => {
      setStatus('disconnected');
      setPeer(null);
      // Fix #7: Capture room ID at time of event to avoid race condition
      const currentRoom = roomIdRef.current;
      clearTimeout(userLeftTimerRef.current);
      userLeftTimerRef.current = setTimeout(() => {
        if (roomIdRef.current !== currentRoom) return; // new room joined, don't skip
        handleSkipRef.current?.();
      }, 800);
    };

    const onStrangerTyping = (data) => {
      setStrangerTyping(data.isTyping);
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setStrangerTyping(false), 2500);
    };

    const onWaiting = () => setStatus('searching');
    const onSystemMsg = (data) => setMessages((m) => [...m, { id: nextMsgId('sys'), system: true, text: `📢 ADMIN: ${data.message}`, ts: Date.now() }]);

    const on3dEmoji = (data) => {
      setActive3dEmoji(data);
      setMessages(prev => [...prev.slice(-100), {
        id: nextMsgId('emoji'),
        text: `Sent a 3D ${data.emoji.char || data.emoji}`,
        system: false,
        socketId: data.socketId,
        nickname: data.nickname,
        ts: Date.now(),
        isEmoji: true
      }]);
      setTimeout(() => setActive3dEmoji(null), 3000);
    };

    const onContentFlagged = (data) => {
      setMessages(m => [...m, { id: nextMsgId('sys'), system: true, text: `🛡️ ${data.message}`, ts: Date.now() }]);
    };

    const onServerError = (data) => {
      setToast(data?.message || 'Something went wrong.');
    };

    const onDisconnect = (reason) => {
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
        setStatus('disconnected');
        clearTimeout(userLeftTimerRef.current);
        userLeftTimerRef.current = setTimeout(() => handleSkipRef.current?.(), 2000);
      }
    };

    socket.on('partner-found', onPartnerFound);
    socket.on('chat-history', onHistory);
    socket.on('chat-message', onMessage);
    socket.on('user-left', onUserLeft);
    socket.on('stranger-typing', onStrangerTyping);
    socket.on('waiting-for-partner', onWaiting);
    socket.on('system-announcement', onSystemMsg);
    socket.on('3d-emoji', on3dEmoji);
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
      socket.off('3d-emoji', on3dEmoji);
      socket.off('content-flagged', onContentFlagged);
      socket.off('error', onServerError);
      socket.off('disconnect', onDisconnect);
    };
  // Handlers read latest values through refs — register once per socket
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const onMediaMessage = (data) => {
      setMessages(prev => [...prev.slice(-100), { ...data, media: true }]);
    };
    socket.on('media-message', onMediaMessage);
    return () => {
      socket.off('media-message', onMediaMessage);
    };
  }, [socket]);

  const send3dEmoji = (emojiObj) => {
    // Fix #10: Guard room existence before emitting
    if (!roomIdRef.current) return;
    if (balance < 5) { setToast('⚠️ Need 5 coins for 3D Emoji!'); return; }
    if (socket) {
      socket.emit('send-3d-emoji', { roomId: roomIdRef.current, emoji: emojiObj });
      setShowEmojiPicker(false);
    }
  };

  const handleMediaUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_MEDIA_SIZE_MB * 1024 * 1024) {
      setToast(`⚠️ File must be under ${MAX_MEDIA_SIZE_MB}MB`);
      e.target.value = '';
      return;
    }
    const type = file.type.startsWith('video') ? 'video' : 'image';
    const cost = type === 'video' ? 15 : 10;
    if (balance < cost) { setToast(`⚠️ Need ${cost} coins!`); e.target.value = ''; return; }

    if (type === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = function () {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > 6) { // Allowing small buffer
          setToast('⚠️ Video must be 5 seconds or less!');
          return;
        }
        processUpload(file);
      };
      video.src = URL.createObjectURL(file);
    } else {
      processUpload(file);
    }
    e.target.value = '';
  };

  const processUpload = (file) => {
    // Fix #5: Guard room existence before uploading
    if (!roomIdRef.current) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      socket.emit('send-media', { roomId: roomIdRef.current, type: file.type.startsWith('video') ? 'video' : 'image', content: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  // Fix #6: Translator with infinite loop guard
  useEffect(() => {
    if (!isTranslatorActive) return;

    // Find messages from stranger that aren't translated yet
    const toTranslate = messages.find(m =>
      !m.system &&
      !m.media &&
      !isFromMe(m) &&
      !m.translated &&
      !m.translating
    );
    // Fix #6: Guard — if already translating, do nothing (prevents infinite loop)
    if (!toTranslate || toTranslate.translating) return;

    const targetId = toTranslate.id;
    setMessages(prev => prev.map(m => m.id === targetId ? { ...m, translating: true } : m));

    fetch(`${API_BASE}/api/ai/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: toTranslate.text })
    })
      .then(res => res.json())
      .then(data => {
        setMessages(prev => prev.map(m => m.id === targetId ? { ...m, translated: data.translated, translating: false } : m));
      })
      .catch(() => {
        setMessages(prev => prev.map(m => m.id === targetId ? { ...m, translating: false } : m));
      });
  }, [messages, isTranslatorActive]);

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

  // Smart skip suggestion after 30s no messages
  useEffect(() => {
    if (!isConnected || messages.length === 0) {
      setShowSkipSuggestion(false);
      return;
    }
    setShowSkipSuggestion(false);
    const t = setTimeout(() => setShowSkipSuggestion(true), 30000);
    return () => clearTimeout(t);
  }, [isConnected, messages]);

  // keyboard shortcut - stable handler with refs
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'Escape') {
        const s = statusRef.current;
        if (s === 'connected' || s === 'searching') {
          skipRef.current?.();
        } else {
          backRef.current?.();
        }
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
      });
      if (block && targetId) socket.emit('block-user', { targetSocketId: targetId });
    }
    setTimeout(() => handleSkip(), 800);
  };

  const handleStart = () => {
    if (!socket || !connected) return;
    void ensureNotifyPermission();
    clearRoom();
    setStatus('searching');
    emitFind();
  };

  const handleSkip = useCallback(() => {
    if (roomIdRef.current && socket) {
      socket.emit('leave-room', { roomId: roomIdRef.current });
    } else {
      socket?.emit('cancel-find-partner');
    }
    const hadMessages = (messagesRef.current || []).filter((m) => !m.system).length >= 2;
    if (hadMessages) setShowRating(true);
    clearRoom();
    setStatus('searching');
    setTimeout(() => {
      // Single find-partner emit for the skip/abort path (component-side only)
      socket?.emit('find-partner', { mode: 'text', interest: interest || 'general', nickname: nickname || 'Anonymous', language, region: region || country, conversationMode, topicContract });
    }, 50);
  }, [socket, interest, nickname, language, region, country, conversationMode, topicContract]);

  skipRef.current = handleSkip;
  handleSkipRef.current = handleSkip;

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

  const sendMsg = () => {
    const t = input.trim();
    // Fix #10 minor: Use only ref (single source of truth), never fall back to stale state
    if (!t || !socket || !roomIdRef.current) return;
    const r = roomIdRef.current;
    socket.emit('typing', { roomId: r, isTyping: false });
    const payload = { roomId: r, text: t };
    if (replyingTo) payload.replyTo = { id: replyingTo.id, text: replyingTo.text, nickname: replyingTo.nickname };
    socket.emit('send-message', payload);
    playPop();
    setInput('');
    setReplyingTo(null);
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

  const generateAiSpark = async () => {
    if (isAiGenerating) return;
    setIsAiGenerating(true);

    try {
      const res = await fetch(`${API_BASE}/api/ai/spark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest })
      });
      if (res.ok) {
        const data = await res.json();
        setInput(data.spark);
      } else {
        const list = AI_ICEBREAKERS[interest.toLowerCase()] || AI_ICEBREAKERS.general;
        setInput(list[Math.floor(Math.random() * list.length)]);
      }
    } catch (e) {
      const list = AI_ICEBREAKERS[interest.toLowerCase()] || AI_ICEBREAKERS.general;
      setInput(list[Math.floor(Math.random() * list.length)]);
    } finally {
      setIsAiGenerating(false);
      inputRef.current?.focus();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-realm-void text-[#f8fafc] font-sans selection:bg-violet-500/30 selection:text-violet-100 overflow-hidden relative">
      {sparks.map(s => <MessageSpark key={s.id} x={s.x} y={s.y} />)}
      {/* SYSTEM BACKGROUND DECOR */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
      </div>

      {/* SAFETY LAYER */}
      <div className="absolute top-[84px] left-1/2 -translate-x-1/2 z-[100] pointer-events-none px-6 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-full flex items-center gap-3 animate-pulse">
         <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
         <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400 italic">Safe Mode Active</span>
      </div>

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-[150] h-20 px-8 flex items-center justify-between bg-black/20 backdrop-blur-3xl border-b border-white/5">
        <div className="flex items-center gap-4">
          <button
            id="text-back-btn"
            type="button"
            onClick={handleBack}
            className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/20 transition-all flex items-center justify-center text-white/40 hover:text-white"
            title="Disconnect"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <img src="/helloooo-logo.png" alt="Helloooo" className="w-8 h-8 object-contain rounded-lg sm:hidden" />
          <div className="hidden sm:flex sm:items-center sm:gap-2">
            <HellooooLogo size={28} />
            <div>
              <HellooooBrand size="sm" />
              <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mt-0.5">
                # {interest || 'General'} Topics
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {PHASE_3_PRO.reconnectToken && <ProFeaturesMenu isProUser={isPro || subscription === 'pro'} />}
          {PHASE_4_UNIQUE.trustScore && <TrustScoreChip trust={unique.trust} />}
          {PHASE_4_UNIQUE.nvidiaCopilot && <AiStatusPill online={unique.aiOnline} />}
          {PHASE_4_UNIQUE.coOpStreak && <CoOpStreakBadge minutes={unique.coOpMinutes} />}
          {PHASE_4_UNIQUE.calmMode && (
            <CalmModeToggle enabled={calmMode} onToggle={() => setCalmMode((c) => !c)} />
          )}
          {connected && (
            <>
              <div className="hidden lg:block">
                 <CoinBadge balance={balance} streak={streak} canClaim={canClaim} nextClaim={nextClaim ?? 0} claimCoins={claimCoins} registered={registered} currentActiveSeconds={currentActiveSeconds} isCreator={isCreator} />
              </div>
              <div className="flex px-3 py-1.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[9px] font-black text-white/40 uppercase tracking-widest gap-2 items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                {(typeof onlineCount === 'object' ? onlineCount?.count : onlineCount) || 0} Users Online
              </div>
            </>
          )}
          {status === 'connected' && (
            <button
              onClick={() => setIsTranslatorActive(!isTranslatorActive)}
              className={`p-2.5 rounded-xl border transition-all ${isTranslatorActive ? 'bg-violet-500/10 border-violet-500/50 text-violet-400' : 'bg-white/5 border-white/5 text-white/30 hover:text-white hover:border-white/20'}`}
              title="AI Smart Translator"
              aria-label="AI Smart Translator"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            </button>
          )}
          <SettingsGearButton
            onClick={() => setShowSettings(true)}
            className="p-2.5 rounded-xl border bg-white/5 border-white/5 text-white/30 hover:text-white hover:border-white/20 transition-all"
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col pt-24 pb-8 max-w-4xl w-full mx-auto px-6 gap-4 min-h-0 relative z-10">
        <AdSlot slotKey="chat_banner" script={adScripts?.chat_banner} adsEnabled={adsEnabled} compact className="shrink-0" />
        
        {/* CHAT CONTAINER */}
        <div className="flex-1 flex flex-col rounded-[40px] overflow-hidden border border-white/[0.05] bg-[#0a0a0a]/60 backdrop-blur-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] min-h-0 relative">
          
          {active3dEmoji && (
            <div className="absolute inset-0 pointer-events-none z-[100] flex items-center justify-center overflow-hidden">
               <div className="animate-in-zoom flex flex-col items-center gap-4">
                  <picture className="drop-shadow-[0_0_30px_rgba(167,139,250,0.4)]">
                    <source srcSet={active3dEmoji.emoji.url} type="image/webp" />
                    <img src={active3dEmoji.emoji.url} className="w-40 h-40 object-contain" alt="3d" />
                  </picture>
                  <span className="bg-black/60 backdrop-blur-xl px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 text-violet-400 shadow-2xl">
                    Stranger Sent {active3dEmoji.emoji.char}
                  </span>
               </div>
            </div>
          )}

          {/* PEER HEADER */}
          {status === 'connected' && peer && (
            <>
              {PHASE_4_UNIQUE.structuredModes && unique.modePrompt && (
                <div className="px-6 py-2 bg-[#76B900]/5 border-b border-[#76B900]/20 text-center">
                  <p className="text-[11px] text-white/70 italic">&ldquo;{unique.modePrompt}&rdquo;</p>
                </div>
              )}
            <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.05] bg-white/[0.01]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-xl shadow-inner group">
                   {peer.isCreator ? '⭐' : '👤'}
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                    {countryToFlag(peer?.country)} {peer.isCreator ? `@${peer.nickname}` : 'Anonymous Stranger'}
                    {peer.isCreator && <BlueTick />}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                     <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_5px_#c4b5fd]" />
                     <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                       Connected • {String(Math.floor(connectedSecs / 60)).padStart(2, '0')}:{String(connectedSecs % 60).padStart(2, '0')}
                     </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMutedStranger((m) => !m)}
                  className={`p-2.5 rounded-xl border transition-all ${mutedStranger ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-white/5 border-white/5 text-white/30 hover:text-white'}`}
                  aria-label={mutedStranger ? 'Unmute stranger messages' : 'Mute stranger messages'}
                  title={mutedStranger ? 'Unmute stranger' : 'Mute stranger'}
                >
                  {mutedStranger ? '🔇' : '🔊'}
                </button>
                <div className="w-px h-6 bg-white/5 mx-1" />
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-rose-300/90 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 transition-all"
                >
                  Report
                </button>
                <button
                  type="button"
                  onClick={() => handleSkip()}
                  className="px-6 py-2.5 rounded-xl bg-rose-500/5 border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 transition-all active:scale-95"
                >
                  End Chat
                </button>
              </div>
            </div>
            </>
          )}

          {/* IDLE / SEARCHING STATES */}
          {(status === 'idle' || status === 'searching') && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-8">
              <div className="relative">
                <div className="w-32 h-32 rounded-[40px] bg-white/[0.02] border border-violet-500/10 flex items-center justify-center text-5xl relative z-10 animate-pulse-slow shadow-[inset_0_0_40px_rgba(167,139,250,0.05)]">
                  {status === 'idle' ? '💬' : '🔍'}
                </div>
                <div className="absolute inset-[-20px] border border-violet-500/5 rounded-[60px] animate-spin-slower" />
                <div className="absolute inset-[-40px] border border-violet-500/[0.03] rounded-[80px] animate-reverse-spin-slow opacity-50" />
              </div>
              <div className="space-y-4 max-w-sm">
                <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">
                  {status === 'idle' ? 'Start Text Chat' : SEARCHING_STATUSES[searchStatusIndex]}
                </h2>
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em] leading-relaxed">
                  {status === 'idle' 
                    ? 'Connect with people across the globe. Privacy protected.' 
                    : 'System is matching you with an available person...'}
                </p>
              </div>
              {status === 'searching' && (
                <div className="flex gap-2">
                   <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" />
                   <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce [animation-delay:0.2s]" />
                   <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce [animation-delay:0.4s]" />
                </div>
              )}
            </div>
          )}

          {/* DISCONNECTED STATE (Auto-seek will trigger) */}
          {status === 'disconnected' && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-6">
              <div className="w-20 h-20 rounded-3xl bg-rose-500/5 border border-rose-500/20 flex items-center justify-center text-4xl animate-pulse">👋</div>
              <div className="space-y-3">
                <h2 className="text-lg font-black italic uppercase text-rose-400 tracking-tighter">Chat Ended</h2>
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest leading-relaxed">
                   The other person has left.<br />
                   <span className="text-violet-400 animate-pulse">Finding a new friend in 2s...</span>
                </p>
              </div>
            </div>
          )}

          {/* CHAT MESSAGES DISPLAY */}
          {status === 'connected' && (
            <div
              className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 sm:px-6 sm:py-6 space-y-1 min-h-0 overscroll-contain"
              id="text-chat-messages"
            >
              {messages.length === 0 && (
                <div className="text-center py-12 px-4">
                  <div className="text-3xl mb-2" aria-hidden>👋</div>
                  <p className="text-sm font-semibold text-white/70">You&apos;re connected</p>
                  <p className="text-xs text-white/35 mt-1">Say hello to break the ice.</p>
                </div>
              )}
              {messages.map((m, i) => {
                const isMe = isFromMe(m);
                if (mutedStranger && !isMe && !m.system) return null;
                // Fix #9: Stable key — never use array index as fallback
                return <VanishingMessage key={m.id ?? `${m.socketId}-${m.ts}`} m={m} isMe={isMe} onReply={(msg) => setReplyingTo(msg)} />;
              })}
              {strangerTyping && (
                <div className="flex items-center gap-2 self-start mt-1" aria-live="polite">
                  <div className="flex gap-1 items-center bg-white/[0.07] border border-white/10 py-2.5 px-3.5 rounded-2xl rounded-bl-md text-white/70">
                    <span className="mm-typing-dot" />
                    <span className="mm-typing-dot" />
                    <span className="mm-typing-dot" />
                  </div>
                  <span className="text-[11px] text-white/35">typing…</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* INPUT & CONTROLS */}
        <div className="flex flex-col gap-4 relative z-10">
           {status === 'connected' && showSkipSuggestion && (
              <div className="absolute top-[-60px] left-1/2 -translate-x-1/2 animate-in-zoom">
                <button
                  type="button"
                  onClick={() => handleSkip()}
                  className="px-6 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest shadow-2xl backdrop-blur-xl"
                >
                  Low Activity? Skip to next person →
                </button>
              </div>
           )}

           {replyingTo && (
              <div className="absolute -top-12 left-4 right-4 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 flex justify-between items-center z-[100] animate-in-zoom">
                <div className="flex items-center gap-2 overflow-hidden">
                   <span className="text-xs">↩️</span>
                   <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Replying to {replyingTo.nickname || 'Stranger'}:</span>
                   <span className="text-xs text-white/80 truncate opacity-60 italic">"{replyingTo.text?.slice(0, 40)}{replyingTo.text?.length > 40 ? '...' : ''}"</span>
                </div>
                <button onClick={() => setReplyingTo(null)} className="text-white/40 hover:text-white p-1 ml-2">✕</button>
              </div>
           )}

           <div className="flex items-end gap-2 sm:gap-3">
              {(status === 'idle') ? (
                <button
                  onClick={handleStart}
                  className="flex-1 min-h-[52px] sm:min-h-[56px] rounded-2xl bg-violet-500 text-black font-bold text-sm hover:bg-violet-400 transition-all shadow-[0_0_28px_rgba(167,139,250,0.35)] active:scale-[0.98]"
                >
                  Start chat
                </button>
              ) : (
                <button
                  onClick={handleSkip}
                  className="shrink-0 px-4 sm:w-28 min-h-[52px] sm:min-h-[56px] rounded-2xl bg-white/[0.04] border border-white/10 hover:border-violet-500/40 text-white/60 hover:text-violet-300 font-semibold text-xs transition-all hover:bg-violet-500/5"
                >
                  {status === 'searching' ? 'Abort' : 'Skip'}
                </button>
              )}

              {status === 'connected' && (
                <ChatInputWithEmoji
                  value={input}
                  onChange={handleInputChange}
                  onSend={sendMsg}
                  placeholder={isAiGenerating ? 'AI is thinking…' : 'Type a message…'}
                  disabled={isAiGenerating}
                  showVoice={PHASE_2.voiceMessages}
                  onVoiceMessage={handleVoiceMessage}
                  enterToSend={prefs.enterToSend}
                  className="flex-1 min-w-0"
                  /* 16px font stops iOS Safari zooming on focus */
                  inputClassName="min-h-[52px] sm:min-h-[56px] rounded-2xl bg-white/[0.05] border-white/10 focus:border-violet-500/50 text-[16px] sm:text-sm font-normal normal-case tracking-normal not-italic backdrop-blur-xl placeholder:text-white/30"
                />
              )}
           </div>

           {/* ACTION DOCK */}
           {status === 'connected' && (
             <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                   {QUICK_REACTIONS.map(emoji => (
                     <button
                       key={emoji}
                       onClick={() => {
                        if (balance >= 5) send3dEmoji(EMOJIS_3D.find(e => e.char === emoji) || {char: emoji, url: ''});
                        else socket.emit('send-message', {roomId: roomIdRef.current, text: emoji});
                       }}
                       className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/5 hover:border-violet-500/20 text-lg flex items-center justify-center grayscale hover:grayscale-0 transition-all"
                       aria-label={`Send reaction ${emoji}`}
                     >
                       {emoji}
                     </button>
                   ))}
                   <div className="w-px h-6 bg-white/5 mx-2" />
                   <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/40 text-emerald-400 flex items-center justify-center text-lg hover:bg-emerald-500/5 transition-all"
                    aria-label="Send image or video"
                   >📂</button>
                   <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleMediaUpload} />

                   <div className="relative">
                     <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`w-10 h-10 rounded-xl bg-white/[0.02] border ${showEmojiPicker ? 'border-amber-500 bg-amber-500/10' : 'border-white/5'} hover:border-amber-500/40 text-amber-400 flex items-center justify-center text-lg transition-all`}
                      aria-label="Open emoji picker"
                     >✨</button>
                     {showEmojiPicker && (
                       <div className="absolute bottom-full left-0 mb-4 p-5 bg-black/90 backdrop-blur-3xl border border-white/10 rounded-[40px] w-[280px] shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-in-zoom z-[500]">
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-4">Expressive Icons (Free)</div>
                          <div className="grid grid-cols-6 gap-2 mb-6">
                             {['😊','😂','🔥','❤️','✨','💎','🚀','🎉','🤔','😮','👑','🍕'].map(c => (
                               <button key={c} onClick={() => {
                                 const rid = roomIdRef.current;
                                 if (socket && rid) socket.emit('send-message', {roomId: rid, text: c});
                                 setShowEmojiPicker(false);
                               }} className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-lg transition-all">{c}</button>
                             ))}
                          </div>
                          
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-violet-400/40 mb-4">Premium Emojis (5🪙)</div>
                          <div className="grid grid-cols-4 gap-2">
                             {EMOJIS_3D.map(e => (
                               <button key={e.char} onClick={() => send3dEmoji(e)} className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/5 hover:border-violet-500/40 flex items-center justify-center text-xl transition-all shadow-inner">{e.char}</button>
                             ))}
                          </div>
                       </div>
                     )}
                   </div>
                </div>

                <button 
                  onClick={generateAiSpark}
                  disabled={isAiGenerating}
                  className={`px-5 py-2.5 rounded-2xl border transition-all text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${isAiGenerating ? 'bg-violet-500/10 border-violet-500/30 text-violet-400 animate-pulse' : 'bg-white/5 border-white/5 text-white/30 hover:border-violet-500/40 hover:text-violet-400'}`}
                >
                  <svg className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  {isAiGenerating ? 'AI thinking...' : 'AI Icebreaker'}
                </button>
             </div>
           )}
        </div>

        <div className="flex justify-between items-center px-4 font-black uppercase text-[8px] tracking-[0.5em] text-white/5">
           <span>Secure Encryption Active</span>
           <span>User ID {socket?.id?.substring(0, 8)}</span>
        </div>
      </main>

      <NvidiaCopilotToast
        prompt={unique.copilotPrompt}
        onUse={() => unique.applyCopilotToInput(setInput)}
        onDismiss={unique.dismissCopilot}
      />

      {toast && (
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[2000] max-w-[90vw] px-4 py-3 rounded-2xl bg-black/90 border border-white/10 text-xs font-bold text-white shadow-2xl animate-fade-in-up">
          {toast}
        </div>
      )}

      <ReportSafetyModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={submitSafetyReport}
      />

      {/* RATING MODAL */}
      {showRating && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-8 bg-black/90 backdrop-blur-3xl animate-in-zoom" onClick={() => setShowRating(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Rate your chat"
            className="bg-black border border-white/10 rounded-[40px] p-10 max-w-sm w-full text-center shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-4xl mb-6 scale-125 animate-bounce">⭐</div>
            <h3 className="text-xl font-black italic uppercase italic tracking-tighter text-white mb-4">How was your chat?</h3>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-10 leading-relaxed">Help us improve your experience by rating this conversation.</p>
            <div className="flex gap-2">
              {['Poor', 'Neutral', 'Elite'].map((label, idx) => (
                <button 
                  key={label}
                  onClick={() => {
                    socket?.emit('rate-conversation', { rating: idx + 1, roomId: lastRoomId || roomIdRef.current });
                    setShowRating(false);
                  }} 
                  className={`flex-1 py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${idx === 2 ? 'bg-violet-500 text-black hover:bg-white' : 'bg-white/5 border border-white/5 hover:border-white/20'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
