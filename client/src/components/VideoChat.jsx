/**
 * VideoChat – 1:1 anonymous video chat with WebRTC
 * Full Omegle-style: searching→matched→skip
 * Layout: remote video (main) | local video (pip) | side chat
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { countryToFlag } from '../utils/countryFlag';
import { CreatorProfilePopup } from './CreatorProfilePopup';
import { AdSlot } from './AdSlot';

const BlueTick = () => (
  <span className="inline-flex items-center justify-center w-3 h-3 bg-violet-500 rounded-full ml-1.5 shadow-[0_0_10px_#a78bfa]">
    <svg className="w-2 h-2 text-black" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  </span>
);
import { useLatency } from '../hooks/useLatency';
import { useIceServers } from '../hooks/useIceServers';
import { CoinBadge } from './CoinBadge';
import { ReportSafetyModal } from './ReportSafetyModal';
import { ensureNotifyPermission, notifyIfBackground } from '../utils/browserNotify';
import { playConnectSound, playMessageSound, playDisconnectSound, playWaveSound } from '../utils/sounds';
import { mmDebug } from '../utils/mmDebug';

function MessageSpark({ x, y }) {
  const [active, setActive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setActive(false), 800);
    return () => clearTimeout(t);
  }, []);
  if (!active || (typeof window !== 'undefined' && window.innerWidth < 640)) return null;
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

const AI_ICEBREAKERS = {
  general: [
    "What's the most surprising thing about your day so far?",
    "If you could have any superpower, what would it be?",
    "What's your favorite secret spot in your city?",
    "If you had to eat one meal for the rest of your life, what would it be?",
    "What's the best concert you've ever attended?"
  ],
  telugu: [
    "Which Telugu movie dialogue do you use most in real life?",
    "If you could be any character in a Rajamouli film, who would you be?",
    "What's your favorite place in Andhra or Telangana for a road trip?",
    "Do you prefer classical Telugu literature or modern films?",
    "What's the one thing everyone should experience in a Telugu wedding?"
  ],
  music: [
    "What's your favorite guilty pleasure song?",
    "If you could play any instrument perfectly overnight, which one would it be?",
    "What's the best soundtrack to a movie or game you've ever heard?",
    "Who is your all-time favorite musical artist?",
    "What's the most meaningful lyric you've ever heard?"
  ],
  gaming: [
    "What's the most immersive world you've ever explored in a game?",
    "If you could build your dream game, what would the genre be?",
    "What's the biggest 'clutch' moment you've ever had in a game?",
    "Gaming on a big TV or a small monitor? What's your choice?",
    "What's the first game that made you actually emotional?"
  ]
};

function VideoEl({ stream, muted = false, mirror = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`w-full h-full object-cover -scale-x-100 ${className}`}
    />
  );
}

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

const API_BASE = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');

const VIDEO_FILTERS = [
  { id: 'none', label: 'Normal' },
  { id: 'grayscale(100%)', label: 'Noir (B&W)' },
  { id: 'sepia(80%)', label: 'Vintage (Sepia)' },
  { id: 'hue-rotate(90deg)', label: 'Alien (Hue)' },
  { id: 'invert(100%)', label: 'Negative' },
  { id: 'contrast(150%) brightness(120%)', label: 'Intense' },
];

function VanishingMessage({ m, isMe }) {
  const [timeLeft, setTimeLeft] = useState(90);

  useEffect(() => {
    if (m.system) return;
    const age = Math.floor((Date.now() - (m.ts || Date.now())) / 1000);
    const rem = Math.max(0, 90 - age);
    setTimeLeft(rem);

    if (rem <= 0) return;

    const int = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(int);
  }, [m.ts, m.system]);

  if (!m.system && timeLeft <= 0) return null;

  if (m.system) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded shadow-sm">
          {m.text}
        </span>
      </div>
    );
  }

  const mStr = Math.floor(timeLeft / 60);
  const sStr = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <div className={`relative max-w-[85%] px-3 py-2 rounded-lg text-sm flex flex-col gap-1 transition-all ${isMe ? 'bg-[#1a7f37] text-white rounded-tr-none' : 'bg-white/10 text-white/90 rounded-tl-none border border-white/5'}`}>
        <div className="flex flex-col gap-0.5 mb-1">
          <div className="flex items-center gap-1">
            <span className={`text-[8px] font-black uppercase tracking-widest ${isMe ? 'text-violet-400' : 'text-white/40'}`}>
              {m.isCreator ? `@${m.nickname}` : (isMe ? 'You' : m.nickname || 'Stranger')}
            </span>
            {m.isCreator && <BlueTick />}
          </div>
        </div>
        {m.replyTo && (
          <div className="mb-2 p-2 rounded-md bg-black/20 border-l-2 border-violet-400 text-[10px] opacity-70 italic">
            <div className="font-bold not-italic mb-0.5">{m.replyTo.nickname}</div>
            {m.replyTo.text}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <p className="break-words leading-relaxed whitespace-pre-wrap">{m.text}</p>
          <span className={`text-[9px] font-mono shrink-0 mb-0.5 ${timeLeft <= 10 ? 'text-amber-400 animate-pulse font-bold' : 'opacity-50'}`}>
            {mStr}:{sStr}
          </span>
        </div>
      </div>
    </div>
  );
}

function SafetyShield({ active = false, label = "SAFETY SCAN" }) {
  if (!active) return null;
  const isMob = typeof window !== 'undefined' && window.innerWidth < 640;
  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
      {!isMob && <div className="absolute inset-0 bg-gradient-to-b from-violet-500/10 via-transparent to-violet-500/10 animate-scan-line pointer-events-none" />}
      <div className="flex flex-col items-center gap-3 animate-pulse-slow">
        <div className="w-16 h-16 rounded-full border-2 border-violet-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(167,139,250,0.3)] bg-violet-950/40">
          <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <span className="text-[10px] font-black tracking-[0.3em] text-violet-400 uppercase drop-shadow-[0_0_8px_rgba(167,139,250,0.8)]">{label}</span>
      </div>
    </div>
  );
}

function SecurityShield() {
  return (
    <div className="absolute top-4 right-4 z-[100] group cursor-pointer pointer-events-auto">
      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:bg-emerald-500 hover:text-black transition-all">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
      </div>
      <div className="absolute top-10 right-0 w-48 p-3 rounded-2xl bg-realm-surface/95 border border-violet-500/15 backdrop-blur-3xl text-[9px] font-black uppercase tracking-widest text-emerald-400 opacity-0 group-hover:opacity-100 transition-all pointer-events-none shadow-2xl shadow-violet-950/20">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>AES-256 P2P Active</span>
        </div>
        <p className="text-white/40 leading-relaxed font-bold">Encrypted directly between devices. No intermediate server decryption possible.</p>
      </div>
    </div>
  );
}

function RecordingIndicator() {
  return (
    <div className="absolute top-4 left-4 z-[100] flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-600/20 border border-rose-500/30 backdrop-blur-md animate-pulse pointer-events-none">
      <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-400">Recording Session</span>
    </div>
  );
}

export default function VideoChat({ socket, connected, country, onlineCount, interest = 'general', nickname = 'Anonymous', isCreator = false, adsEnabled = false, adScripts = {}, onBack, onJoined, onFindNewPartner, coinState, registered = false, currentActiveSeconds = 0 }) {
  const [coins, setCoins] = useState(coinState?.balance || 0);
  const [showProfileHandle, setShowProfileHandle] = useState(null);

  useEffect(() => {
    if (coinState?.balance !== undefined) setCoins(coinState.balance);
  }, [coinState?.balance]);
  const { balance, streak, canClaim, nextClaim, claimCoins, history, addHistory } = coinState || {};
  const { iceServers } = useIceServers();
  const [messages, setMessages] = useState([]);
  const [sparks, setSparks] = useState([]);
  const [input, setInput] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [peer, setPeer] = useState(null);
  const [status, setStatus] = useState('searching');
  const [replyingTo, setReplyingTo] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [strangerCameraOff, setStrangerCameraOff] = useState(false);
  const [mutedStranger, setMutedStranger] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const latency = useLatency();
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isTranslatorActive, setIsTranslatorActive] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [active3dEmoji, setActive3dEmoji] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [toast, setToast] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [autoBandwidth, setAutoBandwidth] = useState(true);
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState(
    () => (typeof window !== 'undefined' ? window.localStorage.getItem('mm_videoDeviceId') : null)
  );
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(
    () => (typeof window !== 'undefined' ? window.localStorage.getItem('mm_audioDeviceId') : null)
  );
  const [remoteVolume, setRemoteVolume] = useState(1);
  const [cameraBlur, setCameraBlur] = useState(false);
  const [connectedSecs, setConnectedSecs] = useState(0);
  const connectedSecsRef = useRef(0);
  const [p2pHealth, setP2pHealth] = useState('good');
  const healthTimerRef = useRef(null);
  const tabHiddenAtRef = useRef(null);
  const [showWave, setShowWave] = useState(false);
  const [moodEmoji, setMoodEmoji] = useState(null);
  const [showInterestCard, setShowInterestCard] = useState(false);
  const [goodVibesSent, setGoodVibesSent] = useState(false);
  const [goodVibesMatch, setGoodVibesMatch] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [countryBanner, setCountryBanner] = useState(null);
  const [showChat, setShowChat] = useState(true);
  const [activeFilter, setActiveFilter] = useState('none');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showCoinHistory, setShowCoinHistory] = useState(false);
  const [smartReplies, setSmartReplies] = useState([]);
  const [filterTimer, setFilterTimer] = useState(0);
  const [showDeductionAnim, setShowDeductionAnim] = useState(false);
  const [deductionValue, setDeductionValue] = useState(0);
  const [strangerFilter, setStrangerFilter] = useState('none');
  const [strangerBlur, setStrangerBlur] = useState(false);
  const [isModerating, setIsModerating] = useState(false);
  const filterIntervalRef = useRef(null);
  const [myCountry, setMyCountry] = useState(country);
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [interestTags, setInterestTags] = useState(['social', 'fun', 'music', 'gaming']);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const connTimerRef = useRef(null);
  const typingTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const pipDragRef = useRef(null);
  const pcRef = useRef(null);
  const roomIdRef = useRef(null);
  const firstSocketConnectRef = useRef(true);
  const isMounted = useRef(true);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const pendingOfferRef = useRef(null);
  const pendingAnswerRef = useRef(null);
  const peerInfoRef = useRef(new Map());
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const isConnected = !!peer && !!roomId;

  const connectionQuality = latency == null
    ? 'unknown'
    : latency < 120
      ? 'good'
      : latency < 260
        ? 'ok'
        : 'poor';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [pipPos, setPipPos] = useState('br');
  const togglePip = () => {
    const pos = ['tr', 'tl', 'bl', 'br'];
    setPipPos(pos[(pos.indexOf(pipPos) + 1) % pos.length]);
  };

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(toastTimerRef.current);
  }, [toast]);

  useEffect(() => {
    if (status === 'connected') {
      setConnectedSecs(0);
      connTimerRef.current = setInterval(() => setConnectedSecs(s => s + 1), 1000);
    } else {
      clearInterval(connTimerRef.current);
    }
    return () => clearInterval(connTimerRef.current);
  }, [status]);

  useEffect(() => {
    connectedSecsRef.current = connectedSecs;
  }, [connectedSecs]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (status === 'connected') tabHiddenAtRef.current = Date.now();
      } else {
        const t = tabHiddenAtRef.current;
        tabHiddenAtRef.current = null;
        if (t && status === 'connected' && Date.now() - t > 45000) {
          setToast('Welcome back — your anonymous session is still active.');
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [status]);

  const formatTimer = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const last = messages.filter(m => !m.system && !m.fromSelf && (m.socketId !== (socket?.id))).slice(-1)[0];
    if (!last?.text) return;
    const t = last.text.toLowerCase();
    if (/lol|haha|😂|😄|funny|lmao/.test(t)) setMoodEmoji('😂');
    else if (/wow|amazing|omg|whoa|really/.test(t)) setMoodEmoji('😮');
    else if (/hmm|think|maybe|wonder|idk/.test(t)) setMoodEmoji('🤔');
    else if (/great|nice|good|cool|love|awesome/.test(t)) setMoodEmoji('😊');
    else setMoodEmoji(null);
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
    const onWave = () => { setShowWave(true); setTimeout(() => setShowWave(false), 2800); playWaveSound(); };
    const onGoodVibesMatch = () => { setGoodVibesMatch(true); setToast('🤝 Both of you gave Good Vibes! Great conversation!'); playConnectSound(); };
    const onContentFlagged = (data) => setToast(`⚠️ ${data.message}`);
    const onTyping = ({ isTyping }) => {
      setStrangerTyping(isTyping);
      if (isTyping) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setStrangerTyping(false), 3000);
      }
    };
    socket.on('wave-reaction', onWave);
    socket.on('good-vibes-match', onGoodVibesMatch);
    socket.on('content-flagged', onContentFlagged);
    socket.on('stranger-typing', onTyping);
    return () => {
      socket.off('wave-reaction', onWave);
      socket.off('good-vibes-match', onGoodVibesMatch);
      socket.off('content-flagged', onContentFlagged);
      socket.off('stranger-typing', onTyping);
    };
  }, [socket]);

  const sendWave = () => {
    if (socket && roomIdRef.current) {
      socket.emit('send-wave', { roomId: roomIdRef.current });
      setShowWave(true);
      setTimeout(() => setShowWave(false), 2800);
    }
  };

  const sendGoodVibes = () => {
    if (socket && roomIdRef.current) {
      socket.emit('send-good-vibes', { roomId: roomIdRef.current });
      setGoodVibesSent(true);
      setToast('🤝 Good Vibes sent! Waiting for the other person...');
    }
  };

  const submitRating = (stars) => {
    setRatingDone(true);
    setShowRating(false);
    setToast(`Thanks for rating! ${'⭐'.repeat(stars)} — Your feedback helps improve Mana Mingle.`);
  };

  const generateAiSummary = async (msgs) => {
    if (!msgs || msgs.length < 3) return;
    try {
      const res = await fetch(`${API_BASE}/api/ai/spark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest: 'Summarize this anonymous conversation in 2 fun bullet points (no names, no personal info): ' + msgs.filter(m => !m.system).map(m => m.text).join(' | ') })
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data.spark);
        setShowSummary(true);
      }
    } catch (e) { }
  };

  useEffect(() => {
    let s = null;
    (async () => {
      try {
        const baseConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          },
          audio: selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : { echoCancellation: true, noiseSuppression: true },
        };
        try {
          s = await navigator.mediaDevices.getUserMedia(baseConstraints);
        } catch (e) {
          s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode } },
            audio: true
          });
        }
        localStreamRef.current = s;
        setLocalStream(s);
        if (localVideoRef.current) localVideoRef.current.srcObject = s;
      } catch (err) {
        console.error('Camera/mic error:', err);
        setCameraError('We could not access your camera or microphone. Please allow permissions and try again.');
      }
    })();
    return () => {
      if (s) s.getTracks().forEach((t) => { t.stop(); t.enabled = false; });
    };
  }, [selectedAudioDeviceId, facingMode]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter((d) => d.kind === 'videoinput');
        const audios = devices.filter((d) => d.kind === 'audioinput');

        setVideoDevices(videos);
        setAudioDevices(audios);

        if (!selectedVideoDeviceId && videos[0]?.deviceId) {
          setSelectedVideoDeviceId(videos[0].deviceId);
        }
        if (!selectedAudioDeviceId && audios[0]?.deviceId) {
          setSelectedAudioDeviceId(audios[0].deviceId);
        }
      } catch (e) {
        console.error('enumerateDevices error', e);
      }
    };

    loadDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', loadDevices);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', loadDevices);
  }, [selectedVideoDeviceId, selectedAudioDeviceId]);

  useEffect(() => {
    if (!localStream) return;
    const vt = localStream.getVideoTracks()[0];
    const at = localStream.getAudioTracks()[0];

    peerConnectionsRef.current.forEach((pc) => {
      if (pc.signalingState === 'closed') return;
      const senders = pc.getSenders();
      const vs = senders.find(s => s.track?.kind === 'video');
      const as = senders.find(s => s.track?.kind === 'audio');

      if (vs && vt) vs.replaceTrack(vt).catch(() => { });
      if (as && at) as.replaceTrack(at).catch(() => { });
    });
  }, [localStream]);

  useEffect(() => {
    if (!localStream) return;
    const vt = localStream.getVideoTracks()[0];
    if (!vt) return;
    const targetLow = lowBandwidth || (autoBandwidth && latency != null && latency > 260);
    const c = targetLow ? { width: 640, height: 480, frameRate: 15 } : { width: 1280, height: 720 };
    vt.applyConstraints(c).catch(() => { });
  }, [lowBandwidth, autoBandwidth, latency, localStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => { });
    }
  }, [localStream, status]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !peer?.stream) return;
    el.srcObject = peer.stream;
    el.volume = remoteVolume;
    el.play?.().catch(() => { });
  }, [peer?.stream, remoteVolume]);

  const bandwidthLabel = autoBandwidth ? 'Auto' : (lowBandwidth ? 'Low' : 'High');

  const clearRoom = useCallback(() => {
    if (healthTimerRef.current) clearTimeout(healthTimerRef.current);
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    pendingOfferRef.current = null;
    pendingAnswerRef.current = null;
    peerInfoRef.current.clear();
    setPeer(null);
    setRoomId(null);
    setMessages([]);
    roomIdRef.current = null;
    setP2pHealth('good');
  }, []);

  const handleStart = () => {
    if (!socket || !connected) return;
    void ensureNotifyPermission();
    clearRoom();
    setStatus('searching');
    socket.emit('find-partner', { mode: 'video', interest: interest || 'general', nickname: nickname || 'Anonymous' });
  };

  const handleSkip = useCallback(() => {
    if (statusRef.current === 'connected' && connectedSecsRef.current >= 3 && selectedInterests.length > 0) {
      setToast(`Anonymous session ended (~${connectedSecsRef.current}s). Topics: ${selectedInterests.join(', ')} — not stored on our servers.`);
    }
    if (socket) {
      if (roomIdRef.current) socket.emit('leave-room', { roomId: roomIdRef.current });
      else socket.emit('cancel-find-partner');
    }
    clearRoom();
    setStatus('searching');
    setGoodVibesSent(false); setGoodVibesMatch(false); setCameraBlur(false);
    setStrangerFilter('none'); setStrangerBlur(false);
    setTimeout(() => {
      if (statusRef.current !== 'idle') {
        socket?.emit('find-partner', { mode: 'video', interest: interest || 'general', nickname: nickname || 'Anonymous' });
        onFindNewPartner?.();
      }
    }, 100);
  }, [socket, interest, status, onFindNewPartner, clearRoom, selectedInterests]);

  const handleStop = useCallback(() => {
    if (statusRef.current === 'connected' && connectedSecsRef.current >= 3 && selectedInterests.length > 0) {
      setToast(`Anonymous session ended (~${connectedSecsRef.current}s). Topics: ${selectedInterests.join(', ')} — not stored on our servers.`);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (roomIdRef.current && socket) socket.emit('leave-room', { roomId: roomIdRef.current });
    socket?.emit('cancel-find-partner');
    clearRoom();
    setStatus('idle');
    setGoodVibesSent(false); setGoodVibesMatch(false); setCameraBlur(false);
    setStrangerFilter('none'); setStrangerBlur(false);
  }, [socket, clearRoom, selectedInterests]);

  const handleBack = () => { handleStop(); onBack?.(); };

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
    mmDebug('report', reason, block);
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const next = !muted;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    const next = !cameraOff;
    localStreamRef.current.getVideoTracks().forEach((v) => (v.enabled = !next));
    setCameraOff(next);
    if (socket && roomIdRef.current) {
      socket.emit('video-style', { roomId: roomIdRef.current, cameraOff: next });
    }
  };

  const toggleFacingMode = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: nextMode }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      peerConnectionsRef.current.forEach(pc => {
        const vs = pc.getSenders().find(s => s.track?.kind === 'video');
        if (vs) vs.replaceTrack(stream.getVideoTracks()[0]).catch(e => console.error('Switch error', e));
      });
      setToast(`📷 Switched to ${nextMode === 'user' ? 'Front' : 'Back'} Camera`);
    } catch (e) {
      // Fallback for devices with only one camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
  };

  const retryIce = useCallback(async () => {
    const remoteId = peer?.socketId;
    const rid = roomIdRef.current;
    if (!remoteId || !rid || !socket) return;
    const pc = peerConnectionsRef.current.get(remoteId);
    if (!pc || pc.signalingState === 'closed') return;
    try {
      if (typeof pc.restartIce === 'function') pc.restartIce();
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'offer', signal: pc.localDescription });
      setToast('Reconnecting…');
      mmDebug('iceRestart', remoteId);
    } catch (e) {
      mmDebug('iceRestart.err', e);
      setToast('Could not retry link — try Next or Refresh camera');
    }
  }, [peer?.socketId, socket]);

  const retryMediaLocal = useCallback(async () => {
    try {
      const baseConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : { echoCancellation: true, noiseSuppression: true },
      };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(baseConstraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: true });
      }
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      peerConnectionsRef.current.forEach((pc) => {
        if (pc.signalingState === 'closed') return;
        const vt = stream.getVideoTracks()[0];
        const at = stream.getAudioTracks()[0];
        pc.getSenders().forEach((s) => {
          if (s.track?.kind === 'video' && vt) s.replaceTrack(vt).catch(() => { });
          if (s.track?.kind === 'audio' && at) s.replaceTrack(at).catch(() => { });
        });
      });
      setCameraError(null);
      setToast('Camera & mic refreshed');
      setP2pHealth('good');
    } catch (e) {
      mmDebug('retryMedia', e);
      setCameraError('Could not access camera/mic again.');
    }
  }, [facingMode, selectedAudioDeviceId]);

  const handleEsc = useCallback(() => {
    if (status === 'connected' || status === 'searching' || status === 'disconnected') {
      handleStop();
    } else {
      handleBack();
    }
  }, [status, handleStop, handleBack]);

  useEffect(() => {
    const handleDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.code === 'Space' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleSkip();
        return;
      }
      if (e.key === 'Escape' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handleEsc();
        return;
      }
      if (e.code === 'KeyM') { e.preventDefault(); toggleMute(); }
      if (e.code === 'KeyV') { e.preventDefault(); toggleCamera(); }
      if (e.code === 'KeyB') { e.preventDefault(); setCameraBlur(prev => !prev); }
      if (e.code === 'KeyC') { e.preventDefault(); setShowChat(prev => !prev); }
      if (e.key.toLowerCase() === 's' && status === 'idle') { e.preventDefault(); handleStart(); }
    };

    window.addEventListener('keydown', handleDown);
    return () => window.removeEventListener('keydown', handleDown);
  }, [handleSkip, handleStop, toggleMute, toggleCamera, handleStart, handleEsc, status]);

  const toggleInterestTag = (tag) => {
    setSelectedInterests(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  useEffect(() => {
    const handleVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      if (!peer?.stream) return;
      peer.stream.getVideoTracks().forEach((t) => { t.enabled = !hidden; });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [peer]);

  useEffect(() => {
    if (socket && roomIdRef.current && status === 'connected') {
      socket.emit('video-style', { roomId: roomIdRef.current, filter: activeFilter, blur: cameraBlur });
    }
  }, [activeFilter, cameraBlur, socket, status]);

  const balanceRef = useRef(balance);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    if (!isCreator && activeFilter !== 'none') setActiveFilter('none');
  }, [isCreator, activeFilter]);

  useEffect(() => {
    if (!isCreator) {
      setFilterTimer(0);
      return;
    }
    if (activeFilter === 'none') {
      setFilterTimer(0);
      return;
    }

    // Set 60s timer for the premium filter
    setFilterTimer(60);

    const tickInterval = setInterval(() => {
      setFilterTimer(prev => {
        if (prev <= 1) {
          setActiveFilter('none');
          setToast('📺 Premium filter duration expired. Reverted to Normal.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(tickInterval);
  }, [activeFilter, isCreator]);

  const handleFilterSelect = (filterId) => {
    if (!isCreator) return;
    if (filterId === 'none') {
      setActiveFilter('none');
      setShowFilterMenu(false);
      return;
    }

    const COST = 15;
    if (coins < COST) {
      setToast(`⚠️ You need ${COST} coins for Premium Filters.`);
      return;
    }

    if (socket) socket.emit('spend-coins', { amount: COST, reason: 'Premium Video Filter (60s)' });

    // Trigger animation
    setDeductionValue(COST);
    setShowDeductionAnim(true);
    setTimeout(() => setShowDeductionAnim(false), 2000);

    setActiveFilter(filterId);
    setShowFilterMenu(false);
    setToast(`✨ Premium Filter Active: 60s duration started.`);
  };

  useEffect(() => {
    const fetchReplies = async () => {
      const last = messages.filter(m => !m.system && m.socketId !== socket?.id).slice(-1)[0];
      if (!last?.text) {
        setSmartReplies([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/ai/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastMessage: last.text })
        });
        if (res.ok) {
          const data = await res.json();
          setSmartReplies(data.replies || []);
        }
      } catch (e) { setSmartReplies([]); }
    };

    const timeout = setTimeout(fetchReplies, 800);
    return () => clearTimeout(timeout);
  }, [messages, socket?.id]);

  useEffect(() => {
    if (status === 'connected') {
      setTimeout(() => inputRef.current?.focus(), 500);
      setToast('✅ Connected with a stranger!');
      setMessages(prev => [...prev, { system: true, text: `Connected to a stranger from ${peer?.country || 'the network'}` }]);
      playConnectSound();
      setIsModerating(true);
      const timer = setTimeout(() => setIsModerating(false), 3000);
      return () => clearTimeout(timer);
    } else if (status === 'disconnected') {
      playDisconnectSound();
      setIsModerating(false);
    } else {
      setIsModerating(false);
    }
  }, [status]);

  useEffect(() => {
    if (!peer) return;
    if (peer.country || country) {
      setCountryBanner({ myCountry: country, peerCountry: peer.country });
      setTimeout(() => setCountryBanner(null), 4000);
    }
  }, [peer]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const createPeerConnection = useCallback((remoteId) => {
    if (peerConnectionsRef.current.has(remoteId)) return peerConnectionsRef.current.get(remoteId);
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }

    pc.onicecandidate = (e) => {
      const rid = roomIdRef.current;
      if (e.candidate && socket && rid) {
        socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'ice-candidate', signal: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const info = peerInfoRef.current.get(remoteId) || {};
      const streams = e.streams;
      let stream = null;
      if (streams && streams[0]) {
        stream = streams[0];
      } else {
        stream = new MediaStream([e.track]);
      }

      setPeer((prev) => {
        if (prev?.socketId === remoteId && prev?.stream) {
          if (!prev.stream.getTracks().find(t => t.id === e.track.id)) {
            prev.stream.addTrack(e.track);
          }
          return { ...prev, nickname: info.nickname || prev.nickname, country: info.country || prev.country };
        }
        return { socketId: remoteId, stream, nickname: info.nickname || prev?.nickname, country: info.country || prev?.country, isCreator: info.isCreator };
      });
    };

    pc.onconnectionstatechange = () => {
      mmDebug('pc', remoteId, pc.connectionState);
      const cs = pc.connectionState;
      if (cs === 'failed' || cs === 'closed') setP2pHealth('failed');
      else if (cs === 'connected') setP2pHealth('good');
    };

    pc.oniceconnectionstatechange = () => {
      const ice = pc.iceConnectionState;
      mmDebug('ice', remoteId, ice);
      if (ice === 'connected' || ice === 'completed') {
        setP2pHealth('good');
        if (healthTimerRef.current) clearTimeout(healthTimerRef.current);
      } else if (ice === 'failed') {
        setP2pHealth('failed');
      } else if (ice === 'disconnected' || ice === 'checking') {
        if (healthTimerRef.current) clearTimeout(healthTimerRef.current);
        healthTimerRef.current = setTimeout(() => {
          const cur = peerConnectionsRef.current.get(remoteId);
          if (cur === pc && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
            setP2pHealth((h) => (h === 'failed' ? 'failed' : 'unstable'));
          }
        }, 4000);
      }

      if (ice === 'failed' || ice === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
            setPeer((p) => (p?.socketId === remoteId ? null : p));
          }
        }, 3000);
      }
    };

    peerConnectionsRef.current.set(remoteId, pc);
    pcRef.current = pc;
    return pc;
  }, [socket, iceServers]);

  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);

  const doOffer = useCallback(async (remoteId) => {
    const rid = roomIdRef.current;
    if (!rid || !socket) return;
    const pc = createPeerConnection(remoteId);
    try {
      makingOffer.current = true;
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'offer', signal: pc.localDescription });
    } catch (err) { console.warn('[WEBRTC] Offer collision handled:', err); }
    finally { makingOffer.current = false; }
  }, [socket, createPeerConnection]);

  const doAnswer = useCallback(async (remoteId, offer) => {
    const rid = roomIdRef.current;
    if (!rid || !socket) return;
    const pc = createPeerConnection(remoteId);
    try {
      const isOffer = offer.type === 'offer';
      const collision = isOffer && (makingOffer.current || pc.signalingState !== 'stable');
      const polite = socket.id < remoteId;
      ignoreOffer.current = !polite && collision;

      if (ignoreOffer.current) return;

      if (collision && polite) {
        await pc.setLocalDescription({ type: 'rollback' });
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
      } else {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
      }

      if (isOffer) {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'answer', signal: pc.localDescription });

        const pend = pendingCandidatesRef.current.get(remoteId) || [];
        for (const c of pend) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => { });
        pendingCandidatesRef.current.set(remoteId, []);
      }
    } catch (err) {
      console.warn('[WEBRTC] Perfect Negotiation Error:', err);
    }
  }, [socket, createPeerConnection]);

  useEffect(() => {
    if (!localStream) return;
    const po = pendingOfferRef.current;
    if (po && roomIdRef.current && peer?.socketId === po) {
      pendingOfferRef.current = null;
      doOffer(po);
    }
    const pa = pendingAnswerRef.current;
    if (pa) {
      pendingAnswerRef.current = null;
      doAnswer(pa.from, pa.signal);
    }
  }, [localStream, peer?.socketId, doOffer, doAnswer]);

  const addIce = useCallback(async (remoteId, candidate) => {
    const pc = peerConnectionsRef.current.get(remoteId);
    const pend = pendingCandidatesRef.current.get(remoteId) || [];
    if (!pc) {
      pend.push(candidate);
      pendingCandidatesRef.current.set(remoteId, pend);
      return;
    }
    const add = async (c) => {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
        return true;
      } catch {
        return false;
      }
    };
    const ok = await add(candidate);
    if (!ok) {
      pend.push(candidate);
      pendingCandidatesRef.current.set(remoteId, pend);
      return;
    }
    for (const c of pend) await add(c);
    pendingCandidatesRef.current.set(remoteId, []);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onPartnerFound = (data) => {
      roomIdRef.current = data.roomId;
      setRoomId(data.roomId);
      const p = data.peer;
      if (p?.socketId) {
        peerInfoRef.current.set(p.socketId, { nickname: p.nickname, country: p.country, isCreator: p.isCreator });
        setPeer({ socketId: p.socketId, nickname: p.nickname, country: p.country, isCreator: p.isCreator, stream: null });
        if (socket.id < p.socketId) {
          if (localStreamRef.current) doOffer(p.socketId);
          else pendingOfferRef.current = p.socketId;
        }
      }
      setStatus('connected');
      setP2pHealth('good');
      onJoined?.(data.roomId);
      notifyIfBackground('Match found', 'Someone joined your Mana Mingle video chat.');

      // Automated Creator Introduction Synthesis
      if (isCreator && data.roomId) {
        setTimeout(() => {
          socket.emit('send-message', {
            roomId: data.roomId,
            text: `🎯 HI, THIS IS @${nickname}! View my profile here: ${window.location.origin}/creator/${nickname}`
          });
          setMessages(m => [...m, { id: 'auto-greet', system: true, text: 'Auto-Greeting Transmitted to Partner.', ts: Date.now() }]);
        }, 1500);
      }
    };

    const onHistory = (data) => {
      if (data.roomId === roomIdRef.current) setMessages(data.messages || []);
    };

    const onMsg = (data) => {
      if (data.roomId === roomIdRef.current) {
        setMessages((m) => [...m.slice(-100), data]);
        if (data.socketId !== socket.id) playMessageSound();
      }
    };

    const onUserLeft = () => {
      setPeer(null);
      setStatus('disconnected');
      setPartnerLeft(true);
      playDisconnectSound();

      setTimeout(() => {
        if (!isMounted.current || statusRef.current === 'idle' || statusRef.current === 'searching') return;
        handleSkip();
      }, 700);

      setTimeout(() => setPartnerLeft(false), 5000);
    };

    const onRoomEndedByAdmin = () => {
      setToast('⚠️ This session was terminated by administrative protocol.');
      setTimeout(() => handleBack(), 2000);
    };

    const onWaiting = () => setStatus('searching');
    const onSystemMsg = (data) => setMessages((m) => [...m, { id: Date.now(), system: true, text: `📢 ADMIN: ${data.message}`, ts: Date.now() }]);
    const onMaintenance = (data) => {
      alert(data.message || 'System is going into maintenance mode.');
      window.location.href = '/';
    };

    const onStrangerVideoStyle = (data) => {
      setStrangerFilter(data.filter || 'none');
      setStrangerBlur(!!data.blur);
      setStrangerCameraOff(!!data.cameraOff);
    };

    const onSignal = async (data) => {
      const from = data.fromSocketId;
      if (!from || from === socket.id) return;
      peerInfoRef.current.set(from, {
        nickname: data.fromNickname,
        country: data.fromCountry,
        isCreator: !!data.fromIsCreator
      });
      setPeer(prev => {
        if (prev?.socketId === from) return { ...prev, isCreator: !!data.fromIsCreator, nickname: data.fromNickname || prev.nickname };
        return { socketId: from, isCreator: !!data.fromIsCreator, nickname: data.fromNickname, country: data.fromCountry, stream: prev?.stream };
      });
      if (data.type === 'offer') {
        if (localStreamRef.current) doAnswer(from, data.signal);
        else pendingAnswerRef.current = { from, signal: data.signal };
      }
      else if (data.type === 'answer') {
        const pc = peerConnectionsRef.current.get(from);
        if (pc) {
          try {
            if (pc.signalingState !== 'have-local-offer') return;
            await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
            const pend = pendingCandidatesRef.current.get(from) || [];
            for (const c of pend) {
              try { if (c) await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ }
            }
            pendingCandidatesRef.current.set(from, []);
          } catch (err) { console.error('setRemoteDescription error', err); }
        }
      } else if (data.type === 'ice-candidate' && data.signal) {
        addIce(from, data.signal);
      }
    };

    socket.on('partner-found', onPartnerFound);
    socket.on('chat-history', onHistory);
    socket.on('chat-message', onMsg);
    socket.on('user-left', onUserLeft);
    socket.on('waiting-for-partner', onWaiting);
    socket.on('webrtc-signal', onSignal);
    socket.on('system-announcement', onSystemMsg);
    socket.on('stranger-video-style', onStrangerVideoStyle);
    socket.on('system-maintenance', onMaintenance);
    socket.on('room-ended-by-admin', onRoomEndedByAdmin);
    socket.on('content-flagged', (data) => {
      setMessages(m => [...m, { id: Date.now(), system: true, text: `🛡️ ${data.message}`, ts: Date.now() }]);
      playDisconnectSound();
    });
    socket.on('error', (data) => {
      setMessages(m => [...m, { id: Date.now(), system: true, text: `❌ ERROR: ${data.message || 'Something went wrong.'}`, ts: Date.now() }]);
    });
    const onSignalRateLimited = (data) => {
      const msg = data?.message || 'Too many connection signals. Please wait a moment.';
      setToast(typeof msg === 'string' ? `⏱️ ${msg}` : '⏱️ Rate limited — slow down for a few seconds.');
    };

    socket.on('signal-rate-limited', onSignalRateLimited);
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      if (firstSocketConnectRef.current) {
        firstSocketConnectRef.current = false;
        return;
      }
      setMessages((m) => [...m, { id: Date.now(), system: true, text: '✅ Reconnected to chat server.', ts: Date.now() }]);
    });
    socket.on('disconnect', (reason) => {
      console.warn('Socket disconnected:', reason);
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
        setMessages(m => [...m, { id: Date.now(), system: true, text: '⚠️ Connection lost. Reconnecting… stay on this screen.', ts: Date.now() }]);
      }
    });

    if (socket && status === 'searching' && !roomIdRef.current) {
      socket.emit('find-partner', { mode: 'video', interest: interest || 'general', nickname: 'Anonymous' });
    }

    return () => {
      socket.off('partner-found', onPartnerFound);
      socket.off('chat-history', onHistory);
      socket.off('chat-message', onMsg);
      socket.off('user-left', onUserLeft);
      socket.off('waiting-for-partner', onWaiting);
      socket.off('webrtc-signal', onSignal);
      socket.off('system-announcement', onSystemMsg);
      socket.off('stranger-video-style', onStrangerVideoStyle);
      socket.off('system-maintenance', onMaintenance);
      socket.off('room-ended-by-admin', onRoomEndedByAdmin);
      socket.off('content-flagged');
      socket.off('error');
      socket.off('signal-rate-limited', onSignalRateLimited);
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [socket, interest, onJoined, onFindNewPartner, doOffer, doAnswer, addIce, handleBack]);

  useEffect(() => {
    if (!isTranslatorActive) return;

    const untranslated = messages.filter(m => !m.fromSelf && !m.translated && !m.system && m.text && m.text.length > 2);
    if (untranslated.length === 0) return;

    const target = untranslated[untranslated.length - 1];
    const translateMsg = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/ai/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: target.text, to: 'English' })
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(prev => prev.map(m => (m.id === target.id || (m.text === target.text && m.ts === target.ts)) ? { ...m, translated: data.translated } : m));
        }
      } catch (e) { }
    };
    translateMsg();
  }, [messages, isTranslatorActive]);

  const startRecording = () => {
    if (!localStream || !peer?.stream) return alert('Ensure both local and stranger video are active to record.');

    // DVR Engine: Real-time Canvas Compositing
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    // Internal hidden video elements for capture
    const v1 = document.createElement('video');
    v1.srcObject = localStream;
    v1.play();
    const v2 = document.createElement('video');
    v2.srcObject = peer.stream;
    v2.play();

    const draw = () => {
      if (!isRecording) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Main: Stranger (Scaled)
      ctx.drawImage(v2, 0, 0, 1280, 720);

      // PinP: Self (Bordered Glass Look)
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 4;
      ctx.strokeRect(958, 498, 304, 204);
      ctx.drawImage(v1, 960, 500, 300, 200);

      requestAnimationFrame(draw);
    };

    setIsRecording(true);
    draw();

    const captureStream = canvas.captureStream(30);
    const recorder = new MediaRecorder(captureStream, { mimeType: 'video/webm;codecs=vp9' });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ManaMingle_CreatorCapture_${Date.now()}.webm`;
      a.click();
      setIsRecording(false);
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setToast('🎥 REC STARTED');
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      setToast('🎥 REC SAVED');
    }
  };

  const send3dEmoji = (emojiObj) => {
    if (coins < 5) return alert('Need 5 coins for 3D Emoji!');
    const r = roomIdRef.current;
    if (socket && r) {
      socket.emit('send-3d-emoji', { roomId: r, emoji: emojiObj });
      setShowEmojiPicker(false);
    }
  };

  const processUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const r = roomIdRef.current;
      if (!socket || !r) return;
      const type = file.type.startsWith('video') ? 'video' : 'image';
      const content = ev.target.result;
      setMessages(prev => [
        ...prev.slice(-100),
        {
          id: `local-med-${Date.now()}`,
          type,
          content,
          nickname,
          ts: Date.now(),
          socketId: socket.id,
          media: true,
        },
      ]);
      socket.emit('send-media', { roomId: r, type, content });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (socket) {
      socket.on('3d-emoji', (data) => {
        if (data.roomId && data.roomId !== roomIdRef.current) return;
        setActive3dEmoji(data);
        setMessages(prev => [...prev.slice(-100), {
          id: `emoji-${Date.now()}`,
          text: `Sent a 3D ${data.emoji?.char || data.emoji}`,
          socketId: data.socketId,
          nickname: data.nickname,
          ts: Date.now(),
          isEmoji: true,
          fromSelf: data.socketId === socket.id
        }]);
        setTimeout(() => setActive3dEmoji(null), 4000);
      });
      socket.on('media-message', (data) => {
        if (data.roomId && data.roomId !== roomIdRef.current) return;
        setMessages(prev => [...prev.slice(-100), { ...data, media: true }]);
      });
      return () => {
        socket.off('3d-emoji');
        socket.off('media-message');
      };
    }
  }, [socket]);

  useEffect(() => () => { clearRoom(); }, [clearRoom]);

  const sendMsg = () => {
    const t = input.trim();
    const r = roomIdRef.current;
    if (!t || !socket || !r) return;
    const payload = { roomId: r, text: t };
    if (replyingTo) {
      payload.replyTo = { id: replyingTo.id, text: replyingTo.text, nickname: replyingTo.nickname || 'Stranger' };
    }
    socket.emit('send-message', payload);
    socket.emit('typing', { roomId: r, isTyping: false });
    setInput('');
    setReplyingTo(null);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const r = roomIdRef.current;
    if (!socket || !r) return;
    socket.emit('typing', { roomId: r, isTyping: e.target.value.length > 0 });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket.emit('typing', { roomId: r, isTyping: false });
    }, 2000);
  };

  return (
    <div className="h-[100dvh] min-h-0 flex flex-col bg-realm-void text-white overflow-hidden font-sans select-none pt-[env(safe-area-inset-top)]">
      <header className={`mm-design-panel-header h-10 sm:h-12 px-2 sm:px-3 flex items-center gap-2 bg-realm-surface/95 z-[100] shrink-0 min-h-[2.5rem] ${isMobile ? 'backdrop-blur-sm' : 'backdrop-blur-md'}`}>
        <button type="button" onClick={handleBack} className="p-1.5 -ml-0.5 sm:-ml-1 rounded-lg hover:bg-white/5 transition-colors shrink-0" aria-label="Back">
          <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="flex-1 min-w-0 text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/40 truncate px-1">Mana Mingle Video</span>
        <div className="flex items-center justify-end gap-1 sm:gap-2 min-w-0 max-w-[min(52%,11rem)] sm:max-w-none shrink">
          {isCreator && (
            <button type="button" onClick={() => setShowFilterMenu(true)} className="relative group px-1.5 sm:px-2 py-1 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-widest bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-all border border-violet-500/20 flex flex-col items-center shrink-0">
              <span>Filters</span>
              {filterTimer > 0 && (
                <span className="text-[8px] text-amber-500 animate-pulse">{filterTimer}s</span>
              )}
            </button>
          )}
          {country && <span className="text-[13px] sm:text-[14px] leading-none opacity-80 shrink-0" title={`Location: ${country}`}>{countryToFlag(country)}</span>}
          <span className="hidden sm:inline text-[10px] text-white/30 tabular-nums whitespace-nowrap shrink-0">{(typeof onlineCount === 'object' ? onlineCount?.count : onlineCount) || 0} online</span>
          <span
            className="sm:hidden text-[9px] text-white/30 tabular-nums shrink-0 min-w-[1.25rem] text-right"
            title={`${(typeof onlineCount === 'object' ? onlineCount?.count : onlineCount) || 0} online`}
          >
            {(typeof onlineCount === 'object' ? onlineCount?.count : onlineCount) || 0}
          </span>
          {isCreator && (
            <div className="shrink-0 scale-90 sm:scale-100 origin-right">
              <CoinBadge balance={balance} streak={streak} canClaim={canClaim} nextClaim={nextClaim ?? 0} claimCoins={claimCoins} registered={registered} currentActiveSeconds={currentActiveSeconds} isCreator={isCreator} />
            </div>
          )}
        </div>
      </header>

      {status === 'connected' && p2pHealth !== 'good' && (
        <div
          className={`shrink-0 px-2 sm:px-4 py-2 flex flex-wrap items-center justify-center gap-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest border-b ${p2pHealth === 'failed' ? 'bg-rose-500/15 border-rose-500/25 text-rose-100' : 'bg-amber-500/10 border-amber-500/25 text-amber-100'
            }`}
          role="status"
        >
          <span className="text-center">{p2pHealth === 'failed' ? 'Connection lost — try below or skip' : 'Unstable network'}</span>
          <button type="button" onClick={retryIce} className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">
            Retry link
          </button>
          <button type="button" onClick={retryMediaLocal} className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">
            Refresh camera
          </button>
        </div>
      )}

      <div className="shrink-0 px-2 sm:px-3">
        <AdSlot slotKey="chat_banner" script={adScripts?.chat_banner} adsEnabled={adsEnabled} compact />
      </div>

      <main className={`flex-1 flex min-h-0 relative p-1.5 sm:p-2 gap-1.5 sm:gap-2 ${isMobile && showChat ? 'flex-col' : ''}`}>
        <div
          className={`mm-design-panel flex-1 flex min-h-0 min-w-0 relative overflow-hidden ${isMobile
            ? showChat
              ? 'h-[55%] flex-col'
              : 'flex-col'
            : 'flex-row'
            }`}
        >
          {/* PANEL 1: LOCAL */}
          <div className={`relative bg-black overflow-hidden transition-all duration-500 ${isMobile ? 'w-full flex-[0_0_42%] min-h-[168px] shrink-0 border-b border-violet-500/15' : 'flex-1 border-r border-violet-500/15'}`}>
            {status === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 z-20 bg-black/60 backdrop-blur-md">
                {cameraError && (
                  <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] uppercase font-black tracking-widest text-center">
                    {cameraError}
                  </div>
                )}
                <p className="text-white font-black uppercase tracking-[0.4em] text-[10px] mb-8 animate-pulse text-center">Start Meeting Someone</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-sm mb-10">
                  {interestTags.map(tag => (
                    <button key={tag} onClick={() => toggleInterestTag(tag)} className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${selectedInterests.includes(tag) ? 'bg-violet-600 border-violet-600 text-white shadow-lg' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}>#{tag}</button>
                  ))}
                </div>
                <button onClick={handleStart} disabled={!connected} className="px-12 py-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black uppercase tracking-widest text-xs transition-all shadow-2xl active:scale-95 shadow-violet-600/30">Start Connecting</button>
              </div>
            )}
            <video ref={localVideoRef} autoPlay muted playsInline className={`w-full h-full object-cover transition-opacity duration-300 ${facingMode === 'user' ? '-scale-x-100' : ''} ${cameraOff ? 'opacity-30' : ''}`} style={{ filter: isCreator && activeFilter !== 'none' ? activeFilter : 'none' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-4 left-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40 italic">Your Camera</span>
            </div>
            {isCreator && filterTimer > 0 && <div className="absolute top-4 left-4 px-2 py-1 rounded bg-amber-500 text-black text-[8px] font-black animate-pulse shadow-2xl uppercase">Premium: {filterTimer}s</div>}
          </div>

          {/* PANEL 2: REMOTE / SEARCHING */}
          <div className={`relative bg-realm-surface overflow-hidden ${isMobile ? 'flex-1 min-h-0 w-full border-t border-violet-500/15 sm:border-l' : 'flex-1 border-l border-violet-500/15'}`}>
            {status === 'searching' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-realm-void/95 backdrop-blur-[2px] z-50 animate-fade-in">
                <div className="absolute top-10 flex items-center gap-3 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_10px_rgba(167,139,250,0.8)]" />
                  Turbo Matching Mode
                </div>
                <div className="relative w-28 h-28 mb-8">
                  <div className="absolute inset-0 border-4 border-violet-500/10 rounded-full" />
                  <div className="absolute inset-0 border-4 border-t-violet-500 rounded-full animate-spin" />
                  <div className="absolute inset-6 border border-dashed border-violet-500/20 rounded-full animate-pulse-slow" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-black text-white/10 uppercase tracking-widest">P2P Link...</span>
                  </div>
                </div>
                <p className="text-white font-black uppercase tracking-[0.5em] text-base mb-2 animate-pulse">Accelerating Network</p>
                <div className="flex gap-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms`, boxShadow: '0 0 10px rgba(167,139,250,0.5)' }} />
                  ))}
                </div>
                <div className="mt-8 text-[10px] text-white/20 font-bold uppercase tracking-widest text-center max-w-[200px] leading-relaxed">
                  Synchronizing with global P2P nodes for immediate match.
                </div>
                <button onClick={handleStop} className="absolute bottom-12 px-10 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-rose-500/60 hover:text-rose-400 hover:bg-rose-500/10 transition-all z-[60] active:scale-95">Cancel Blast</button>
              </div>
            )}

            {status === 'connected' ? (
              <div className="relative w-full h-full animate-fade-in group">
                <SecurityShield />
                {isRecording && <RecordingIndicator />}
                <div
                  className={`h-full relative overflow-hidden ${peer?.isCreator ? 'cursor-pointer group' : 'cursor-default'}`}
                  onClick={() => peer?.isCreator && setShowProfileHandle(peer.nickname)}
                >
                  <RemoteVideoComponent stream={peer?.stream} muted={mutedStranger} strangerFilter={strangerFilter} strangerBlur={strangerBlur} />

                  {/* WATERMARKS & AI STATUS */}
                  <div className="absolute top-4 left-4 z-50 flex items-center gap-3 pointer-events-none">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_8px_#c4b5fd]" />
                    <div className="px-2 py-1 bg-black/40 backdrop-blur-md rounded border border-white/5 text-[8px] font-black text-white/30 uppercase tracking-widest italic">Safety Active</div>
                  </div>

                  <div className={`absolute z-50 pointer-events-none px-2 py-1 bg-black/20 rounded text-[8px] font-black text-white/10 uppercase tracking-widest bottom-4 right-4`}>Mana Mingle</div>

                  {peer?.isCreator && (
                    <div className="absolute inset-0 bg-violet-500/0 group-hover:bg-violet-500/10 transition-colors flex items-center justify-center pointer-events-none">
                      <span className="opacity-0 group-hover:opacity-100 bg-violet-500 text-black px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-2xl transition-all translate-y-4 group-hover:translate-y-0">Explore Creator Content</span>
                    </div>
                  )}
                </div>

                {strangerCameraOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/60 backdrop-blur-xl z-20">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">Video Hidden</span>
                  </div>
                )}

                <div className={`absolute bottom-4 px-3 py-1.5 rounded-xl bg-black/60 text-[10px] font-black uppercase tracking-widest border border-white/10 flex items-center gap-2 z-40 backdrop-blur-md left-4`}>
                  {countryToFlag(peer?.country)}
                  <span className={peer?.isCreator ? 'text-violet-400 flex items-center gap-1.5' : 'text-white'}>
                    {peer?.nickname || 'Someone'}
                    {peer?.isCreator && <BlueTick />}
                  </span>
                </div>
              </div>
            ) : (
              status !== 'searching' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/20 italic">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/5 animate-pulse">Waiting for Match...</p>
                </div>
              )
            )}

          </div>
        </div>

        {showChat && status === 'connected' && (
          <div className={`transition-all duration-300 mm-design-panel flex flex-col min-h-0 min-w-0 bg-realm-surface ${isMobile ? 'h-[45%] max-h-[50vh] w-full z-[150]' : 'static w-80 animate-slide-left'}`}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar" id="video-chat-messages">
              {messages.map((m, i) => (
                <div key={m.id || i} className={`flex flex-col group ${m.socketId === socket.id ? 'items-end' : 'items-start'}`}>
                  <VanishingMessage m={m} isMe={m.socketId === socket.id} />
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 bg-white/[0.02] border-t border-violet-500/10">
              <div className="flex gap-1.5 items-center">
                <input ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={(e) => e.key === 'Enter' && sendMsg()} className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-violet-500/50 transition-all font-medium" />
                <button onClick={sendMsg} className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-[11px] font-black uppercase shadow-lg shadow-violet-600/20 active:scale-95 transition-all">Send</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mm-design-panel-footer min-h-14 sm:min-h-16 px-1 sm:px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 bg-realm-surface/95 backdrop-blur-md flex items-center justify-between gap-1 sm:gap-4 z-[120] shrink-0">

        {/* Left Side: Stop Session */}
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          {(status === 'connected' || status === 'searching' || status === 'disconnected') && (
            <div className="flex flex-col items-center gap-0.5">
              <button type="button" onClick={handleStop} className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-lg" title="Stop">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <span className="text-[7px] uppercase tracking-tighter text-white/20 font-bold hidden sm:block">ESC / ←</span>
            </div>
          )}
        </div>

        {/* Middle: Video/Audio Controls — scroll on very narrow screens */}
        <div className="flex-1 min-w-0 flex justify-center overflow-x-auto overflow-y-hidden [scrollbar-width:thin] py-0.5">
          <div className="flex items-center gap-1 sm:gap-3 bg-violet-950/30 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-violet-500/15">
            <div className="flex flex-col items-center gap-0.5">
              <button type="button" onClick={toggleMute} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${muted ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-white/60 hover:bg-white/10'}`} title={muted ? 'Unmute' : 'Mute'}>
                {muted ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>}
              </button>
              <span className="text-[7px] text-white/10 font-bold uppercase hidden sm:block">M</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <button type="button" onClick={toggleCamera} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${cameraOff ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-white/60 hover:bg-white/10'}`} title={cameraOff ? 'Camera on' : 'Camera off'}>
                {cameraOff ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
              </button>
              <span className="text-[7px] text-white/10 font-bold uppercase hidden sm:block">V</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <button type="button" onClick={() => setCameraBlur(!cameraBlur)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${cameraBlur ? 'bg-[#1a7f37]/30 text-[#2ea043]' : 'bg-white/5 text-white/60 hover:bg-white/10'}`} title="Blur">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </button>
              <span className="text-[7px] text-white/10 font-bold uppercase hidden sm:block">B</span>
            </div>
            {status === 'connected' && (
              <>
                <div className="flex flex-col items-center gap-0.5">
                  <button type="button" onClick={() => setShowChat(!showChat)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showChat ? 'bg-violet-500/30 text-violet-400' : 'bg-white/5 text-white/60 hover:bg-white/10'}`} title="Chat">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  </button>
                  <span className="text-[7px] text-white/10 font-bold uppercase hidden sm:block">C</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <button type="button" onClick={sendWave} className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center hover:bg-amber-500/20 transition-all" title="Wave">👋</button>
                  <span className="text-[7px] text-white/10 font-bold uppercase hidden sm:block">W</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <button type="button" onClick={sendGoodVibes} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${goodVibesSent ? 'bg-rose-500 text-white' : 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'}`} title="Good Vibes">💖</button>
                  <span className="text-[7px] text-white/10 font-bold uppercase hidden sm:block">V</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="w-8 h-8 rounded-full bg-white/5 text-rose-400/80 hover:bg-rose-500/20 flex items-center justify-center border border-white/10"
                    title="Report or block"
                  >
                    🚩
                  </button>
                  <span className="text-[7px] text-white/10 font-bold uppercase hidden sm:block">R</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Side: New/Skip */}
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          {isCreator && status === 'connected' && (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-white/5 border border-white/10 text-white/40 hover:text-white'}`}
              title={isRecording ? 'Stop Recording' : 'Start Creator Production'}
            >
              <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-white' : 'bg-rose-500'}`} />
            </button>
          )}
          <div className="flex flex-col items-center gap-0.5">
            <button type="button" onClick={handleSkip} className="relative px-3 sm:px-6 py-1.5 sm:py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-widest text-[9px] sm:text-[10px] transition-all active:scale-95 shadow-xl shadow-violet-500/20 whitespace-nowrap" aria-label="Skip">
              {status === 'searching' ? 'Cancel' : (
                <>
                  <span className="sm:hidden">Next</span>
                  <span className="hidden sm:inline">Next User</span>
                </>
              )}
            </button>
            <span className="text-[7px] uppercase tracking-tighter text-white/20 font-bold hidden sm:block">SPACE / →</span>
          </div>
        </div>
      </footer>

      <ReportSafetyModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={submitSafetyReport}
        title="Report (anonymous)"
      />

      {toast && (
        <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] sm:bottom-20 left-1/2 -translate-x-1/2 z-[200] max-w-[min(92vw,24rem)] px-4 py-2 rounded-lg bg-realm-surface/95 border border-violet-500/20 text-sm text-white shadow-xl shadow-violet-950/40 animate-fade-in text-center">
          {toast}
        </div>
      )}

      {active3dEmoji && (
        <div className="pointer-events-none fixed inset-0 z-[300] flex items-center justify-center overflow-hidden bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 animate-3d-emoji-pop">
            <picture className="drop-shadow-[0_0_80px_rgba(255,255,255,0.3)]">
              <source srcSet={active3dEmoji.emoji?.url} type="image/webp" />
              <img src={active3dEmoji.emoji?.url} className="w-[180px] h-[180px] sm:w-[300px] sm:h-[300px]" alt="3D reaction" />
            </picture>
            <div className="bg-amber-500/90 text-black px-6 py-2 rounded-full font-black text-sm uppercase tracking-widest shadow-2xl">
              {active3dEmoji.nickname || 'Someone'} sent a reaction!
            </div>
          </div>
        </div>
      )}

      {isCreator && showEmojiPicker && (
        <div className="fixed bottom-24 right-4 sm:right-0 sm:mr-4 z-[150] p-4 rounded-2xl bg-realm-surface border border-violet-500/15 shadow-2xl shadow-violet-950/30 shrink-0 w-[300px] animate-fade-in-up">
          <div className="flex items-center justify-between mb-3 border-b border-violet-500/10 pb-2">
            <h3 className="text-xs font-black uppercase text-amber-500 tracking-wider">Big Emojis</h3>
            <span className="text-[10px] font-bold text-white/50 bg-black/40 px-2 py-0.5 rounded">5 Coins</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {EMOJIS_3D.map(e => (
              <button key={e.char} onClick={() => send3dEmoji(e)} className="aspect-square rounded-xl bg-white/5 hover:bg-amber-500/20 hover:scale-110 flex flex-col items-center justify-center text-2xl transition-all border border-transparent hover:border-amber-500/30 group">
                <span className="group-hover:animate-bounce">{e.char}</span>
                <span className="text-[8px] text-white/30 group-hover:text-amber-500/80 mt-1 uppercase font-bold">{e.label || 'Send'}</span>
              </button>
            ))}
          </div>
          {coins < 5 && <div className="mt-3 text-[10px] text-center text-rose-400 font-medium bg-rose-500/10 py-1 rounded">Not enough coins!</div>}
        </div>
      )}
      {/* Coin History Modal */}
      {showCoinHistory && (
        <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-realm-surface border border-violet-500/15 rounded-2xl p-6 shadow-2xl shadow-violet-950/25 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-4 border-b border-violet-500/10 pb-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-amber-500">🪙 Coin History</h3>
              <button onClick={() => setShowCoinHistory(false)} className="text-white/40 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-2">
              {(history || []).length === 0 ? (
                <p className="text-center text-xs text-white/40 my-8">No transaction history yet.</p>
              ) : (
                (history || []).map((h) => (
                  <div key={h.id} className="flex justify-between items-center p-3 rounded-xl bg-white/5">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white/90">{h.reason}</span>
                      <span className="text-[10px] text-white/40">{new Date(h.date).toLocaleString()}</span>
                    </div>
                    <span className={`text-sm font-bold ${h.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {h.amount > 0 ? '+' : ''}{h.amount}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Premium Video Filters Modal */}
      {isCreator && showFilterMenu && (
        <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-[280px] bg-realm-surface border border-violet-500/15 rounded-2xl p-6 shadow-2xl shadow-violet-950/25 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-violet-500/10 pb-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-violet-400 flex items-center gap-2"><span className="text-amber-500">🪙</span> Simple Filters</h3>
              <button onClick={() => setShowFilterMenu(false)} className="text-white/40 hover:text-white">✕</button>
            </div>
            <p className="text-[10px] text-white/40 text-center leading-relaxed">
              Effects cost <strong className="text-amber-500">15 coins</strong> for 1 minute. Normal filters are always free.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {VIDEO_FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => handleFilterSelect(f.id)}
                  className={`py-3 rounded-xl border text-xs font-bold transition-all ${activeFilter === f.id ? 'bg-violet-500 border-violet-500 text-white shadow-lg' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showProfileHandle && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-fade-in" onClick={() => setShowProfileHandle(null)} />
          <div className="relative animate-in-zoom">
            <CreatorProfilePopup handle={showProfileHandle} onClose={() => setShowProfileHandle(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function RemoteVideoComponent({ stream, muted, strangerFilter, strangerBlur }) {
  const ref = useRef(null);
  const playbackRetryRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const el = ref.current;
    if (!el || !stream) return;

    el.srcObject = stream;

    const playVideo = async () => {
      try {
        if (el.paused && stream?.active) {
          await el.play();
        }
      } catch (e) {
        // Fallback for browsers that block autoplay
        const retry = () => {
          if (playbackRetryRef.current) clearTimeout(playbackRetryRef.current);
          if (!isMountedRef.current) return;
          if (el) {
            el.play().catch(() => {
              playbackRetryRef.current = setTimeout(retry, 2000);
            });
          } else {
            playbackRetryRef.current = setTimeout(retry, 1000);
          }
        };
        retry();
      }
    };
    playVideo();

    // Forced-play listeners for stalled/waiting streams
    const handleActive = () => { if (el.paused) el.play().catch(() => { }); };
    el.addEventListener('stalled', handleActive);
    el.addEventListener('waiting', handleActive);
    el.addEventListener('canplay', handleActive);

    return () => {
      isMountedRef.current = false;
      if (playbackRetryRef.current) clearTimeout(playbackRetryRef.current);
      el.removeEventListener('stalled', handleActive);
      el.removeEventListener('waiting', handleActive);
      el.removeEventListener('canplay', handleActive);
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className="absolute inset-0 w-full h-full object-cover -scale-x-100 transition-all duration-300"
      style={{
        backgroundColor: '#000',
        filter: strangerBlur && strangerFilter === 'none' ? 'blur(20px)' : (strangerFilter !== 'none' ? strangerFilter : 'none'),
        willChange: 'transform, opacity' // Hardware acceleration
      }}
    />
  );
}
