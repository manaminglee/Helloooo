/**
 * VideoChat – 1:1 anonymous video chat with WebRTC
 * Full Omegle-style: searching→matched→skip
 * Layout: remote video (main) | local video (pip) | side chat
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { countryToFlag } from '../utils/countryFlag';
import { CountryFlag } from './CountryFlag';
import { VideoLogoPlaceholder, VideoWatermark } from './VideoPanelChrome';
import { CreatorProfilePopup } from './CreatorProfilePopup';
import { HellooooBrand } from './HellooooBrand';
import { AdSlot } from './AdSlot';
import { API_BASE } from '../config/apiBase';
import { nextMsgId } from '../utils/uniqueId';

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
import { playConnectSound, playMessageSound, playDisconnectSound, playWaveSound, playMatch } from '../utils/sounds';
import { getPrefs } from '../utils/userPrefs';
import { SettingsPanel, SettingsGearButton } from './SettingsPanel';
import { mmDebug } from '../utils/mmDebug';
import { attachStreamToVideo, hasLiveRemoteVideo, mergeTrackIntoStream } from '../utils/webrtcMedia';
import { ChatInputWithEmoji } from './ChatInputWithEmoji';
import { PHASE_2, PHASE_3_PRO, PHASE_4_UNIQUE } from '../constants/features';
import { useUniqueSession } from '../hooks/useUniqueSession';
import { useAdminMonitorFrames } from '../hooks/useAdminMonitorFrames';
import {
  AiStatusPill,
  CalmModeToggle,
  CoOpStreakBadge,
  ConsentSessionGate,
  DataSaverHud,
  LiveCaptionsBar,
  LiveCaptionsPanel,
  TrustScoreChip,
} from './unique/UniqueSessionUI';
import { MiniChatGamePanel } from './MiniChatGamePanel';
import {
  AudioOnlyFallback,
  ConnectionQualityBadge,
  ConversationRatingModal,
  DevicePickerSheet,
  FloatingVideoReactions,
  StrangerRevealOverlay,
  TipCreatorModal,
  useChatSwipeCollapse,
  VideoMoreSheet,
  VideoReactionBar,
  VideoSessionBanners,
} from './VideoSessionUI';

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

const MESSAGE_TTL_SEC = 90;

const VIDEO_FILTERS = [
  { id: 'none', label: 'Normal' },
  { id: 'grayscale(100%)', label: 'Noir (B&W)' },
  { id: 'sepia(80%)', label: 'Vintage (Sepia)' },
  { id: 'hue-rotate(90deg)', label: 'Alien (Hue)' },
  { id: 'invert(100%)', label: 'Negative' },
  { id: 'contrast(150%) brightness(120%)', label: 'Intense' },
];

function chatMessageCountry(m, isMe, myCountry, peerCountry) {
  if (m?.country) return m.country;
  return isMe ? myCountry : peerCountry;
}

function useMessageTtl(m) {
  const [timeLeft, setTimeLeft] = useState(MESSAGE_TTL_SEC);

  useEffect(() => {
    if (m.system) return;
    const age = Math.floor((Date.now() - (m.ts || Date.now())) / 1000);
    const rem = Math.max(0, MESSAGE_TTL_SEC - age);
    setTimeLeft(rem);
    if (rem <= 0) return;
    const int = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(int);
  }, [m.ts, m.system]);

  return timeLeft;
}

function CreatorIntroChatCard({ m, onViewCreator }) {
  if (!m?.isIntro || !m?.creatorHandle) return null;
  return (
    <div className="flex justify-center my-3 px-1">
      <div className="w-full max-w-md rounded-2xl border border-violet-500/35 bg-gradient-to-br from-violet-500/15 to-indigo-500/5 p-4 text-center shadow-lg shadow-violet-950/30">
        <div className="flex items-center justify-center gap-2 mb-2">
          <BlueTick />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Creator connected</span>
        </div>
        <p className="text-sm text-white/85 leading-relaxed mb-3">{m.text}</p>
        <button
          type="button"
          onClick={() => onViewCreator?.(m.creatorHandle)}
          className="w-full py-2.5 rounded-xl bg-violet-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all"
        >
          View @{m.creatorHandle} profile
        </button>
      </div>
    </div>
  );
}

function MobChatBubble({ m, isMe, myCountry, peerCountry, onViewCreator }) {
  const timeLeft = useMessageTtl(m);

  if (m.isIntro && m.creatorHandle) {
    return <CreatorIntroChatCard m={m} onViewCreator={onViewCreator} />;
  }

  if (m.system) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-white/35 font-medium">{m.text}</span>
      </div>
    );
  }
  if (m.type === 'voice' || m.media) {
    return <VanishingMessage m={m} isMe={isMe} country={chatMessageCountry(m, isMe, myCountry, peerCountry)} />;
  }
  if (timeLeft <= 0) return null;
  const time = m.ts
    ? new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  const flag = countryToFlag(chatMessageCountry(m, isMe, myCountry, peerCountry));
  const ttlLabel = `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`;
  return (
    <div className={`mm-mobile-bubble-row ${isMe ? 'mm-mobile-bubble-row--me' : ''}`}>
      {!isMe && flag && <span className="mm-chat-flag" title="Stranger's region">{flag}</span>}
      <div className={`mm-mobile-bubble ${isMe ? 'mm-mobile-bubble--me' : 'mm-mobile-bubble--them'}`}>
        <p className="mm-mobile-bubble__text">{m.text}</p>
        <span className="mm-mobile-bubble__meta">
          {isMe && flag && <span className="mm-chat-flag mm-chat-flag--inline" title="Your region">{flag}</span>}
          {time}
          <span className={`mm-desk-bubble__ttl ${timeLeft <= 10 ? 'mm-desk-bubble__ttl--warn' : ''}`}>{ttlLabel}</span>
          {isMe && <span className="mm-mobile-bubble__read" aria-hidden> ✓✓</span>}
        </span>
      </div>
    </div>
  );
}

function MobSignalBars({ quality }) {
  const level = quality === 'good' ? 4 : quality === 'fair' ? 3 : quality === 'poor' ? 2 : 1;
  return (
    <div className="mm-mobile-pip__signal" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={i <= level ? 'mm-mobile-pip__signal-bar mm-mobile-pip__signal-bar--on' : 'mm-mobile-pip__signal-bar'} />
      ))}
    </div>
  );
}

function DeskChatBubble({ m, isMe, myCountry, peerCountry, onViewCreator }) {
  const timeLeft = useMessageTtl(m);

  if (m.isIntro && m.creatorHandle) {
    return <CreatorIntroChatCard m={m} onViewCreator={onViewCreator} />;
  }

  if (m.system) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-white/35 font-medium">{m.text}</span>
      </div>
    );
  }
  if (m.type === 'voice' || m.media) {
    return <VanishingMessage m={m} isMe={isMe} country={chatMessageCountry(m, isMe, myCountry, peerCountry)} />;
  }
  if (timeLeft <= 0) return null;
  const time = m.ts
    ? new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  const flag = countryToFlag(chatMessageCountry(m, isMe, myCountry, peerCountry));
  const ttlLabel = `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`;
  return (
    <div className={`mm-desk-bubble-row ${isMe ? 'mm-desk-bubble-row--me' : ''}`}>
      {!isMe && flag && <span className="mm-chat-flag" title="Stranger's region">{flag}</span>}
      <div className={`mm-desk-bubble ${isMe ? 'mm-desk-bubble--me' : 'mm-desk-bubble--them'} ${m.isCreator ? 'ring-1 ring-violet-500/30' : ''}`}>
        {m.isCreator && !isMe && (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-violet-300">@{m.nickname}</span>
            <BlueTick />
          </div>
        )}
        <p className="mm-desk-bubble__text">{m.text}</p>
        <span className="mm-desk-bubble__meta">
          {isMe && flag && <span className="mm-chat-flag mm-chat-flag--inline" title="Your region">{flag}</span>}
          {time}
          <span className={`mm-desk-bubble__ttl ${timeLeft <= 10 ? 'mm-desk-bubble__ttl--warn' : ''}`}>{ttlLabel}</span>
          {isMe && <span className="mm-desk-bubble__read" aria-hidden> ✓✓</span>}
        </span>
      </div>
    </div>
  );
}

function VanishingMessage({ m, isMe, country: countryCode }) {
  const timeLeft = useMessageTtl(m);

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
            {countryCode && (
              <span className="mm-chat-flag mm-chat-flag--inline text-sm leading-none" title="Region">{countryToFlag(countryCode)}</span>
            )}
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
          {m.type === 'voice' ? (
            <audio controls src={m.audio || m.text} className="max-w-[200px] w-full" />
          ) : (
            <p className="break-words leading-relaxed whitespace-pre-wrap">{m.text}</p>
          )}
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

export default function VideoChat({ socket, connected, country, onlineCount, interest = 'general', nickname = 'Anonymous', isCreator = false, adsEnabled = false, adScripts = {}, onBack, onJoined, onFindNewPartner, coinState, registered = false, currentActiveSeconds = 0, conversationMode = 'free', topicContract = 'chill', calmMode: calmModeProp = false, isPro = false, subscription = null }) {
  const [coins, setCoins] = useState(coinState?.balance || 0);
  const [showProfileHandle, setShowProfileHandle] = useState(null);

  useEffect(() => {
    if (coinState?.balance !== undefined) setCoins(coinState.balance);
  }, [coinState?.balance]);
  const { balance, streak, canClaim, nextClaim, claimCoins, history, addHistory } = coinState || {};
  const { iceServers, loading: iceLoading } = useIceServers();
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
  const [localMirrored, setLocalMirrored] = useState(true);
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const latency = useLatency(); // coarse fallback only until real RTC stats arrive
  const [rtcLatency, setRtcLatency] = useState(null); // real RTT (ms) from RTCPeerConnection.getStats()
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isTranslatorActive, setIsTranslatorActive] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [active3dEmoji, setActive3dEmoji] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [toast, setToast] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [activeFilter, setActiveFilter] = useState('none');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showCoinHistory, setShowCoinHistory] = useState(false);
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
  const userLeftTimerRef = useRef(null);
  const partnerLeftTimerRef = useRef(null);
  const remoteStageRef = useRef(null);
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
  const negotiationRetryRef = useRef(null);
  const findPartnerEmittedRef = useRef(false);
  const peerInfoRef = useRef(new Map());
  const chatEndRef = useRef(null);
  const chatPanelRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const bindLocalVideo = useCallback((el) => {
    localVideoRef.current = el;
    if (el && localStreamRef.current) {
      attachStreamToVideo(el, localStreamRef.current);
    }
  }, []);

  useAdminMonitorFrames(socket, {
    active: status === 'connected' && !!roomId,
    roomId,
    mode: 'video',
    localVideoRef,
  });

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const isConnected = !!peer && !!roomId;

  // Real RTT from the active RTCPeerConnection (mirrors GroupVideoRoom's getStats loop)
  useEffect(() => {
    if (!isConnected || !peer?.socketId) {
      setRtcLatency(null);
      return;
    }
    let cancelled = false;
    const measure = async () => {
      const pc = peerConnectionsRef.current.get(peer.socketId) || pcRef.current;
      if (!pc || pc.signalingState === 'closed') return;
      try {
        const stats = await pc.getStats();
        let rtt = null;
        for (const r of stats.values()) {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.currentRoundTripTime ?? r.roundTripTime) != null) {
            const v = (r.currentRoundTripTime ?? r.roundTripTime) * 1000;
            if (rtt == null || v < rtt) rtt = v;
          }
        }
        if (!cancelled && rtt != null) setRtcLatency(Math.round(rtt));
      } catch { /* keep last reading */ }
    };
    measure();
    const interval = setInterval(measure, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isConnected, peer?.socketId]);

  const effectiveLatency = rtcLatency ?? latency;

  const connectionQuality = effectiveLatency == null
    ? 'unknown'
    : effectiveLatency < 120
      ? 'good'
      : effectiveLatency < 260
        ? 'ok'
        : 'poor';

  useChatSwipeCollapse(chatPanelRef, () => isMobile && setChatCollapsed(true));

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const el = document.getElementById('video-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (showChat && !chatCollapsed) setChatUnread(0);
  }, [showChat, chatCollapsed]);

  const cyclePipCorner = () => {
    const pos = ['tr', 'tl', 'bl', 'br'];
    setPipPos(pos[(pos.indexOf(pipPos) + 1) % pos.length]);
  };

  const cyclePipSize = () => {
    setPipSize((s) => (s === 'sm' ? 'md' : s === 'md' ? 'lg' : 'sm'));
  };

  const cycleBandwidth = () => {
    if (autoBandwidth) {
      setAutoBandwidth(false);
      setLowBandwidth(true);
    } else if (lowBandwidth) {
      setLowBandwidth(false);
    } else {
      setAutoBandwidth(true);
    }
  };

  const maybeShowRating = useCallback(() => {
    const hadChat = messages.filter((m) => !m.system).length > 0;
    if ((hadChat || connectedSecsRef.current > 15) && !ratingDone) setShowRating(true);
  }, [messages, ratingDone]);

  const handleRateConversation = (rating) => {
    socket?.emit('rate-conversation', { rating, roomId: roomIdRef.current });
    submitRating(rating);
  };

  const generateAiSpark = async (presetText, sendNow) => {
    if (isAiGenerating) return;
    setIsAiGenerating(true);
    try {
      if (presetText) {
        setInput(presetText);
        if (sendNow) {
          const t = presetText.trim();
          if (t && socket && roomIdRef.current) {
            socket.emit('send-message', { roomId: roomIdRef.current, text: t });
          }
        }
        return;
      }
      const res = await fetch(`${API_BASE}/api/ai/spark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest: selectedInterests.join(',') || interest || 'general' }),
      });
      if (res.ok) {
        const data = await res.json();
        setInput(data.spark || '');
      }
    } catch { /* ignore */ } finally {
      setIsAiGenerating(false);
    }
  };

  const sendVideoReaction = (emoji) => {
    if (!socket || !roomIdRef.current) return;
    socket.emit('room-reaction', { roomId: roomIdRef.current, emoji });
    const id = Math.random().toString(36).slice(2, 9);
    setLocalReactions((prev) => [...prev.slice(-12), { id, emoji, x: 15 + Math.random() * 70, y: 55 + Math.random() * 25 }]);
    setTimeout(() => setLocalReactions((prev) => prev.filter((r) => r.id !== id)), 3500);
  };

  const startScreenShare = async () => {
    if (isScreenSharing) {
      setIsScreenSharing(false);
      await retryMediaLocal();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(track);
      });
      setIsScreenSharing(true);
      track.onended = () => {
        setIsScreenSharing(false);
        retryMediaLocal();
      };
      setToast('Screen sharing active');
    } catch {
      setToast('Could not share screen');
    }
  };

  const sendTip = (amount) => {
    if (!socket || !roomIdRef.current || !peer?.socketId || balance < amount) return;
    socket.emit('tip-creator', { roomId: roomIdRef.current, targetSocketId: peer.socketId, amount });
    setToast(`Sent ${amount} coins to ${peer.nickname || 'creator'}!`);
  };

  const dismissSafetyNudge = () => {
    sessionStorage.setItem('mm_video_safety_seen', '1');
    setShowSafetyNudge(false);
  };

  const revealStranger = () => {
    setStrangerBlur(false);
    setShowStrangerReveal(false);
  };

  const emitRecordingStatus = (recording) => {
    if (socket && roomIdRef.current) {
      socket.emit('peer-recording-status', { roomId: roomIdRef.current, recording });
    }
  };

  const saveHighlightClip = () => {
    if (!localStream || !peer?.stream) return;
    setToast('Recording 30s highlight…');
    startRecording();
    setTimeout(() => stopRecording(), 30000);
  };

  const [pipPos, setPipPos] = useState('tr');
  const [pipSize, setPipSize] = useState('md');
  const [pipHidden, setPipHidden] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showStayConnected, setShowStayConnected] = useState(false);
  const [localReactions, setLocalReactions] = useState([]);
  const [peerRecording, setPeerRecording] = useState(false);
  const [autoStrangerBlur, setAutoStrangerBlur] = useState(() => localStorage.getItem('mm_auto_stranger_blur') !== '0');
  const [showStrangerReveal, setShowStrangerReveal] = useState(false);
  const [showSafetyNudge, setShowSafetyNudge] = useState(() => !sessionStorage.getItem('mm_video_safety_seen'));
  const [chatUnread, setChatUnread] = useState(0);
  const [ultraLow, setUltraLow] = useState(false);
  const [calmMode, setCalmMode] = useState(calmModeProp);

  const unique = useUniqueSession({
    socket,
    roomId,
    status,
    messages,
    interest,
    conversationMode,
    topicContract,
    calmMode,
  });

  useEffect(() => {
    if (unique.consentComplete) {
      setStrangerBlur(false);
      setShowStrangerReveal(false);
    }
  }, [unique.consentComplete]);

  const desktopLayout = !isMobile;
  const [deskLayoutMode, setDeskLayoutMode] = useState(() => {
    try {
      return sessionStorage.getItem('mm_video_desk_layout') === 'sidebar' ? 'sidebar' : 'horizontal';
    } catch {
      return 'horizontal';
    }
  });
  const isSidebarDesk = deskLayoutMode === 'sidebar';

  const setDeskLayout = (mode) => {
    setDeskLayoutMode(mode);
    try {
      sessionStorage.setItem('mm_video_desk_layout', mode);
    } catch { /* ignore */ }
  };

  // Re-bind local camera after layout swap so the panel never goes black
  useEffect(() => {
    if (!desktopLayout) return;
    const el = localVideoRef.current;
    const stream = localStreamRef.current;
    if (el && stream) attachStreamToVideo(el, stream);
  }, [deskLayoutMode, desktopLayout]);

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

  const formatTimerLong = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
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
    const onGoodVibesMatch = () => {
      setGoodVibesMatch(true);
      setShowStayConnected(true);
      setToast('🤝 Both of you gave Good Vibes! Great conversation!');
      playConnectSound();
    };
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
    setToast(`Thanks for rating! ${'⭐'.repeat(stars)} — Your feedback helps improve Helloooo 👋.`);
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
        // Honor the user's camera quality preference on initial acquisition
        const quality = getPrefs().videoQuality;
        const qualityConstraints =
          quality === 'low'
            ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } }
            : quality === 'hd'
              ? { width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
        const baseConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            ...qualityConstraints,
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
        setAudioOnly(false);
        setMicBlocked(false);
        setCameraError(null);
        if (localVideoRef.current) attachStreamToVideo(localVideoRef.current, s);
      } catch (err) {
        mmDebug('camera.error', err);
        setAudioOnly(false);
        setCameraError('We could not access your camera or microphone. Please allow permissions and try again.');
      }
    })();
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => { t.stop(); t.enabled = false; });
        localStreamRef.current = null;
      } else if (s) {
        s.getTracks().forEach((t) => { t.stop(); t.enabled = false; });
      }
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
        mmDebug('enumerateDevices', e);
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
      const vs = senders.find((s) => s.track?.kind === 'video');
      const as = senders.find((s) => s.track?.kind === 'audio');

      if (!vs && vt) {
        try { pc.addTrack(vt, localStream); } catch { /* already negotiating */ }
      } else if (vs && vt) {
        vs.replaceTrack(vt).catch(() => { });
      }
      if (!as && at) {
        try { pc.addTrack(at, localStream); } catch { /* ignore */ }
      } else if (as && at) {
        as.replaceTrack(at).catch(() => { });
      }
    });
  }, [localStream]);

  useEffect(() => {
    if (!localStream) return;
    const vt = localStream.getVideoTracks()[0];
    if (!vt) return;
    const targetLow = lowBandwidth || (autoBandwidth && effectiveLatency != null && effectiveLatency > 260);
    const c = targetLow ? { width: 640, height: 480, frameRate: 15 } : { width: 1280, height: 720 };
    vt.applyConstraints(c).catch(() => { });
  }, [lowBandwidth, autoBandwidth, effectiveLatency, localStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      attachStreamToVideo(localVideoRef.current, localStream);
    }
  }, [localStream, status]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !peer?.stream) return;
    el.srcObject = peer.stream;
    el.volume = remoteVolume;
    el.play?.().catch(() => { });
  }, [peer?.stream, remoteVolume]);

  const clearRoom = useCallback(() => {
    if (healthTimerRef.current) clearTimeout(healthTimerRef.current);
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    pendingOfferRef.current = null;
    pendingAnswerRef.current = null;
    findPartnerEmittedRef.current = false;
    if (negotiationRetryRef.current) {
      clearTimeout(negotiationRetryRef.current);
      negotiationRetryRef.current = null;
    }
    peerInfoRef.current.clear();
    setPeer(null);
    setRoomId(null);
    setMessages([]);
    roomIdRef.current = null;
    setP2pHealth('good');
  }, []);

  const releaseAllMedia = useCallback(() => {
    const stopStream = (stream) => {
      if (!stream) return;
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
          t.enabled = false;
        } catch { /* ignore */ }
      });
    };
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    peerConnectionsRef.current.forEach((pc) => {
      try { pc.close(); } catch { /* ignore */ }
    });
    peerConnectionsRef.current.clear();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    setIsScreenSharing(false);
  }, []);

  const handleStart = () => {
    if (!socket || !connected) return;
    if (getPrefs().notifyBrowser) void ensureNotifyPermission();
    clearRoom();
    findPartnerEmittedRef.current = false;
    setStatus('searching');
  };

  const saveSessionVibe = useCallback(async () => {
    if (connectedSecsRef.current < 20) return;
    try {
      const res = await fetch(`${API_BASE}/api/vibe/session-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ topics: selectedInterests, durationSec: connectedSecsRef.current }),
      });
      const data = await res.json();
      if (data?.summary) {
        await fetch(`${API_BASE}/api/vibe/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tags: String(data.summary).split(/\s+/).filter(Boolean).slice(0, 6) }),
        });
      }
    } catch { /* offline */ }
  }, [selectedInterests]);

  const handleSkip = useCallback(() => {
    if (statusRef.current === 'connected') saveSessionVibe();
    maybeShowRating();
    if (statusRef.current === 'connected' && connectedSecsRef.current >= 3 && selectedInterests.length > 0) {
      setToast(`Anonymous session ended (~${connectedSecsRef.current}s). Topics: ${selectedInterests.join(', ')} — not stored on our servers.`);
    }
    if (socket) {
      if (roomIdRef.current) socket.emit('leave-room', { roomId: roomIdRef.current });
      else socket.emit('cancel-find-partner');
    }
    clearRoom();
    findPartnerEmittedRef.current = false;
    setStatus('searching');
    setGoodVibesSent(false); setGoodVibesMatch(false); setCameraBlur(false);
    setStrangerFilter('none'); setStrangerBlur(false);
    // Single find-partner emit: the auto-emit effect fires once status is 'searching'
  }, [socket, interest, status, clearRoom, selectedInterests, maybeShowRating, saveSessionVibe]);

  const handleStop = useCallback(() => {
    if (statusRef.current === 'connected') saveSessionVibe();
    maybeShowRating();
    if (statusRef.current === 'connected' && connectedSecsRef.current >= 3 && selectedInterests.length > 0) {
      setToast(`Anonymous session ended (~${connectedSecsRef.current}s). Topics: ${selectedInterests.join(', ')} — not stored on our servers.`);
    }
    releaseAllMedia();
    if (roomIdRef.current && socket) socket.emit('leave-room', { roomId: roomIdRef.current });
    socket?.emit('cancel-find-partner');
    clearRoom();
    setStatus('idle');
    setGoodVibesSent(false); setGoodVibesMatch(false); setCameraBlur(false);
    setStrangerFilter('none'); setStrangerBlur(false);
  }, [socket, clearRoom, selectedInterests, maybeShowRating, saveSessionVibe, releaseAllMedia]);

  const handleBack = () => { handleStop(); onBack?.(); };

  const submitSafetyReport = ({ reason, block }) => {
    const targetId = peer?.socketId;
    if (socket && roomIdRef.current) {
      socket.emit('report-user', {
        roomId: roomIdRef.current,
        reason: String(reason || 'unspecified'),
        ...(targetId ? { targetSocketId: targetId } : {}),
      });
      if (block && targetId) {
        socket.emit('block-user', { targetSocketId: targetId });
        setToast('User blocked — skipping to next match');
        setTimeout(() => handleSkip(), 400);
      }
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
        if (vs) vs.replaceTrack(stream.getVideoTracks()[0]).catch(e => mmDebug('switchCam', e));
      });
      setToast(`📷 Switched to ${nextMode === 'user' ? 'Front' : 'Back'} Camera`);
    } catch (e) {
      // Fallback for devices with only one camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
  };

  const toggleFlip = () => {
    if (isMobile) toggleFacingMode();
    else setLocalMirrored((v) => !v);
  };

  const mirrorLocalVideo = isMobile ? facingMode === 'user' : localMirrored;

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

  const continueAudioOnly = useCallback(async () => {
    // Camera denied — fall back to mic-only so matching can proceed
    setMicBlocked(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = stream;
      setLocalStream(stream);
      setAudioOnly(true);
      setCameraError(null);
      setCameraOff(true);
      setToast('🎙️ Camera unavailable — continuing in audio-only mode');
    } catch (e) {
      mmDebug('audioOnly.err', e);
      setMicBlocked(true);
      setCameraError('Camera and microphone are both unavailable. Grant permissions and retry.');
    }
  }, []);

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
      setMicBlocked(false);
      setAudioOnly(!stream.getVideoTracks().length);
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
      setToast('Chat ended — press Esc twice quickly to find someone new');
    } else {
      handleBack();
    }
  }, [status, handleStop, handleBack]);

  const escTimerRef = useRef(null);
  const escArmedRef = useRef(false);

  const handleEscapeKey = useCallback(() => {
    if (escArmedRef.current) {
      clearTimeout(escTimerRef.current);
      escArmedRef.current = false;
      if (status === 'connected') {
        handleSkip();
        setToast('Skipping — finding a new stranger…');
      } else if (status === 'idle' || status === 'disconnected') {
        handleStart();
        setToast('Searching for someone new…');
      } else if (status === 'searching') {
        handleSkip();
        setToast('Finding a new match…');
      }
      return;
    }

    escArmedRef.current = true;
    escTimerRef.current = setTimeout(() => {
      escArmedRef.current = false;
      handleEsc();
    }, 320);
  }, [status, handleEsc, handleSkip, handleStart, handleStop]);

  useEffect(() => () => clearTimeout(escTimerRef.current), []);

  useEffect(() => {
    const handleDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (status === 'connected') {
          handleSkip();
          setToast('Skipping — finding a new stranger…');
        } else if (status === 'searching') {
          handleSkip();
          setToast('Finding a new match…');
        }
        return;
      }
      if (e.key === 'Enter' && status === 'idle') {
        e.preventDefault();
        handleStart();
        setToast('Searching for someone new…');
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        handleEscapeKey();
        return;
      }
      if (e.key === 'ArrowLeft') {
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
  }, [handleSkip, handleStop, toggleMute, toggleCamera, handleStart, handleEsc, handleEscapeKey, status]);

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
    if (status === 'connected') {
      setTimeout(() => inputRef.current?.focus(), 500);
      setToast('✅ Connected with a stranger!');
      setMessages(prev => [...prev, { id: nextMsgId('sys'), system: true, text: `Connected to a stranger from ${peer?.country || 'the network'}` }]);
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
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    }
    // Ensure both m-lines exist so negotiation works in audio-only / no-stream cases
    if (!stream || stream.getVideoTracks().length === 0) {
      pc.addTransceiver('video', { direction: 'recvonly' });
    }
    if (!stream || stream.getAudioTracks().length === 0) {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (e) => {
      const rid = roomIdRef.current;
      if (e.candidate && socket && rid) {
        socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'ice-candidate', signal: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const info = peerInfoRef.current.get(remoteId) || {};
      const track = e.track;
      if (!track) return;

      setPeer((prev) => {
        const base = prev?.socketId === remoteId ? prev.stream : null;
        const stream = mergeTrackIntoStream(base, track);
        return {
          socketId: remoteId,
          stream,
          nickname: info.nickname || prev?.nickname,
          country: info.country || prev?.country,
          isCreator: typeof info.isCreator === 'boolean' ? info.isCreator : prev?.isCreator,
        };
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
        setP2pHealth('unstable');
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
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'offer', signal: pc.localDescription });
      mmDebug('offer', remoteId, pc.signalingState);
    } catch (err) {
      mmDebug('offer.err', err);
      pendingOfferRef.current = remoteId;
    } finally {
      makingOffer.current = false;
    }
  }, [socket, createPeerConnection]);

  const doAnswer = useCallback(async (remoteId, offer) => {
    if (!socket) return;
    const rid = roomIdRef.current;
    if (!rid) {
      pendingAnswerRef.current = { from: remoteId, signal: offer };
      return;
    }
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
      mmDebug('negotiation.err', err);
      pendingAnswerRef.current = { from: remoteId, signal: offer };
    }
  }, [socket, createPeerConnection]);

  useEffect(() => {
    if (!localStream || !roomIdRef.current) return;
    const po = pendingOfferRef.current;
    if (po && peer?.socketId === po) {
      pendingOfferRef.current = null;
      doOffer(po);
    }
    const pa = pendingAnswerRef.current;
    if (pa) {
      pendingAnswerRef.current = null;
      doAnswer(pa.from, pa.signal);
    }
  }, [localStream, peer?.socketId, doOffer, doAnswer]);

  // Wait for camera + ICE servers before matching (prevents black-screen negotiations).
  useEffect(() => {
    if (!socket || !connected || status !== 'searching' || roomIdRef.current || iceLoading) return;
    if (!localStreamRef.current) return;
    if (findPartnerEmittedRef.current) return;
    findPartnerEmittedRef.current = true;
    let creatorToken = '';
    try {
      creatorToken = window.localStorage.getItem('mm_creatorId') || '';
    } catch { /* ignore */ }
    socket.emit('find-partner', {
      mode: 'video',
      interest: interest || 'general',
      nickname: nickname || 'Anonymous',
      conversationMode,
      topicContract,
      creatorToken: isCreator || creatorToken ? creatorToken : undefined,
    });
  }, [socket, connected, status, localStream, iceLoading, interest, nickname, conversationMode, topicContract, isCreator]);

  // Auto-recover if connected but remote video never arrives.
  useEffect(() => {
    if (status !== 'connected' || !peer?.socketId) {
      if (negotiationRetryRef.current) {
        clearTimeout(negotiationRetryRef.current);
        negotiationRetryRef.current = null;
      }
      return;
    }
    negotiationRetryRef.current = setTimeout(() => {
      if (hasLiveRemoteVideo(peer?.stream)) return;
      mmDebug('negotiationRetry', peer.socketId);
      retryIce();
    }, 7000);
    return () => {
      if (negotiationRetryRef.current) {
        clearTimeout(negotiationRetryRef.current);
        negotiationRetryRef.current = null;
      }
    };
  }, [status, peer?.socketId, peer?.stream, retryIce]);

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
        } else {
          const pa = pendingAnswerRef.current;
          if (pa?.from === p.socketId && localStreamRef.current) {
            pendingAnswerRef.current = null;
            doAnswer(pa.from, pa.signal);
          }
        }
      }
      setStatus('connected');
      setP2pHealth('good');
      setGoodVibesSent(false);
      setGoodVibesMatch(false);
      if (autoStrangerBlur && !unique.consentComplete) {
        setStrangerBlur(true);
        setShowStrangerReveal(true);
      }
      onJoined?.(data.roomId);
      playMatch();
      if (getPrefs().notifyBrowser) notifyIfBackground('Match found', 'Someone joined your Helloooo video chat 👋.');
    };

    const onHistory = (data) => {
      if (data.roomId === roomIdRef.current) setMessages(data.messages || []);
    };

    const onMsg = (data) => {
      if (data.roomId === roomIdRef.current) {
        setMessages((m) => [...m.slice(-100), data]);
        if (data.socketId !== socket.id) {
          playMessageSound();
          if (isMobile && (!showChat || chatCollapsed)) setChatUnread((n) => n + 1);
        }
      }
    };

    const onUserLeft = () => {
      setPeer(null);
      setStatus('disconnected');
      setPartnerLeft(true);
      playDisconnectSound();

      clearTimeout(userLeftTimerRef.current);
      userLeftTimerRef.current = setTimeout(() => {
        if (!isMounted.current || statusRef.current === 'idle' || statusRef.current === 'searching') return;
        handleSkip();
      }, 700);

      clearTimeout(partnerLeftTimerRef.current);
      partnerLeftTimerRef.current = setTimeout(() => setPartnerLeft(false), 5000);
    };

    const onRoomEndedByAdmin = (data) => {
      setToast(data?.message || '⚠️ This session was terminated by administrative protocol.');
      setTimeout(() => handleBack(), 2000);
    };

    const onSessionTerminatedByAdmin = (data) => {
      setToast(data?.message || '⚠️ Your session was terminated by a moderator.');
      setTimeout(() => handleBack(), 2500);
    };

    const onWaiting = () => setStatus('searching');
    const onSystemMsg = (data) => setMessages((m) => [...m, { id: nextMsgId('sys'), system: true, text: `📢 ADMIN: ${data.message}`, ts: Date.now() }]);
    const onMaintenance = (data) => {
      setToast(data.message || 'System is going into maintenance mode.');
      setTimeout(() => { window.location.href = '/'; }, 1500);
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
        if (data.roomId && !roomIdRef.current) {
          roomIdRef.current = data.roomId;
          setRoomId(data.roomId);
        }
        if (localStreamRef.current && roomIdRef.current) doAnswer(from, data.signal);
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
          } catch (err) { mmDebug('setRemoteDesc', err); }
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
    socket.on('session-terminated-by-admin', onSessionTerminatedByAdmin);
    const onContentFlaggedMsg = (data) => {
      setMessages(m => [...m, { id: nextMsgId('sys'), system: true, text: `🛡️ ${data.message}`, ts: Date.now() }]);
      playDisconnectSound();
    };
    const onServerError = (data) => {
      const msg = data?.message || 'Something went wrong.';
      setMessages(m => [...m, { id: nextMsgId('sys'), system: true, text: `❌ ERROR: ${msg}`, ts: Date.now() }]);
      setToast(`⚠️ ${msg}`);
    };
    socket.on('content-flagged', onContentFlaggedMsg);
    socket.on('error', onServerError);
    const onSignalRateLimited = (data) => {
      const msg = data?.message || 'Too many connection signals. Please wait a moment.';
      setToast(typeof msg === 'string' ? `⏱️ ${msg}` : '⏱️ Rate limited — slow down for a few seconds.');
    };
    socket.on('signal-rate-limited', onSignalRateLimited);

    const onRoomReaction = ({ emoji }) => {
      const id = Math.random().toString(36).slice(2, 9);
      setLocalReactions((prev) => [...prev.slice(-12), { id, emoji, x: 20 + Math.random() * 60, y: 45 + Math.random() * 35 }]);
      setTimeout(() => setLocalReactions((prev) => prev.filter((r) => r.id !== id)), 3500);
    };
    const onPeerRecording = ({ recording }) => setPeerRecording(!!recording);
    const onTipReceived = ({ fromNickname, amount }) => setToast(`💰 ${fromNickname} tipped you ${amount} coins!`);

    socket.on('room-reaction', onRoomReaction);
    socket.on('peer-recording-status', onPeerRecording);
    socket.on('creator-tip-received', onTipReceived);
    const onSocketConnect = () => {
      mmDebug('socket.connected', socket.id);
      if (firstSocketConnectRef.current) {
        firstSocketConnectRef.current = false;
        return;
      }
      setMessages((m) => [...m, { id: nextMsgId('sys'), system: true, text: '✅ Reconnected to chat server.', ts: Date.now() }]);
    };
    const onSocketDisconnect = (reason) => {
      mmDebug('socket.disconnected', reason);
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
        setMessages(m => [...m, { id: nextMsgId('sys'), system: true, text: '⚠️ Connection lost. Reconnecting… stay on this screen.', ts: Date.now() }]);
      }
    };
    socket.on('connect', onSocketConnect);
    socket.on('disconnect', onSocketDisconnect);

    return () => {
      clearTimeout(userLeftTimerRef.current);
      clearTimeout(partnerLeftTimerRef.current);
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
      socket.off('session-terminated-by-admin', onSessionTerminatedByAdmin);
      socket.off('content-flagged', onContentFlaggedMsg);
      socket.off('error', onServerError);
      socket.off('signal-rate-limited', onSignalRateLimited);
      socket.off('room-reaction', onRoomReaction);
      socket.off('peer-recording-status', onPeerRecording);
      socket.off('creator-tip-received', onTipReceived);
      socket.off('connect', onSocketConnect);
      socket.off('disconnect', onSocketDisconnect);
    };
  }, [socket, interest, onJoined, doOffer, doAnswer, addIce, handleBack, handleSkip, autoStrangerBlur, isMobile, showChat, chatCollapsed]);

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
    if (!localStream || !peer?.stream) { setToast('⚠️ Ensure both local and stranger video are active to record.'); return; }

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
      if (!isRecordingRef.current) return;
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

    isRecordingRef.current = true;
    setIsRecording(true);
    emitRecordingStatus(true);
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
      a.download = `Helloooo_CreatorCapture_${Date.now()}.webm`;
      a.click();
      isRecordingRef.current = false;
      setIsRecording(false);
      emitRecordingStatus(false);
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setToast('🎥 REC STARTED');
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      isRecordingRef.current = false;
      recorderRef.current.stop();
      emitRecordingStatus(false);
      setToast('🎥 REC SAVED');
    }
  };

  const send3dEmoji = (emojiObj) => {
    if (coins < 5) { setToast('⚠️ Need 5 coins for 3D Emoji!'); return; }
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
          id: `local-med-${nextMsgId()}`,
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
    if (!socket) return;
    const on3dEmoji = (data) => {
      if (data.roomId && data.roomId !== roomIdRef.current) return;
      setActive3dEmoji(data);
      setMessages(prev => [...prev.slice(-100), {
        id: nextMsgId('emoji'),
        text: `Sent a 3D ${data.emoji?.char || data.emoji}`,
        socketId: data.socketId,
        nickname: data.nickname,
        ts: Date.now(),
        isEmoji: true,
        fromSelf: data.socketId === socket.id
      }]);
      setTimeout(() => setActive3dEmoji(null), 4000);
    };
    const onMediaMessage = (data) => {
      if (data.roomId && data.roomId !== roomIdRef.current) return;
      setMessages(prev => [...prev.slice(-100), { ...data, media: true }]);
    };
    socket.on('3d-emoji', on3dEmoji);
    socket.on('media-message', onMediaMessage);
    return () => {
      socket.off('3d-emoji', on3dEmoji);
      socket.off('media-message', onMediaMessage);
    };
  }, [socket]);

  useEffect(() => () => {
    releaseAllMedia();
    clearRoom();
  }, [releaseAllMedia, clearRoom]);

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
  };

  const handleVoiceMessage = (audioDataUrl) => {
    if (!socket || !roomIdRef.current) return;
    socket.emit('send-message', { roomId: roomIdRef.current, text: audioDataUrl, type: 'voice' });
  };

  const handleInputChange = (value) => {
    setInput(value);
    const r = roomIdRef.current;
    if (!socket || !r) return;
    socket.emit('typing', { roomId: r, isTyping: value.length > 0 });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket.emit('typing', { roomId: r, isTyping: false });
    }, 2000);
  };

  const scrollToChat = () => {
    setShowChat(true);
    setChatCollapsed(false);
    const el = document.getElementById('video-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  };

  const chatMyCountry = myCountry || country;
  const chatPeerCountry = peer?.country;

  const renderDeskToolbar = (extraClass = '') => {
    const Wrapper = extraClass.includes('inline') ? 'div' : 'footer';
    return (
    <Wrapper className={`mm-desk-toolbar${extraClass ? ` ${extraClass}` : ''}`}>
      <button type="button" onClick={toggleMute} className={`mm-desk-tool ${muted ? 'mm-desk-tool--off' : ''}`}>
        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
        Mic
        <span className="mm-desk-tool__chev" onClick={(e) => { e.stopPropagation(); setShowDevicePicker(true); }} role="presentation">▾</span>
      </button>
      <button type="button" onClick={toggleCamera} className={`mm-desk-tool ${cameraOff ? 'mm-desk-tool--off' : ''}`}>
        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        Camera
        <span className="mm-desk-tool__chev" onClick={(e) => { e.stopPropagation(); setShowDevicePicker(true); }} role="presentation">▾</span>
      </button>
      <button type="button" onClick={toggleFlip} className="mm-desk-tool" title={isMobile ? 'Switch camera' : 'Flip mirror'}>
        <svg className="w-4 h-4 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
        Flip
      </button>
      {PHASE_4_UNIQUE.liveCaptions && (
        <button
          type="button"
          onClick={() => unique.setCaptionsOn((v) => !v)}
          className={`mm-desk-tool ${unique.captionsOn ? 'mm-desk-tool--next' : ''}`}
          title="Toggle live captions panel"
        >
          CC
        </button>
      )}
      {!isSidebarDesk && (
        <button type="button" onClick={scrollToChat} className="mm-desk-tool">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          Chat
        </button>
      )}
      <button type="button" onClick={handleSkip} className="mm-desk-tool mm-desk-tool--next">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
        Next
      </button>
      <button type="button" onClick={handleStop} className="mm-desk-tool mm-desk-tool--end">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.516l2.257-1.13a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.28 3H5z" /></svg>
        End Call
      </button>
    </Wrapper>
    );
  };

  const renderDeskChatPanel = (sidebar = false) => (
    <div ref={chatPanelRef} className={`mm-desk-chat${sidebar ? ' mm-desk-chat--sidebar' : ''}`} id="video-chat-messages-wrap">
      <div className="mm-desk-chat__banner">
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        You&apos;re chatting anonymously
      </div>
      <div className="mm-desk-chat__messages custom-scrollbar" id="video-chat-messages">
        {messages.filter((m) => !m.system || m.isIntro).map((m, i) => (
          <DeskChatBubble key={m.id || i} m={m} isMe={m.socketId === socket?.id} myCountry={chatMyCountry} peerCountry={chatPeerCountry} onViewCreator={setShowProfileHandle} />
        ))}
        <div ref={chatEndRef} />
      </div>
      {strangerTyping && (
        <div className="mm-desk-chat__typing">
          Stranger is typing…
          <span className="mm-desk-chat__typing-dots"><span /><span /><span /></span>
        </div>
      )}
      <div className="mm-desk-chat__input-row">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendMsg(); } }}
          placeholder="Type a message..."
          className="mm-desk-chat__input"
        />
        <button type="button" onClick={sendMsg} className="mm-desk-chat__send" aria-label="Send">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`${desktopLayout ? 'mm-desk-shell' : 'mm-mobile-shell'} h-[100dvh] min-h-0 flex flex-col text-white overflow-hidden font-sans select-none`}>
      {desktopLayout ? (
        <header className="mm-desk-header">
          <div className="mm-desk-header__online">
            <span className="mm-desk-dot mm-desk-dot--green" aria-hidden />
            {(typeof onlineCount === 'object' ? onlineCount?.count : onlineCount || 0).toLocaleString()} users online
          </div>
          <div className="mm-desk-header__actions">
            <div className="mm-desk-layout-toggle" role="group" aria-label="Layout">
              <button
                type="button"
                className={`mm-desk-layout-btn${!isSidebarDesk ? ' mm-desk-layout-btn--active' : ''}`}
                onClick={() => setDeskLayout('horizontal')}
                title="Side-by-side panels, chat below"
                aria-label="Horizontal layout"
                aria-pressed={!isSidebarDesk}
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <rect x="1" y="4" width="8" height="12" rx="1.5" opacity="0.9" />
                  <rect x="11" y="4" width="8" height="12" rx="1.5" opacity="0.9" />
                </svg>
              </button>
              <button
                type="button"
                className={`mm-desk-layout-btn${isSidebarDesk ? ' mm-desk-layout-btn--active' : ''}`}
                onClick={() => setDeskLayout('sidebar')}
                title="Stacked panels left, chat and controls right"
                aria-label="Sidebar layout"
                aria-pressed={isSidebarDesk}
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <rect x="1" y="2" width="7" height="7.5" rx="1.2" opacity="0.9" />
                  <rect x="1" y="10.5" width="7" height="7.5" rx="1.2" opacity="0.9" />
                  <rect x="10" y="2" width="9" height="16" rx="1.5" opacity="0.55" />
                </svg>
              </button>
            </div>
            <button type="button" className="mm-desk-icon-btn" onClick={() => setShowReportModal(true)} title="Safety" aria-label="Safety">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </button>
            <SettingsGearButton onClick={() => setShowSettings(true)} className="mm-desk-icon-btn" />
            <button type="button" className="mm-desk-icon-btn" onClick={() => setShowMoreMenu(true)} title="More options" aria-label="Menu">⋯</button>
          </div>
        </header>
      ) : (
      <header className="mm-mobile-header">
        <button type="button" className="mm-mobile-header__icon" onClick={() => setShowReportModal(true)} title="Safety" aria-label="Safety">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </button>
        <div className="mm-mobile-header__brand">
          <img src="/helloooo-logo.png" alt="" className="mm-mobile-header__logo" />
          <div className="mm-mobile-header__titles">
            <HellooooBrand size="sm" className="mm-mobile-header__name" />
            {status === 'connected' ? (
              <span className="mm-mobile-header__status">
                <span className="mm-desk-dot mm-desk-dot--green" aria-hidden />
                Connected • {formatTimerLong(connectedSecs)}
                {PHASE_3_PRO.aiMoodDetection && moodEmoji && (
                  <span className="ml-1" title="Conversation mood">{moodEmoji}</span>
                )}
              </span>
            ) : (
              <span className="mm-mobile-header__status mm-mobile-header__status--muted">
                {status === 'searching' ? 'Looking for someone…' : status === 'idle' ? 'Ready to connect' : 'Video chat'}
              </span>
            )}
          </div>
        </div>
        <SettingsGearButton onClick={() => setShowSettings(true)} className="mm-mobile-header__icon" />
        <button type="button" className="mm-mobile-header__icon" onClick={() => setShowMoreMenu(true)} title="More options" aria-label="Menu">⋯</button>
      </header>
      )}

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

      {!desktopLayout && status !== 'connected' && (
      <div className="shrink-0 px-2 sm:px-3">
        <AdSlot slotKey="chat_banner" script={adScripts?.chat_banner} adsEnabled={adsEnabled} compact />
      </div>
      )}

      <VideoSessionBanners
        showSafetyNudge={showSafetyNudge}
        onDismissSafety={dismissSafetyNudge}
        peerRecording={peerRecording}
        showStayConnected={showStayConnected && goodVibesMatch && peer?.isCreator}
        onStayConnected={() => { if (peer?.nickname) window.open(`/creator/${peer.nickname}`, '_blank'); setShowStayConnected(false); }}
        onDismissStayConnected={() => setShowStayConnected(false)}
        matchedInterests={status === 'connected' ? selectedInterests : []}
      />

      <main className={desktopLayout ? 'mm-desk-main' : `mm-mobile-main ${status !== 'connected' ? 'mm-mobile-main--solo' : ''}`}>
        {desktopLayout ? (
          <div className={`mm-desk-card${isSidebarDesk ? ' mm-desk-card--sidebar' : ''}`}>
            <div className={`mm-desk-body${isSidebarDesk ? ' mm-desk-body--sidebar' : ''}`}>
              <div className={`mm-desk-media${isSidebarDesk ? ' mm-desk-media--sidebar' : ''}`}>
                <div className={isSidebarDesk ? 'mm-desk-video-col' : 'mm-desk-video-row'}>
              <div className="mm-desk-pane">
                <div className="mm-desk-pane__tag mm-desk-pane__tag--you">
                  <span className="mm-desk-dot mm-desk-dot--green" aria-hidden /> You
                  {(myCountry || country) && (
                    <CountryFlag country={myCountry || country} className="mm-country-flag" size={14} />
                  )}
                  {isCreator && <BlueTick />}
                </div>
                <VideoWatermark />
                {cameraError && !localStream && <AudioOnlyFallback nickname={nickname} micBlocked={micBlocked} onRetryCamera={retryMediaLocal} onAudioOnly={continueAudioOnly} />}
                <video
                  ref={bindLocalVideo}
                  autoPlay
                  muted
                  playsInline
                  className={`${mirrorLocalVideo ? '-scale-x-100' : ''} ${cameraOff ? 'opacity-30' : ''}`}
                  style={{ filter: isCreator && activeFilter !== 'none' ? activeFilter : 'none' }}
                />
                {status === 'idle' && (
                  <div className="mm-desk-pane__placeholder">
                    <p className="text-sm font-semibold text-white/80 mb-3">Ready to chat?</p>
                    <button type="button" onClick={handleStart} disabled={!connected} className="mm-omegle-btn-new disabled:opacity-40">Start</button>
                  </div>
                )}
              </div>
              <div
                className={`mm-desk-pane ${peer?.isCreator ? 'cursor-pointer' : ''}`}
                ref={remoteStageRef}
                onClick={() => peer?.isCreator && peer?.nickname && setShowProfileHandle(peer.nickname)}
                role={peer?.isCreator ? 'button' : undefined}
                title={peer?.isCreator ? 'View creator profile' : undefined}
              >
                <div className="mm-desk-pane__tag mm-desk-pane__tag--stranger">
                  <span className="mm-desk-dot mm-desk-dot--blue" aria-hidden />
                  {peer?.isCreator ? `@${peer?.nickname || 'Creator'}` : (peer?.nickname && peer.nickname !== 'Anonymous' ? peer.nickname : 'Stranger')}
                  {peer?.country && (
                    <CountryFlag country={peer.country} className="mm-country-flag" size={14} />
                  )}
                  {peer?.isCreator && <BlueTick />}
                </div>
                <VideoWatermark />
                {status === 'searching' && (
                  <div className="mm-desk-pane__placeholder">
                    <div className="mm-omegle-search__spinner mb-3" aria-hidden />
                    <p className="text-sm font-semibold text-white/80">Looking for someone…</p>
                  </div>
                )}
                {status === 'idle' && (
                  <div className="mm-desk-pane__placeholder">
                    <p className="text-sm font-semibold text-white/50">Waiting for you to start</p>
                  </div>
                )}
                {status === 'connected' && (
                  <>
                    <RemoteVideoComponent stream={peer?.stream} muted={mutedStranger} strangerFilter={strangerFilter} strangerBlur={strangerBlur || (!unique.consentComplete && autoStrangerBlur)} />
                    {peer?.isCreator && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full bg-black/55 border border-violet-500/30 text-[9px] font-black uppercase tracking-widest text-violet-200 pointer-events-none">
                        Tap video to open creator profile
                      </div>
                    )}
                    <StrangerRevealOverlay show={showStrangerReveal && (strangerBlur || !unique.consentComplete) && !unique.consentComplete} onReveal={() => { revealStranger(); unique.markReady(); }} />
                    <FloatingVideoReactions reactions={localReactions} />
                    {strangerCameraOff && (
                      <div className="mm-desk-pane__placeholder">
                        <span className="text-xs text-white/50 uppercase tracking-wider">Camera off</span>
                      </div>
                    )}
                    <ConsentSessionGate
                      visible={PHASE_4_UNIQUE.mutualConsent && !unique.consentComplete}
                      partnerReady={unique.partnerReady}
                      totalPartners={unique.totalPartners}
                      topicContract={topicContract}
                      conversationMode={conversationMode}
                      modePrompt={unique.modePrompt}
                      onReady={unique.markReady}
                      onAudioReady={unique.markAudioIntroReady}
                      audioIntroDone={unique.audioIntroComplete}
                      aiOnline={unique.aiOnline}
                    />
                  </>
                )}
                {status !== 'connected' && status !== 'searching' && status !== 'idle' && (
                  <div className="mm-desk-pane__placeholder">
                    <p className="text-xs text-white/40">Waiting for match…</p>
                  </div>
                )}
              </div>
                </div>
              </div>
              {PHASE_4_UNIQUE.liveCaptions && unique.captionsOn && !isSidebarDesk && (
                <LiveCaptionsPanel
                  caption={unique.caption}
                  enabled={unique.captionsOn}
                  onToggle={() => unique.setCaptionsOn(false)}
                />
              )}
              {isSidebarDesk && (
                <div className="mm-desk-sidebar">
                  {status === 'connected' ? (
                    renderDeskChatPanel(true)
                  ) : (
                    <div className="mm-desk-sidebar__idle">
                      <p className="text-sm font-semibold text-white/50 mb-1">
                        {status === 'searching' ? 'Looking for someone…' : status === 'idle' ? 'Start a chat to message' : 'Connect to chat'}
                      </p>
                      <p className="text-xs text-white/30">Chat appears here when matched</p>
                    </div>
                  )}
                  {renderDeskToolbar('mm-desk-toolbar--inline')}
                </div>
              )}
            </div>
            {!isSidebarDesk && status === 'connected' && renderDeskChatPanel(false)}
          </div>
        ) : (
          <>
          <div ref={remoteStageRef} className={`mm-mobile-video ${status !== 'connected' ? 'mm-mobile-video--solo' : ''}`}>
            {status === 'idle' && (
              <div className="mm-omegle-idle">
                {cameraError && (
                  <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs text-center max-w-xs">
                    {cameraError}
                  </div>
                )}
                <p className="text-sm font-semibold text-white/90 mb-2">Ready to meet someone new?</p>
                <p className="text-xs text-white/45 mb-6 text-center max-w-xs">Allow camera access, then start. You can skip anytime.</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-sm mb-6">
                  {interestTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleInterestTag(tag)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${selectedInterests.includes(tag) ? 'bg-emerald-600/90 border-emerald-500 text-white' : 'bg-white/5 border-white/15 text-white/45 hover:border-white/30'}`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={handleStart} disabled={!connected} className="mm-omegle-btn-new disabled:opacity-40 disabled:cursor-not-allowed">
                  Start
                </button>
              </div>
            )}
            {status === 'searching' && (
              <div className="mm-omegle-search">
                <div className="mm-omegle-search__spinner" aria-hidden />
                <p className="text-sm font-semibold text-white mb-1">Looking for someone…</p>
                <p className="text-xs text-white/45 text-center max-w-[16rem]">Matching you with a random stranger.</p>
              </div>
            )}
            {(status === 'idle' || status === 'searching') && (
              <>
                {cameraError && !localStream && <AudioOnlyFallback nickname={nickname} micBlocked={micBlocked} onRetryCamera={retryMediaLocal} onAudioOnly={continueAudioOnly} />}
                <video
                  ref={bindLocalVideo}
                  autoPlay
                  muted
                  playsInline
                  className={`absolute inset-0 w-full h-full object-cover ${mirrorLocalVideo ? '-scale-x-100' : ''} ${cameraOff ? 'opacity-30' : ''}`}
                  style={{ filter: isCreator && activeFilter !== 'none' ? activeFilter : 'none' }}
                />
              </>
            )}
            {status === 'connected' && (
              <div className="relative w-full h-full">
                <SecurityShield />
                {isRecording && <RecordingIndicator />}
                <div
                  className={`h-full relative overflow-hidden ${peer?.isCreator ? 'cursor-pointer group' : 'cursor-default'}`}
                  onClick={() => peer?.isCreator && setShowProfileHandle(peer.nickname)}
                >
                  <RemoteVideoComponent stream={peer?.stream} muted={mutedStranger} strangerFilter={strangerFilter} strangerBlur={strangerBlur || (!unique.consentComplete && autoStrangerBlur)} />
                  <FloatingVideoReactions reactions={localReactions} />
                  <StrangerRevealOverlay show={showStrangerReveal && (strangerBlur || !unique.consentComplete) && !unique.consentComplete} onReveal={() => { revealStranger(); unique.markReady(); }} />
                  {PHASE_4_UNIQUE.liveCaptions && (
                    <LiveCaptionsBar caption={unique.caption} enabled={unique.captionsOn} onToggle={() => unique.setCaptionsOn((v) => !v)} />
                  )}
                  {peer?.isCreator && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                      <span className="opacity-0 group-hover:opacity-100 bg-white text-black px-4 py-1.5 rounded-full text-[10px] font-bold shadow-lg transition-all">View creator</span>
                    </div>
                  )}
                </div>
                {strangerCameraOff && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
                    <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Stranger&apos;s camera is off</span>
                  </div>
                )}
                <ConsentSessionGate
                  visible={PHASE_4_UNIQUE.mutualConsent && !unique.consentComplete}
                  partnerReady={unique.partnerReady}
                  totalPartners={unique.totalPartners}
                  topicContract={topicContract}
                  conversationMode={conversationMode}
                  modePrompt={unique.modePrompt}
                  onReady={unique.markReady}
                  onAudioReady={unique.markAudioIntroReady}
                  audioIntroDone={unique.audioIntroComplete}
                  aiOnline={unique.aiOnline}
                />
                <div className="mm-mobile-pip">
                  <video
                    ref={bindLocalVideo}
                    autoPlay
                    muted
                    playsInline
                    className={`w-full h-full object-cover ${mirrorLocalVideo ? '-scale-x-100' : ''} ${cameraOff ? 'opacity-30' : ''}`}
                    style={{ filter: isCreator && activeFilter !== 'none' ? activeFilter : 'none' }}
                  />
                  <div className="mm-mobile-pip__footer">
                    <span>You</span>
                    <MobSignalBars quality={connectionQuality} />
                  </div>
                  {isCreator && filterTimer > 0 && (
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-black text-[7px] font-black uppercase">FX</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {status === 'connected' && (
            <div ref={chatPanelRef} className={`mm-mobile-chat ${chatCollapsed ? 'mm-mobile-chat--collapsed' : ''}`} id="video-chat-messages-wrap">
              <button type="button" className="mm-mobile-chat__head" onClick={() => setChatCollapsed((c) => !c)} aria-expanded={!chatCollapsed}>
                <span className="mm-mobile-chat__handle" aria-hidden />
                <span className="mm-mobile-chat__title">
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  Chat
                  {chatUnread > 0 && chatCollapsed && (
                    <span className="mm-mobile-chat__badge">{chatUnread > 9 ? '9+' : chatUnread}</span>
                  )}
                </span>
                <span className={`mm-mobile-chat__chev ${chatCollapsed ? '' : 'mm-mobile-chat__chev--open'}`} aria-hidden>⌄</span>
              </button>
              {!chatCollapsed && (
                <>
                  <div className="mm-mobile-chat__messages custom-scrollbar" id="video-chat-messages">
                    {messages.filter((m) => !m.system || m.isIntro).length === 0 && (
                      <p className="text-center text-xs text-white/30 py-6">Say hi — messages are anonymous.</p>
                    )}
                    {messages.filter((m) => !m.system || m.isIntro).map((m, i) => (
                      <MobChatBubble key={m.id || i} m={m} isMe={m.socketId === socket?.id} myCountry={chatMyCountry} peerCountry={chatPeerCountry} onViewCreator={setShowProfileHandle} />
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  {strangerTyping && (
                    <div className="mm-mobile-chat__typing">
                      Stranger is typing
                      <span className="mm-desk-chat__typing-dots"><span /><span /><span /></span>
                    </div>
                  )}
                  <div className="mm-mobile-chat__input-row">
                    <ChatInputWithEmoji
                      value={input}
                      onChange={handleInputChange}
                      onSend={sendMsg}
                      placeholder="Type a message..."
                      showVoice={PHASE_2.voiceMessages}
                      onVoiceMessage={handleVoiceMessage}
                      className="mm-mobile-chat__input-comp"
                      inputClassName="mm-mobile-chat__input-field"
                    />
                  </div>
                </>
              )}
            </div>
          )}
          </>
        )}
      </main>

      {desktopLayout && !isSidebarDesk ? (
        renderDeskToolbar()
      ) : desktopLayout ? null : (
      <footer className="mm-mobile-bar">
        <button type="button" onClick={toggleMute} className={`mm-mobile-bar__item ${muted ? 'mm-mobile-bar__item--off' : ''}`}>
          <span className="mm-mobile-bar__icon mm-mobile-bar__icon--green">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          </span>
          <span className="mm-mobile-bar__label">Mic</span>
        </button>
        <button type="button" onClick={toggleCamera} className={`mm-mobile-bar__item ${cameraOff ? 'mm-mobile-bar__item--off' : ''}`}>
          <span className="mm-mobile-bar__icon mm-mobile-bar__icon--green">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </span>
          <span className="mm-mobile-bar__label">Camera</span>
        </button>
        <button type="button" onClick={toggleFlip} className="mm-mobile-bar__item" title="Flip camera">
          <span className="mm-mobile-bar__icon mm-mobile-bar__icon--green">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
          </span>
          <span className="mm-mobile-bar__label">Flip</span>
        </button>
        <button
          type="button"
          onClick={scrollToChat}
          className={`mm-mobile-bar__item ${status === 'connected' && !chatCollapsed ? 'mm-mobile-bar__item--active' : ''}`}
          disabled={status !== 'connected'}
        >
          <span className="mm-mobile-bar__icon mm-mobile-bar__icon--blue relative">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            {chatUnread > 0 && status === 'connected' && (
              <span className="mm-mobile-bar__badge">{chatUnread > 9 ? '9+' : chatUnread}</span>
            )}
          </span>
          <span className="mm-mobile-bar__label">Chat</span>
        </button>
        <button
          type="button"
          onClick={status === 'idle' ? handleStart : status === 'searching' ? handleStop : handleSkip}
          disabled={status === 'idle' && !connected}
          className="mm-mobile-bar__item mm-mobile-bar__item--next"
        >
          <span className="mm-mobile-bar__icon mm-mobile-bar__icon--green">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          </span>
          <span className="mm-mobile-bar__label">{status === 'idle' ? 'Start' : status === 'searching' ? 'Cancel' : 'Next'}</span>
        </button>
        <button type="button" onClick={status === 'idle' ? handleBack : handleStop} className="mm-mobile-bar__item mm-mobile-bar__item--end">
          <span className="mm-mobile-bar__icon mm-mobile-bar__icon--red">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.516l2.257-1.13a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.28 3H5z" /></svg>
          </span>
          <span className="mm-mobile-bar__label">{status === 'idle' ? 'Back' : 'End'}</span>
        </button>
      </footer>
      )}

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

      <ConsentSessionGate
        visible={status === 'connected' && PHASE_4_UNIQUE.mutualConsent && !unique.consentComplete}
        partnerReady={unique.partnerReady}
        totalPartners={unique.totalPartners}
        topicContract={topicContract}
        conversationMode={conversationMode}
        modePrompt={unique.modePrompt}
        onReady={unique.markReady}
        onAudioReady={unique.markAudioIntroReady}
        audioIntroDone={unique.audioIntroComplete}
        aiOnline={unique.aiOnline}
      />
      {PHASE_4_UNIQUE.dataSaverHud && status === 'connected' && (
        <div className="shrink-0 px-3 py-1 flex justify-between items-center border-b border-white/5 bg-black/20">
          <DataSaverHud bytesEstimate={unique.bytesEstimate} ultraLow={ultraLow} onToggleUltra={() => { setUltraLow((u) => !u); setLowBandwidth((b) => !b); setAutoBandwidth(false); }} />
          {PHASE_4_UNIQUE.calmMode && <CalmModeToggle enabled={calmMode} onToggle={() => setCalmMode((c) => !c)} />}
        </div>
      )}
      <ConversationRatingModal open={showRating} onClose={() => setShowRating(false)} onRate={handleRateConversation} />
      <VideoMoreSheet
        open={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        isMobile={isMobile}
        essentialOnly
        isTranslatorActive={isTranslatorActive}
        onToggleTranslate={() => setIsTranslatorActive((v) => !v)}
        onOpenDevices={() => setShowDevicePicker(true)}
        onToggleBandwidth={cycleBandwidth}
        autoBandwidth={autoBandwidth}
        lowBandwidth={lowBandwidth}
        onToggleAutoBlur={() => {
          const next = !autoStrangerBlur;
          setAutoStrangerBlur(next);
          localStorage.setItem('mm_auto_stranger_blur', next ? '1' : '0');
        }}
        autoStrangerBlur={autoStrangerBlur}
      />
      <DevicePickerSheet
        open={showDevicePicker}
        onClose={() => setShowDevicePicker(false)}
        videoDevices={videoDevices}
        audioDevices={audioDevices}
        selectedVideoId={selectedVideoDeviceId}
        selectedAudioId={selectedAudioDeviceId}
        onSelectVideo={(id) => { setSelectedVideoDeviceId(id); localStorage.setItem('mm_videoDeviceId', id); }}
        onSelectAudio={(id) => { setSelectedAudioDeviceId(id); localStorage.setItem('mm_audioDeviceId', id); }}
      />
      <TipCreatorModal open={showTipModal} onClose={() => setShowTipModal(false)} onTip={sendTip} balance={balance} creatorName={peer?.nickname} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function RemoteVideoComponent({ stream, muted, strangerFilter, strangerBlur }) {
  const ref = useRef(null);
  const [streamTick, setStreamTick] = useState(0);
  const videoTracks = stream?.getVideoTracks?.() || [];
  const streamLive = !!(stream?.active && videoTracks.some((t) => t.readyState === 'live' && t.enabled));

  useEffect(() => {
    if (!stream) return undefined;
    const bump = () => setStreamTick((t) => t + 1);
    stream.getTracks().forEach((t) => t.addEventListener('ended', bump));
    return () => stream.getTracks().forEach((t) => t.removeEventListener('ended', bump));
  }, [stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream || !streamLive) {
      if (el) el.srcObject = null;
      return undefined;
    }
    return attachStreamToVideo(el, stream);
  }, [stream, streamLive, streamTick]);

  if (!streamLive) {
    return (
      <>
        <VideoLogoPlaceholder label="Partner disconnected" compact />
        <VideoWatermark />
      </>
    );
  }

  return (
    <>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className="absolute inset-0 w-full h-full object-cover -scale-x-100 transition-all duration-300"
        style={{
          backgroundColor: '#000',
          filter: strangerBlur && strangerFilter === 'none' ? 'blur(20px)' : (strangerFilter !== 'none' ? strangerFilter : 'none'),
        }}
      />
      <VideoWatermark />
    </>
  );
}
