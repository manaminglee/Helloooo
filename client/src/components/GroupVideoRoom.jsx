/**
 * GroupVideoRoom – Up to 4 anonymous users in a video room
 * Premium 2x2 grid layout, Multi-way call, side chat panel
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { countryToFlag } from '../utils/countryFlag';
import { useIceServers } from '../hooks/useIceServers';
import { CoinBadge } from './CoinBadge';
import { ReportSafetyModal } from './ReportSafetyModal';
import { ensureNotifyPermission, notifyIfBackground } from '../utils/browserNotify';
import { playConnectSound, playMessageSound, playDisconnectSound, playWaveSound } from '../utils/sounds';
import { mmDebug } from '../utils/mmDebug';
import { attachStreamToVideo, hasLiveRemoteVideo, mergeTrackIntoStream } from '../utils/webrtcMedia';
import { MiniChatGamePanel } from './MiniChatGamePanel';
import { PHASE_2, PHASE_3_PRO, PHASE_4_UNIQUE } from '../constants/features';
import { useUniqueSession } from '../hooks/useUniqueSession';
import {
  AiStatusPill,
  CalmModeToggle,
  CoOpStreakBadge,
  NvidiaCopilotToast,
  TrustScoreChip,
} from './unique/UniqueSessionUI';
import {
  ConversationRatingModal,
  DevicePickerSheet,
  FloatingVideoReactions,
  TipCreatorModal,
  useChatSwipeCollapse,
  VideoMoreSheet,
  VideoReactionBar,
  VideoSessionBanners,
} from './VideoSessionUI';

const BlueTick = () => (
  <span className="inline-flex items-center justify-center w-3 h-3 bg-violet-500 rounded-full ml-1.5 shadow-[0_0_10px_#a78bfa]">
    <svg className="w-2 h-2 text-black" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  </span>
);

const ICEBREAKERS = [
  "What's your favorite movie?",
  "If you could travel anywhere, where?",
  "What music are you into?",
  "Any cool hobbies?",
  "What's something interesting about you?"
];

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

function RecordingIndicator() {
  return (
    <div className="absolute top-4 left-4 z-[100] flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-600/20 border border-rose-500/30 backdrop-blur-md animate-pulse">
      <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-400">Recording</span>
    </div>
  );
}

function formatChatTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function avatarColor(name = '') {
  const hues = [220, 260, 200, 330, 280, 190];
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return hues[h % hues.length];
}

function GroupDeskChatRow({ m, isMe }) {
  if (m.system) {
    return (
      <div className="mm-group-desk-chat__system">{m.text}</div>
    );
  }
  const name = isMe ? 'You' : (m.nickname || 'Stranger');
  const initial = (m.nickname || 'S').charAt(0).toUpperCase();
  return (
    <div className={`mm-group-desk-chat__msg ${isMe ? 'mm-group-desk-chat__msg--me' : ''}`}>
      {!isMe && (
        <div
          className="mm-group-desk-chat__avatar"
          style={{ background: `hsl(${avatarColor(m.nickname)} 55% 42%)` }}
          aria-hidden
        >
          {initial}
        </div>
      )}
      <div className="mm-group-desk-chat__bubble-wrap">
        <div className="mm-group-desk-chat__meta">
          <span className="mm-group-desk-chat__name">{name}</span>
          {m.ts && <span className="mm-group-desk-chat__time">{formatChatTime(m.ts)}</span>}
        </div>
        <div className={`mm-group-desk-chat__bubble ${isMe ? 'mm-group-desk-chat__bubble--me' : ''}`}>
          {m.text}
        </div>
      </div>
    </div>
  );
}

function DeskSignalBars({ level = 4 }) {
  return (
    <span className="mm-group-desk-signal" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`mm-group-desk-signal__bar ${i <= level ? 'mm-group-desk-signal__bar--on' : ''}`} style={{ height: `${0.35 + i * 0.22}rem` }} />
      ))}
    </span>
  );
}

function TileMicIcon({ muted }) {
  if (muted) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}

function VideoTile({ stream, label, flag, isMe, isEmpty, isSearching, isCreator = false, isActiveSpeaker = false, quality = 'good', handRaised = false, deskStyle = false, isMuted = false, hideTileMic = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    const play = async () => { try { await el.play(); } catch (e) { } };
    play();

    // Stream stabilizer
    const handleStalled = () => { if (el.paused && stream.active) el.play().catch(() => { }); };
    el.addEventListener('stalled', handleStalled);
    el.addEventListener('waiting', () => { if (stream.active) el.play().catch(() => { }); });
    el.addEventListener('canplay', () => el.play().catch(() => { }));

    return () => {
      el.removeEventListener('stalled', handleStalled);
    };
  }, [stream]);

  if (isSearching) {
    return (
      <div className="video-tile flex flex-col items-center justify-center gap-3">
        <div className="relative w-12 h-12">
          <div className="radar-ring absolute inset-0" style={{ borderColor: 'rgba(99,102,241,0.4)' }} />
          <div className="radar-ring absolute inset-2" style={{ animationDelay: '0.6s', borderColor: 'rgba(99,102,241,0.3)' }} />
          <div className="absolute inset-3 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm">📡</div>
        </div>
        <p className="text-xs" style={{ color: 'rgba(232,234,246,0.5)' }}>Entering room...</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="video-tile flex flex-col items-center justify-center gap-2 opacity-40">
        <div className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-xl">⏳</div>
        <p className="text-xs" style={{ color: 'rgba(232,234,246,0.4)' }}>Waiting...</p>
      </div>
    );
  }

  return (
    <div className={`video-tile min-h-0 min-w-0 transition-all duration-500 overflow-hidden ${deskStyle ? 'mm-group-desk-tile' : ''} ${isMe ? 'mirror' : ''} ${isActiveSpeaker && !deskStyle ? 'ring-4 ring-violet-500/40 ring-inset shadow-[0_0_30px_rgba(167,139,250,0.2)] scale-[1.02] z-10' : deskStyle && isActiveSpeaker ? 'mm-group-desk-tile--speaking' : 'brightness-90 hover:brightness-100'}`}>
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={isMe} className="w-full h-full object-cover" />
      ) : (
        <div className="tile-empty">
          <div className="peer-avatar text-xl" style={{ width: 52, height: 52, fontSize: '1.5rem' }}>
            {isMe ? '🙋' : '👤'}
          </div>
          <div className="search-dots"><span /><span /><span /></div>
        </div>
      )}

      {handRaised && (
        <div className="absolute top-4 left-4 z-20 animate-bounce">
          <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-black text-xs shadow-lg shadow-amber-500/40">✋</div>
        </div>
      )}

      {deskStyle && <span className="mm-group-desk-tile__live" aria-hidden />}

      {deskStyle && !hideTileMic && (
        <div className={`mm-group-desk-tile__mic ${isMuted ? 'mm-group-desk-tile__mic--off' : ''}`} title={isMuted ? 'Muted' : 'Mic on'}>
          <TileMicIcon muted={isMuted} />
        </div>
      )}

      {deskStyle ? (
        <div className="mm-group-desk-tile__tag">
          <span className="mm-desk-dot mm-desk-dot--green" aria-hidden />
          <span className="truncate">{isMe ? 'You' : (isCreator ? `@${label}` : label)}</span>
          {isCreator && <BlueTick />}
          {!isMe && flag && <span className="ml-0.5">{flag}</span>}
        </div>
      ) : (
      <div className={`tile-label flex items-center justify-between gap-4 ${isCreator ? 'border border-violet-500/30 bg-violet-950/40 text-violet-400 font-black tracking-widest' : ''}`}>
        <div className="flex items-center gap-1.5">
          {flag && <span className="mr-1">{flag}</span>}
          <span className="truncate max-w-[80px]">{isCreator ? `@${label}` : label}</span>
          {isCreator && <BlueTick />}
          {isMe && !isCreator && <span className="text-[8px] opacity-50 ml-1 uppercase">(me)</span>}
        </div>
        {!isMe && (
          <div className="flex items-center gap-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`w-1 h-3 rounded-full ${i === 2 && quality === 'poor' ? 'bg-white/10' : (i >= 1 && quality === 'fair' ? 'bg-white/10' : 'bg-emerald-500/80')}`} />
            ))}
          </div>
        )}
      </div>
      )}

      {isActiveSpeaker && !deskStyle && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500 text-black text-[7px] font-black uppercase tracking-widest animate-pulse shadow-lg">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
          Speaking
        </div>
      )}
    </div>
  );
}

const EMOJIS_3D = [
  { char: '🔥', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.webp' },
  { char: '💎', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f48e/512.webp' },
  { char: '🚀', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f680/512.webp' },
  { char: '✨', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2728/512.webp' },
  { char: '🎉', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f389/512.webp' },
  { char: '❤️', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2764_fe0f/512.webp' },
  { char: '😂', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.webp' },
  { char: '👑', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f451/512.webp' },
];

export default function GroupVideoRoom({ roomId: roomIdProp, interest: interestProp, nickname, isCreator = false, myCountry, socket, isQueuing, onLeave, onFindNewPod, onJoined, coinState, adsEnabled = false, adScripts = {}, registered = false, currentActiveSeconds = 0, conversationMode = 'free', topicContract = 'chill', calmMode: calmModeProp = false }) {
  const { balance = 0, streak = 0, canClaim = false, nextClaim = 0, claimCoins = () => { } } = coinState || {};
  const { iceServers } = useIceServers();
  const roomIdRef = useRef(null);
  const roomId = roomIdProp ?? roomIdRef.current;
  const [displayInterest, setDisplayInterest] = useState(interestProp || 'general');
  const [peers, setPeers] = useState([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [messages, setMessages] = useState([]);
  const [sparks, setSparks] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [showChat, setShowChat] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isTranslatorActive, setIsTranslatorActive] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState(displayInterest);
  const [icebreaker] = useState(() => ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)]);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const peerConnectionsRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const pendingPeersRef = useRef([]);
  const pendingOffersRef = useRef([]);
  const peerNicksRef = useRef(new Map());
  const peerCountriesRef = useRef(new Map());
  const peerCreatorsRef = useRef(new Map());
  const hasJoinedRef = useRef(false);
  const hasAutoLeftRef = useRef(false);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [active3dEmoji, setActive3dEmoji] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [toast, setToast] = useState(null);
  const [cameraBlur, setCameraBlur] = useState(false);
  const [connectedSecs, setConnectedSecs] = useState(0);
  const [showWave, setShowWave] = useState(false);
  const [moodEmoji, setMoodEmoji] = useState(null);
  const [p2pHealth, setP2pHealth] = useState('good');
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [goodVibesSent, setGoodVibesSent] = useState(false);
  const [goodVibesMatch, setGoodVibesMatch] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'speaker'
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [pipPos, setPipPos] = useState('br');
  const [pipSize, setPipSize] = useState('md');
  const [pipHidden, setPipHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [peerRecording, setPeerRecording] = useState(false);
  const [showSafetyNudge, setShowSafetyNudge] = useState(() => !sessionStorage.getItem('mm_group_video_safety_seen'));
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const chatPanelRef = useRef(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [remoteRaisedHands, setRemoteRaisedHands] = useState(new Set()); // socketIds
  const [localReactions, setLocalReactions] = useState([]); // {id, emoji, x, y}
  const audioAnalyzersRef = useRef(new Map()); // socketId -> analyzer
  const typingTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const inputRef = useRef(null);
  const connTimerRef = useRef(null);
  const [calmMode, setCalmMode] = useState(calmModeProp);

  const unique = useUniqueSession({
    socket,
    roomId,
    status: isQueuing ? 'searching' : 'connected',
    messages,
    interest: displayInterest,
    conversationMode,
    topicContract,
    calmMode,
    autoConsent: true,
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setShowChat(true);
    setChatCollapsed(false);
  }, [isMobile]);

  useChatSwipeCollapse(chatPanelRef, () => isMobile && setChatCollapsed(true));

  useEffect(() => {
    if (showChat && !chatCollapsed) setChatUnread(0);
  }, [showChat, chatCollapsed]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
      setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
    }).catch(() => {});
  }, [localStreamReady]);

  const cyclePipCorner = () => {
    const pos = ['tr', 'tl', 'bl', 'br'];
    setPipPos(pos[(pos.indexOf(pipPos) + 1) % pos.length]);
  };

  const cyclePipSize = () => setPipSize((s) => (s === 'sm' ? 'md' : s === 'md' ? 'lg' : 'sm'));

  const emitRecordingStatus = (recording) => {
    const rid = roomIdRef.current || roomId;
    if (socket && rid) socket.emit('peer-recording-status', { roomId: rid, recording });
  };

  const sendTip = (amount, targetSid) => {
    const rid = roomIdRef.current || roomId;
    const target = targetSid || peers.find((p) => p.isCreator)?.socketId;
    if (!socket || !rid || !target || balance < amount) return;
    socket.emit('spend-coins', { amount, reason: 'creator-tip' });
    socket.emit('tip-creator', { roomId: rid, targetSocketId: target, amount });
    setToast(`Sent ${amount} coins!`);
  };

  const dismissSafetyNudge = () => {
    sessionStorage.setItem('mm_group_video_safety_seen', '1');
    setShowSafetyNudge(false);
  };

  const handleRateConversation = (rating) => {
    const rid = roomIdRef.current || roomId;
    socket?.emit('rate-conversation', { rating, roomId: rid });
    setRatingDone(true);
    setShowRating(false);
    setToast('Thanks for your feedback!');
    finishLeaveRoom();
  };

  useEffect(() => {
    if (socket && !hasJoinedRef.current) {
      if (roomIdProp) {
        socket.emit('join-specific-group', { roomId: roomIdProp, nickname: nickname || 'Admin' });
      } else {
        socket.emit('join-group-by-topics', {
          interest: interestProp || 'general',
          nickname: nickname || 'Anonymous',
          mode: 'group_video'
        });
      }
      // Auto-join logic — NO WAITING SCREEN
    }
  }, [socket, roomIdProp, interestProp]);
  const [showReactionTooltip, setShowReactionTooltip] = useState(() => !localStorage.getItem('mm_grp_seen_reaction_tooltip'));
  const [localInterest, setLocalInterest] = useState(interestProp || 'general');
  const [joinRoomIdInput, setJoinRoomIdInput] = useState('');
  const [activeInterests, setActiveInterests] = useState([]);
  const [queuePos, setQueuePos] = useState(null);
  const [mediaError, setMediaError] = useState(null); // { type: 'denied'|'notfound'|'other', message }
  const [reconnectingPeers, setReconnectingPeers] = useState(new Set()); // socketIds with failed/disconnected ICE
  const [connectionQuality, setConnectionQuality] = useState(new Map()); // socketId -> 'good'|'fair'|'poor'
  const [pinnedId, setPinnedId] = useState(null); // 'local' or peer socketId for PiP
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTargetSid, setReportTargetSid] = useState('');
  const firstGroupSocketConnectRef = useRef(true);

  const clearGroupRejoinStorage = () => {
    try {
      sessionStorage.removeItem('mm_group_rejoin_room');
      sessionStorage.removeItem('mm_group_rejoin_nick');
    } catch { /* ignore */ }
  };

  const finishLeaveRoom = useCallback(() => {
    clearGroupRejoinStorage();
    roomIdRef.current = null;
    onLeave();
  }, [onLeave]);

  const handleLeaveRoom = useCallback(() => {
    const hadChat = messages.filter((m) => !m.system).length > 2;
    if (hadChat && !ratingDone) {
      setShowRating(true);
      return;
    }
    finishLeaveRoom();
  }, [messages, ratingDone, finishLeaveRoom]);

  useEffect(() => {
    const remote = peers.find((p) => p.socketId !== socket?.id);
    if (remote?.socketId) setReportTargetSid(remote.socketId);
  }, [peers, socket?.id]);

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => {
      if (firstGroupSocketConnectRef.current) {
        firstGroupSocketConnectRef.current = false;
        return;
      }
      const rid = roomIdRef.current || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('mm_group_rejoin_room') : null);
      const nick = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('mm_group_rejoin_nick') : null) || nickname || 'Anonymous';
      if (rid) {
        socket.emit('join-specific-group', { roomId: rid, nickname: nick });
        setToast('🔄 Rejoining your pod after reconnect…');
      }
    };
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [socket, nickname]);

  const startRecording = () => {
    if (peers.length === 0) return alert('No active users to record.');
    // Record the first peer for now, or use a complex Canvas recorder if needed.
    // For MVP consistency with VideoChat:
    const targetStream = peers[0]?.stream;
    if (!targetStream) return alert('No remote user stream available.');

    if (!MediaRecorder.isTypeSupported('video/webm')) {
      return alert('WebM recording not supported on this browser.');
    }

    const recorder = new MediaRecorder(targetStream, { mimeType: 'video/webm' });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Creator_Group_Clip_${Date.now()}.webm`;
      a.click();
    };
    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
    emitRecordingStatus(true);
    setToast('🎥 Group Recording Active');
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      setIsRecording(false);
      emitRecordingStatus(false);
      setToast('🎥 Recording Offline');
    }
  };

  // Fetch active groups/interests on mount and when modal opens
  const fetchInterests = () => {
    const apiBase = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    fetch(`${apiBase}/api/rooms/active-interests?mode=group_video`)
      .then(res => res.json())
      .then(data => setActiveInterests(data.interests || []))
      .catch(() => { });
  };

  useEffect(() => {
    fetchInterests();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(toastTimerRef.current);
  }, [toast]);

  // Connection timer
  useEffect(() => {
    if (participantCount > 1) {
      if (!connTimerRef.current) {
        setConnectedSecs(0);
        connTimerRef.current = setInterval(() => setConnectedSecs(s => s + 1), 1000);
      }
    } else {
      clearInterval(connTimerRef.current);
      connTimerRef.current = null;
    }
    return () => clearInterval(connTimerRef.current);
  }, [participantCount]);

  const formatTimer = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const formatTimerLong = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Wave / Good Vibes listeners
  useEffect(() => {
    if (!socket) return;
    const onWave = () => { setShowWave(true); setTimeout(() => setShowWave(false), 2800); playWaveSound(); };
    const onGoodVibesMatch = () => { setGoodVibesMatch(true); setToast('🤝 Group Synergy! Everyone felt the good vibes!'); playConnectSound(); };
    const onTyping = ({ isTyping, socketId }) => {
      if (socketId === socket.id) return;
      setStrangerTyping(isTyping);
      if (isTyping) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setStrangerTyping(false), 3000);
      }
    };
    socket.on('wave-reaction', onWave);
    socket.on('good-vibes-match', onGoodVibesMatch);
    socket.on('stranger-typing', onTyping);
    return () => {
      socket.off('wave-reaction', onWave);
      socket.off('good-vibes-match', onGoodVibesMatch);
      socket.off('stranger-typing', onTyping);
    };
  }, [socket]);

  const sendWave = () => {
    if (socket && roomId) {
      socket.emit('send-wave', { roomId });
      setShowWave(true);
      setTimeout(() => setShowWave(false), 2800);
    }
  };

  const sendGoodVibes = () => {
    if (socket && roomId) {
      socket.emit('send-good-vibes', { roomId });
      setGoodVibesSent(true);
      setToast('🤝 Good Vibes sent to the room!');
    }
  };

  // Mood analyzer
  useEffect(() => {
    const last = messages.filter(m => !m.system && m.socketId !== socket?.id).slice(-1)[0];
    if (!last?.text) return;
    const t = last.text.toLowerCase();
    if (/lol|haha|😂|😄|funny|lmao/.test(t)) setMoodEmoji('😂');
    else if (/wow|amazing|omg|whoa|really/.test(t)) setMoodEmoji('😮');
    else if (/hmm|think|maybe|wonder|idk/.test(t)) setMoodEmoji('🤔');
    else if (/great|nice|good|cool|love|awesome/.test(t)) setMoodEmoji('😊');
    else setMoodEmoji(null);
  }, [messages, socket]);

  // Process pending peers/offers once local stream is ready
  useEffect(() => {
    if (!localStreamReady || !socket) return;
    const pend = pendingPeersRef.current.splice(0);
    pend.forEach((sid) => doOffer(sid));
    const offs = pendingOffersRef.current.splice(0);
    offs.forEach(({ from, signal }) => doAnswer(from, signal));
  }, [localStreamReady, socket]);

  // Camera + Mic setup – must complete before WebRTC signaling
  const requestMediaAccess = async () => {
    setMediaError(null);
    try {
      const constraints = {
        video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      };
      let s = null;
      try {
        s = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        // Fallback for strict mobile devices
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: true
        });
      }
      localStreamRef.current = s;
      setLocalStreamReady(true);
      setMediaError(null);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = s;
        localVideoRef.current.play().catch(() => { });
      }
    } catch (err) {
      console.error('getUserMedia error:', err);
      const name = err?.name || '';
      const msg = err?.message || String(err);
      if (name === 'NotAllowedError' || msg.includes('Permission denied')) {
        setMediaError({ type: 'denied', message: 'Camera and microphone access was denied. Please ensure you have granted permissions in your browser/system settings.' });
      } else if (name === 'NotFoundError' || msg.includes('not found')) {
        setMediaError({ type: 'notfound', message: 'No camera or microphone found.' });
      } else {
        setMediaError({ type: 'other', message: msg || 'Could not access camera or microphone.' });
      }
      setLocalStreamReady(true);
    }
  };

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => { t.stop(); t.enabled = false; });
      }
      localStreamRef.current = null;
    };
  }, []);

  // Sync local stream to video element when ref mounts (handles race)
  useEffect(() => {
    if (localStreamReady && localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localStreamReady, facingMode]);

  // Apply tracks to all active peer connections when local stream changes
  useEffect(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const vt = s.getVideoTracks()[0];
    const at = s.getAudioTracks()[0];

    peerConnectionsRef.current.forEach((pc) => {
      if (pc.signalingState === 'closed') return;
      const senders = pc.getSenders();
      const vs = senders.find(s => s.track?.kind === 'video');
      const as = senders.find(s => s.track?.kind === 'audio');

      if (vs && vt) vs.replaceTrack(vt).catch(() => { });
      if (as && at) as.replaceTrack(at).catch(() => { });
    });
  }, [localStreamReady, facingMode]);

  // Setup local audio analyzer for speaking detection
  useEffect(() => {
    if (localStreamReady && localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
      setupAudioAnalyzer('local', localStreamRef.current);
    }
    return () => { cleanupAudioAnalyzer('local'); };
  }, [localStreamReady, localStreamRef.current]);

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const next = !muted;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    const next = !cameraOff;
    localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
  };

  const setupAudioAnalyzer = (id, stream) => {
    try {
      if (audioAnalyzersRef.current.has(id)) cleanupAudioAnalyzer(id);
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      audioAnalyzersRef.current.set(id, { analyzer, ctx });
    } catch (e) { }
  };

  const cleanupAudioAnalyzer = (id) => {
    const data = audioAnalyzersRef.current.get(id);
    if (data && data.ctx) {
      try { data.ctx.close(); } catch (e) { }
    }
    audioAnalyzersRef.current.delete(id);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      let loudestId = null;
      let maxVol = 0;
      audioAnalyzersRef.current.forEach(({ analyzer }, id) => {
        const dataArr = new Uint8Array(analyzer.frequencyBinCount);
        analyzer.getByteFrequencyData(dataArr);
        const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length;
        if (avg > maxVol && avg > 15) {
          maxVol = avg;
          loudestId = id;
        }
      });
      if (loudestId !== activeSpeakerId) setActiveSpeakerId(loudestId);
    }, 400);
    return () => clearInterval(interval);
  }, [activeSpeakerId, peers]);

  const createPeerConnection = (remoteId) => {
    if (peerConnectionsRef.current.has(remoteId)) return peerConnectionsRef.current.get(remoteId);
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }

    pc.onicecandidate = (e) => {
      const rid = roomIdRef.current || roomId;
      if (e.candidate && socket && rid) {
        socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'ice-candidate', signal: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      let stream = e.streams && e.streams[0];
      const track = e.track;
      if (!stream && track) stream = new MediaStream([track]);

      setPeers((prev) => {
        const existing = prev.find((p) => p.socketId === remoteId);
        const nick = peerNicksRef.current.get(remoteId) || 'Stranger';
        const ctry = peerCountriesRef.current.get(remoteId);
        const isCr = !!peerCreatorsRef.current.get(remoteId);
        const merged = mergeTrackIntoStream(existing?.stream, track) || stream;

        if (existing) {
          return prev.map((p) => (p.socketId === remoteId ? { ...p, stream: merged, nickname: nick, country: ctry, isCreator: isCr } : p));
        }
        return [...prev, { socketId: remoteId, stream: merged, nickname: nick, country: ctry, isCreator: isCr }];
      });

      if (e.track.kind === 'audio' && !audioAnalyzersRef.current.has(remoteId)) {
        const pcNow = peerConnectionsRef.current.get(remoteId);
        const recv = pcNow?.getReceivers?.().find((r) => r.track?.kind === 'audio');
        if (recv?.track) {
          const audioStream = new MediaStream([recv.track]);
          setupAudioAnalyzer(remoteId, audioStream);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      mmDebug('grp-ice', remoteId, state);
      if (state === 'failed' || state === 'disconnected') {
        setP2pHealth('poor');
        setReconnectingPeers(prev => new Set(prev).add(remoteId));
        setTimeout(() => {
          if (pc.iceConnectionState === 'connected') {
            setReconnectingPeers(prev => { const n = new Set(prev); n.delete(remoteId); return n; });
            setP2pHealth('good');
          } else if (pc.iceConnectionState === 'failed') {
            setP2pHealth('failed');
            setPeers((p) => p.filter((x) => x.socketId !== remoteId));
            peerConnectionsRef.current.delete(remoteId);
            audioAnalyzersRef.current.delete(remoteId);
            setReconnectingPeers(prev => { const n = new Set(prev); n.delete(remoteId); return n; });
          }
        }, 5000);
      } else if (state === 'connected') {
        setP2pHealth('good');
        setReconnectingPeers(prev => { const n = new Set(prev); n.delete(remoteId); return n; });
      }
    };

    peerConnectionsRef.current.set(remoteId, pc);
    return pc;
  };

  const doOffer = async (remoteId) => {
    const rid = roomIdRef.current || roomId;
    if (!rid || !socket) return;
    const pc = createPeerConnection(remoteId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'offer', signal: offer });
    } catch (err) { console.error('offer err', err); }
  };

  const doAnswer = async (remoteId, offer) => {
    const rid = roomIdRef.current || roomId;
    if (!rid || !socket) return;
    const pc = createPeerConnection(remoteId);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'answer', signal: answer });
    } catch (err) { console.error('answer err', err); }
  };

  const addIce = async (remoteId, candidate) => {
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
      } catch { return false; }
    };
    if (!(await add(candidate))) {
      pend.push(candidate);
      pendingCandidatesRef.current.set(remoteId, pend);
      return;
    }
    for (const c of pend) await add(c);
    pendingCandidatesRef.current.set(remoteId, []);
  };

  const retryAllIce = useCallback(async () => {
    const rid = roomIdRef.current || roomId;
    if (!rid || !socket) return;
    for (const [remoteId, pc] of peerConnectionsRef.current.entries()) {
      if (pc.signalingState === 'closed') continue;
      try {
        if (typeof pc.restartIce === 'function') pc.restartIce();
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-signal', { roomId: rid, targetSocketId: remoteId, type: 'offer', signal: pc.localDescription });
      } catch (e) {
        mmDebug('grp-ice-restart.err', remoteId, e);
      }
    }
    setToast('Reconnecting group video links…');
  }, [roomId, socket]);

  const sendMessage = (overrideText) => {
    const t = (overrideText ?? chatInput).trim();
    const rid = roomIdRef.current || roomId;
    if (!t || !socket || !rid) return;
    const payload = { roomId: rid, text: t };
    if (replyingTo) payload.replyTo = { id: replyingTo.id, text: replyingTo.text, nickname: replyingTo.nickname || 'Stranger' };
    socket.emit('send-message', payload);
    setChatInput('');
    setReplyingTo(null);
  };

  const apiBase = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const generateAiSpark = async () => {
    if (isAiGenerating) return;
    setIsAiGenerating(true);
    try {
      const res = await fetch(`${apiBase}/api/ai/spark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest: displayInterest })
      });
      if (res.ok) {
        const data = await res.json();
        setChatInput(data.spark || '');
      } else {
        setChatInput(ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)] || '');
      }
    } catch {
      setChatInput(ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)] || '');
    } finally {
      setIsAiGenerating(false);
    }
  };

  useEffect(() => {
    if (!socket) return;

    const onGroupJoined = (data) => {
      const rid = data.roomId || roomIdRef.current;
      if (rid) roomIdRef.current = rid;
      if (rid) {
        try {
          sessionStorage.setItem('mm_group_rejoin_room', rid);
          sessionStorage.setItem('mm_group_rejoin_nick', nickname || 'Anonymous');
        } catch { /* ignore */ }
      }
      if (data.interest) setDisplayInterest(data.interest);
      if (!hasJoinedRef.current) {
        hasJoinedRef.current = true;
        onJoined(rid);
        void ensureNotifyPermission();
        notifyIfBackground('Group video', 'You are connected to a Mana Mingle group room.');

        // Automated Group Presence Synthesis for Creators
        if (isCreator && rid) {
          setTimeout(() => {
            socket.emit('send-message', {
              roomId: rid,
              text: `🌟 Hey team! I'm @${nickname} (Verified Creator). Check out my world: ${window.location.origin}/creator/${nickname}`
            });
            setToast('Identity Broadcasted to Room');
          }, 2000);
        }
      }
      setParticipantCount(data.participantCount ?? 1);
      // Session stabilized
    };

    const onExistingPeers = (data) => {
      if (data.roomId) roomIdRef.current = data.roomId;
      setParticipantCount((data.peers?.length || 0) + 1);
      const peerList = data.peers || [];
      peerList.forEach((p) => {
        if (p.nickname) peerNicksRef.current.set(p.socketId, p.nickname);
        if (p.country) peerCountriesRef.current.set(p.socketId, p.country);
        if (p.isCreator) peerCreatorsRef.current.set(p.socketId, true);
      });
      // Add peers immediately (stream: null) so tile exists; ontrack will add stream
      setPeers((prev) => {
        const existingIds = new Set(prev.map((p) => p.socketId));
        const toAdd = peerList.filter((p) => !existingIds.has(p.socketId)).map((p) => ({
          socketId: p.socketId, stream: null, nickname: p.nickname || 'Anonymous', country: p.country, isCreator: !!p.isCreator
        }));
        return toAdd.length ? [...prev, ...toAdd] : prev;
      });
      if (localStreamRef.current) {
        peerList.forEach((p) => doOffer(p.socketId));
      } else {
        pendingPeersRef.current.push(...peerList.map((p) => p.socketId));
      }
    };

    const onHistory = (data) => {
      if (data.roomId === (roomIdRef.current || roomId)) setMessages(data.messages || []);
    };

    const onMsg = (data) => {
      if (data.roomId === (roomIdRef.current || roomId)) {
        setMessages((m) => [...m.slice(-100), data]);
        // Trigger spark
        const el = document.getElementById('group-video-chat-messages');
        if (el) {
          const rect = el.getBoundingClientRect();
          setSparks(prev => [...prev.slice(-20), { id: Date.now(), x: rect.left + rect.width / 2, y: rect.bottom - 100 }]);
        }
        if (data.socketId !== socket.id) {
          playMessageSound();
          if (isMobile && (!showChat || chatCollapsed)) setChatUnread((n) => n + 1);
        }
      }
    };

    const onUserJoined = (data) => {
      setParticipantCount(data.participantCount ?? 2);
      if (data.nickname) peerNicksRef.current.set(data.socketId, data.nickname);
      if (data.country) peerCountriesRef.current.set(data.socketId, data.country);
      if (data.isCreator) peerCreatorsRef.current.set(data.socketId, true);
      setMessages((m) => [...m, { id: `sys-${Date.now()}`, system: true, text: `${data.nickname || 'A stranger'} joined 👋` }]);
      playConnectSound();

      setPeers((prev) => {
        const isKnown = prev.some((p) => p.socketId === data.socketId);
        if (isKnown) return prev;
        return [...prev, { socketId: data.socketId, stream: null, nickname: data.nickname || 'Anonymous', country: data.country, isCreator: !!data.isCreator }];
      });

      // Joining peer runs offers to everyone in existing-peers; avoid duplicate offers here (mesh glare).
    };

    const onUserLeft = (data) => {
      const sid = data.socketId || data.userId;
      if (sid) {
        // Immediate removal for speed
        setPeers((p) => p.filter((x) => x.socketId !== sid));

        setParticipantCount((c) => {
          const next = Math.max(1, (data.participantCount ?? c) - 1);
          if (next === 1 && !isQueuing && !hasAutoLeftRef.current) {
            hasAutoLeftRef.current = true;
            setTimeout(() => { if (roomIdRef.current) handleLeaveRoom(); }, 2000);
          }
          return next;
        });

        const pc = peerConnectionsRef.current.get(sid);
        if (pc) {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.close();
          peerConnectionsRef.current.delete(sid);
        }
        const leavingNick = peerNicksRef.current.get(sid);
        if (leavingNick) setMessages((m) => [...m, { id: `sys-left-${Date.now()}`, system: true, text: `${leavingNick} left the room` }]);
        playDisconnectSound();
        cleanupAudioAnalyzer(sid);
      }
    };

    const onSignal = (data) => {
      const from = data.fromSocketId;
      if (!from || from === socket.id) return;
      if (data.fromNickname) peerNicksRef.current.set(from, data.fromNickname);
      if (data.fromCountry) peerCountriesRef.current.set(from, data.fromCountry);
      if (data.fromIsCreator !== undefined) {
        peerCreatorsRef.current.set(from, !!data.fromIsCreator);
        setPeers(prev => prev.map(p => p.socketId === from ? { ...p, isCreator: !!data.fromIsCreator } : p));
      }
      if (data.type === 'offer') {
        if (localStreamRef.current) {
          doAnswer(from, data.signal);
        } else {
          pendingOffersRef.current.push({ from, signal: data.signal });
        }
      } else if (data.type === 'answer') {
        const pc = peerConnectionsRef.current.get(from);
        if (pc) {
          if (pc.signalingState !== 'have-local-offer') return;
          try {
            pc.setRemoteDescription(new RTCSessionDescription(data.signal)).then(() => {
              const pend = pendingCandidatesRef.current.get(from) || [];
              pend.forEach((c) => {
                pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => { });
              });
              pendingCandidatesRef.current.set(from, []);
            });
          } catch (err) { console.error('setRemoteDescription err', err); }
        }
      } else if (data.type === 'ice-candidate' && data.signal) addIce(from, data.signal);
    };

    const onSystemMsg = (data) => setMessages((m) => [...m, { id: Date.now(), system: true, text: `📢 ADMIN: ${data.message}`, ts: Date.now() }]);
    const onRoomEndedByAdmin = () => {
      setToast('⚠️ This session was terminated by administrative protocol.');
      setTimeout(() => handleLeaveRoom(), 2000);
    };

    const onGroupRenamed = (data) => {
      setDisplayInterest(data.interest);
      setToast(`🏷️ Room renamed to #${data.interest} by ${data.nickname}`);
    };

    socket.on('group-joined', onGroupJoined);
    socket.on('existing-peers', onExistingPeers);
    socket.on('chat-history', onHistory);
    socket.on('chat-message', onMsg);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('webrtc-signal', onSignal);
    socket.on('system-announcement', onSystemMsg);
    socket.on('room-ended-by-admin', onRoomEndedByAdmin);
    socket.on('group-renamed', onGroupRenamed);
    const onSignalRateLimited = (data) => {
      const msg = data?.message || 'Too many WebRTC signals. Please wait.';
      setToast(typeof msg === 'string' ? `⏱️ ${msg}` : '⏱️ Rate limited — wait a few seconds.');
    };
    socket.on('signal-rate-limited', onSignalRateLimited);

    return () => {
      socket.off('group-joined', onGroupJoined);
      socket.off('existing-peers', onExistingPeers);
      socket.off('chat-history', onHistory);
      socket.off('chat-message', onMsg);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('webrtc-signal', onSignal);
      socket.off('system-announcement', onSystemMsg);
      socket.off('room-ended-by-admin', onRoomEndedByAdmin);
      socket.off('group-renamed', onGroupRenamed);
      socket.off('signal-rate-limited', onSignalRateLimited);
    };
  }, [socket, onJoined, handleLeaveRoom, nickname, isCreator]);

  useEffect(() => {
    if (socket) {
      socket.on('3d-emoji', (data) => {
        setActive3dEmoji(data);
        setTimeout(() => setActive3dEmoji(null), 3000);
      });
      socket.on('media-message', (data) => {
        setMessages(prev => [...prev.slice(-100), { ...data, media: true }]);
      });
      socket.on('error', (data) => {
        setToast(data?.message || 'Something went wrong.');
      });
      socket.on('room-full', (data) => {
        setToast(data?.message || 'This room is full. Try another hub or wait.');
        setTimeout(() => handleLeaveRoom(), 2500);
      });
      socket.on('waiting-in-group-queue', (data) => {
        setQueuePos(data.queuePosition);
      });
      socket.on('hand-raise', ({ socketId, raised }) => {
        setRemoteRaisedHands(prev => {
          const next = new Set(prev);
          if (raised) next.add(socketId);
          else next.delete(socketId);
          return next;
        });
      });
      socket.on('room-reaction', ({ socketId, emoji }) => {
        const id = Math.random().toString(36).substr(2, 9);
        const reaction = { id, socketId, emoji, x: 20 + Math.random() * 60, y: 50 + Math.random() * 30 };
        setLocalReactions(prev => [...prev, reaction]);
        setTimeout(() => setLocalReactions(prev => prev.filter(r => r.id !== id)), 4000);
      });
      socket.on('peer-recording-status', ({ recording }) => setPeerRecording(!!recording));
      socket.on('creator-tip-received', ({ fromNickname, amount }) => setToast(`💰 ${fromNickname} tipped you ${amount} coins!`));
      return () => {
        socket.off('3d-emoji');
        socket.off('media-message');
        socket.off('hand-raise');
        socket.off('room-reaction');
        socket.off('peer-recording-status');
        socket.off('creator-tip-received');
        socket.off('error');
        socket.off('room-full');
        socket.off('waiting-in-group-queue');
      };
    }
  }, [socket, handleLeaveRoom]);

  const toggleHandRaise = () => {
    const next = !handRaised;
    setHandRaised(next);
    if (socket && (roomIdRef.current || roomId)) {
      socket.emit('hand-raise', { roomId: roomIdRef.current || roomId, raised: next });
    }
  };

  const sendReaction = (emoji) => {
    if (socket && (roomIdRef.current || roomId)) {
      socket.emit('room-reaction', { roomId: roomIdRef.current || roomId, emoji });
    }
  };

  const copyRoomLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setToast('Meeting link copied to clipboard! 📋');
  };

  const generateRandomRoom = () => {
    const randomId = Math.random().toString(36).substring(2, 10);
    setJoinRoomIdInput(randomId);
    setToast('🎲 Random ID Generated!');
  };

  const send3dEmoji = (emoji) => {
    if (balance < 5) return alert('Need 5 coins!');
    if (socket && (roomIdRef.current || roomId)) {
      socket.emit('spend-coins', { amount: 5, reason: '3d-emoji' });
      socket.emit('send-3d-emoji', { roomId: roomIdRef.current || roomId, emoji });
      setShowEmojiPicker(false);
    }
  };

  const handleMediaUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const type = file.type.startsWith('video') ? 'video' : 'image';
    const cost = type === 'video' ? 15 : 10;
    if (balance < cost) return alert(`Need ${cost} coins!`);

    if (type === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = function () {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > 6) {
          return alert('Video must be 5 seconds or less!');
        }
        socket.emit('spend-coins', { amount: cost, reason: 'media-share' });
        processUpload(file);
      };
      video.src = URL.createObjectURL(file);
    } else {
      socket.emit('spend-coins', { amount: cost, reason: 'media-share' });
      processUpload(file);
    }
    e.target.value = '';
  };

  const processUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      socket.emit('send-media', { roomId: roomIdRef.current || roomId, type: file.type.startsWith('video') ? 'video' : 'image', content: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  const startScreenShare = async () => {
    if (balance < 50) return alert('Need 50 coins for Screen Share!');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];

      for (const pc of peerConnectionsRef.current.values()) {
        const sender = pc.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(track);
      }

      setIsScreenSharing(true);
      socket.emit('spend-coins', { amount: 50, reason: 'screenshare' });
      track.onended = () => {
        setIsScreenSharing(false);
        if (localStreamRef.current) {
          const localTrack = localStreamRef.current.getVideoTracks()[0];
          for (const pc of peerConnectionsRef.current.values()) {
            const sender = pc.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(localTrack);
          }
        }
      };
    } catch (e) {
      console.error(e);
    }
  };

  // AI Translation Hook
  useEffect(() => {
    if (!isTranslatorActive) return;
    const untranslated = messages.filter(m => !m.system && !m.translated && m.nickname !== nickname && m.text && m.text.length > 3);
    if (untranslated.length === 0) return;
    const target = untranslated[untranslated.length - 1];
    const apiBase = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const translateMsg = async () => {
      try {
        const res = await fetch(`${apiBase}/api/ai/translate`, {
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

  // Connection quality monitoring via getStats
  useEffect(() => {
    const interval = setInterval(async () => {
      const next = new Map();
      for (const [sid, pc] of peerConnectionsRef.current) {
        try {
          const stats = await pc.getStats();
          let rtt = 999;
          for (const r of stats.values()) {
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.roundTripTime) {
              rtt = Math.min(rtt, r.roundTripTime * 1000);
            }
          }
          let q = 'good';
          if (rtt > 300) q = 'poor';
          else if (rtt > 150) q = 'fair';
          next.set(sid, q);
        } catch { next.set(sid, 'fair'); }
      }
      setConnectionQuality(prev => {
        const same = prev.size === next.size && [...prev].every(([k, v]) => next.get(k) === v);
        return same ? prev : next;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [peers]);

  useEffect(() => () => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    audioAnalyzersRef.current.forEach(({ ctx }) => {
      try { ctx.close(); } catch (e) { }
    });
    audioAnalyzersRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
  }, []);

  // Keyboard shortcut - Escape to leave
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') handleLeaveRoom();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleLeaveRoom]);

  // Build adaptive tile array: [local, ...peers, ...empty/searching]
  const submitGroupReport = ({ reason, block }) => {
    const rid = roomIdRef.current || roomId;
    const target = reportTargetSid || peers.find((p) => p.socketId !== socket?.id)?.socketId;
    if (socket && rid) {
      socket.emit('report-user', {
        roomId: rid,
        reason: String(reason || 'unspecified'),
        ...(target ? { targetSocketId: target } : {}),
      });
      if (block && target) {
        socket.emit('block-user', { targetSocketId: target });
        setToast('User blocked');
      }
    }
    mmDebug('group-report', reason, block);
  };

  const reportParticipantPicker = peers.filter((p) => p.socketId !== socket?.id).length > 0 ? (
    <div className="mb-5">
      <label className="block text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">Participant</label>
      <select
        value={reportTargetSid}
        onChange={(e) => setReportTargetSid(e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-rose-500/40"
      >
        {peers.filter((p) => p.socketId !== socket?.id).map((p) => (
          <option key={p.socketId} value={p.socketId} className="bg-[#111]">
            {p.nickname || p.socketId?.slice(0, 8) || 'User'}
          </option>
        ))}
      </select>
    </div>
  ) : null;

  const desktopLayout = !isMobile;
  const roomTitle = (displayInterest || 'general').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const connLevel = p2pHealth === 'failed' ? 1 : p2pHealth !== 'good' ? 2 : [...connectionQuality.values()].some((q) => q === 'poor') ? 2 : 4;
  const connLabel = connLevel >= 4 ? 'Good Connection' : connLevel >= 2 ? 'Fair Connection' : 'Poor Connection';

  const statusBanners = (
    <>
      {reconnectingPeers.size > 0 && (
        <div className="shrink-0 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 border-b border-amber-500/20 text-amber-100" role="status">
          Some peer links are reconnecting — your session stays anonymous.
        </div>
      )}
      {p2pHealth !== 'good' && !isQueuing && (
        <div className={`shrink-0 px-3 py-2 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest border-b ${p2pHealth === 'failed' ? 'bg-rose-500/15 border-rose-500/25 text-rose-100' : 'bg-amber-500/10 border-amber-500/25 text-amber-100'}`} role="status">
          <span>{p2pHealth === 'failed' ? 'Group video link lost' : 'Unstable group network'}</span>
          <button type="button" onClick={retryAllIce} className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">Retry links</button>
        </div>
      )}
      <VideoSessionBanners
        showSafetyNudge={showSafetyNudge}
        onDismissSafety={dismissSafetyNudge}
        peerRecording={peerRecording}
        matchedInterests={[displayInterest].filter(Boolean)}
      />
      {PHASE_4_UNIQUE.structuredModes && unique.modePrompt && !isQueuing && (
        <div className="shrink-0 px-4 py-2 bg-[#76B900]/5 border-b border-[#76B900]/20 text-center">
          <p className="text-[11px] text-white/70 italic">&ldquo;{unique.modePrompt}&rdquo;</p>
        </div>
      )}
    </>
  );

  return (
    <div className={`h-[100dvh] min-h-0 flex flex-col text-white overflow-hidden font-sans select-none selection:bg-violet-500/25 ${desktopLayout ? 'mm-group-desk-shell' : 'mm-group-mobile-shell'}`}>

      {/* 3D EMOJI OVERLAY */}
      {active3dEmoji && (
        <div className="fixed inset-0 z-[1000] pointer-events-none flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="animate-3d-emoji-pop flex flex-col items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 blur-3xl bg-white/20 rounded-full" />
              <img src={active3dEmoji.emoji.url} className="w-48 h-48 relative drop-shadow-[0_0_40px_rgba(255,255,255,0.4)]" alt="3d" />
            </div>
            <div className="px-6 py-2.5 rounded-2xl bg-black/80 border border-white/10 backdrop-blur-xl shadow-2xl">
              <span className="text-sm font-black uppercase tracking-[0.2em]">{active3dEmoji.nickname} sent {active3dEmoji.emoji.char}</span>
            </div>
          </div>
        </div>
      )}

      {/* Lazy camera start — saves battery until user opts in */}
      {!localStreamReady && !mediaError && (
        <div className="absolute inset-0 z-[300] bg-[#0c0e1a]/95 flex flex-col items-center justify-center p-6 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Ready to join on video?</h2>
          <p className="text-sm text-white/60 mb-6 max-w-sm">Camera starts only when you tap below — saves battery and reduces device heat.</p>
          <button
            type="button"
            onClick={requestMediaAccess}
            className="min-h-[48px] px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm"
          >
            Start camera & microphone
          </button>
          <button type="button" onClick={handleLeaveRoom} className="mt-4 text-xs text-white/50 hover:text-white underline min-h-[44px]">Leave room</button>
        </div>
      )}

      {/* Media permission error overlay */}
      {mediaError && (
        <div className="absolute inset-0 z-[300] bg-[#0c0e1a]/98 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-500/40 flex items-center justify-center text-4xl mb-6">📷</div>
          <h2 className="text-xl font-bold text-white mb-2">Camera & Mic Access Needed</h2>
          <p className="text-sm text-white/70 mb-6 max-w-sm">{mediaError.message}</p>
          <button
            onClick={requestMediaAccess}
            className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0c0e1a]"
          >
            Grant Access
          </button>
          <button onClick={handleLeaveRoom} className="mt-4 text-xs text-white/50 hover:text-white underline">Cancel & Leave</button>
        </div>
      )}

      {desktopLayout ? (
        <>
          <header className="mm-group-desk-header">
            <div className="mm-group-desk-header__left">
              <div className="mm-group-desk-header__room">
                <span className="mm-group-desk-header__room-icon" aria-hidden>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </span>
                <h1 className="mm-group-desk-header__title">Room: {roomTitle}</h1>
              </div>
              <div className="mm-group-desk-header__meta">
                <span className="mm-group-desk-header__meta-item">
                  <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  {participantCount} Participants
                </span>
                <span className="mm-group-desk-header__meta-item">
                  <DeskSignalBars level={connLevel} />
                  {connLabel}
                </span>
              </div>
            </div>
            <div className="mm-group-desk-header__actions">
              {isCreator && (
                <CoinBadge balance={balance} streak={streak} canClaim={canClaim} nextClaim={nextClaim ?? 0} claimCoins={claimCoins} registered={registered} currentActiveSeconds={currentActiveSeconds} isCreator={isCreator} />
              )}
              <button type="button" className="mm-group-desk-header__btn" onClick={() => setShowReportModal(true)}>
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                Safety
              </button>
              <button type="button" className="mm-group-desk-header__btn" onClick={() => setShowDevicePicker(true)}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Settings
              </button>
              <button type="button" className="mm-desk-icon-btn" onClick={() => setShowMoreMenu(true)} title="More" aria-label="More">⋯</button>
            </div>
          </header>

          {statusBanners}

          <main className="mm-group-desk-body">
            <div className="mm-group-desk-stage">
              {isRecording && <RecordingIndicator />}
              <FloatingVideoReactions reactions={localReactions.map((r) => ({ id: r.id, emoji: r.emoji, x: r.x, y: r.y }))} />
              <div className="mm-group-desk-grid">
                <VideoTile
                  deskStyle
                  isMe
                  stream={localStreamRef.current}
                  label={nickname || 'Anonymous'}
                  flag={countryToFlag(myCountry)}
                  isCreator={isCreator}
                  isActiveSpeaker={activeSpeakerId === 'local'}
                  handRaised={handRaised}
                  isMuted={muted}
                />
                {peers.slice(0, 3).map((p) => (
                  <VideoTile
                    key={p.socketId}
                    deskStyle
                    stream={p.stream}
                    label={p.nickname}
                    flag={countryToFlag(p.country)}
                    isCreator={p.isCreator}
                    isActiveSpeaker={activeSpeakerId === p.socketId}
                    quality={connectionQuality.get(p.socketId) || 'good'}
                    handRaised={remoteRaisedHands.has(p.socketId)}
                  />
                ))}
                {Array.from({ length: Math.max(0, 3 - peers.length) }).map((_, i) => (
                  <VideoTile key={`empty-${i}`} deskStyle isEmpty />
                ))}
              </div>
            </div>

            <aside ref={chatPanelRef} className="mm-group-desk-chat">
              <div className="mm-group-desk-chat__head">
                <span className="mm-group-desk-chat__head-title">Group Chat</span>
                <div className="mm-group-desk-chat__head-actions">
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {participantCount}
                  </span>
                  <button type="button" onClick={generateAiSpark} disabled={isAiGenerating} className="opacity-60 hover:opacity-100" title="Icebreaker">📌</button>
                </div>
              </div>
              <div id="group-video-chat-messages" className="mm-group-desk-chat__messages custom-scrollbar">
                {messages.map((m, i) => (
                  <GroupDeskChatRow key={m.id || i} m={m} isMe={!m.system && m.socketId === socket?.id} />
                ))}
                <div ref={chatEndRef} />
              </div>
              {PHASE_3_PRO.miniChatGames && (roomIdRef.current || roomId) && (
                <div className="px-3 pb-2">
                  <MiniChatGamePanel onSendPrompt={(text) => { setChatInput(text); sendMessage(text); }} />
                </div>
              )}
              <div className="mm-group-desk-chat__input-row">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  className="mm-group-desk-chat__input"
                  placeholder="Type a message..."
                />
                <button type="button" className="mm-group-desk-chat__emoji" onClick={() => setShowEmojiPicker((v) => !v)} aria-label="Emoji">😊</button>
                <button type="button" onClick={sendMessage} className="mm-group-desk-chat__send" aria-label="Send">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                </button>
              </div>
            </aside>
          </main>

          <footer className="mm-group-desk-toolbar">
            <button type="button" className={`mm-group-desk-tool ${muted ? 'mm-group-desk-tool--off' : ''}`} onClick={toggleMute}>
              <TileMicIcon muted={muted} />
              Mic
              <span className="mm-group-desk-tool__chev">▾</span>
            </button>
            <button type="button" className={`mm-group-desk-tool ${cameraOff ? 'mm-group-desk-tool--off' : ''}`} onClick={toggleCamera}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Camera
              <span className="mm-group-desk-tool__chev">▾</span>
            </button>
            <button type="button" className={`mm-group-desk-tool ${isScreenSharing ? 'mm-group-desk-tool--active' : ''}`} onClick={startScreenShare}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Share
              <span className="mm-group-desk-tool__chev">▾</span>
            </button>
            <button type="button" className="mm-group-desk-tool mm-group-desk-tool--active" onClick={() => chatPanelRef.current?.querySelector('.mm-group-desk-chat__input')?.focus()}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Chat
              {chatUnread > 0 && <span className="mm-group-desk-tool__dot" />}
            </button>
            <button type="button" className="mm-group-desk-tool" title={`${participantCount} participants`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              Participants
              <span className="mm-group-desk-tool__badge">{participantCount}</span>
            </button>
            <button type="button" className="mm-group-desk-tool mm-group-desk-tool--leave" onClick={handleLeaveRoom}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
              Leave
            </button>
            <button
              type="button"
              className={`mm-group-desk-tool mm-group-desk-tool--rec ${isRecording ? 'mm-group-desk-tool--rec-on' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-rose-500 animate-pulse' : 'border-2 border-current'}`} />
              Record
            </button>
          </footer>
        </>
      ) : (
        <>
          <header className="mm-group-mobile-header">
            <button type="button" className="mm-group-mobile-header__back" onClick={handleLeaveRoom} aria-label="Leave room">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="mm-group-mobile-header__brand">
              <img src="/apple-touch-icon.png" alt="" className="mm-group-mobile-header__logo" />
              <div className="mm-group-mobile-header__titles">
                <span className="mm-group-mobile-header__name">ManaMingle</span>
                <span className="mm-group-mobile-header__sub">2×2 Group Video Chat</span>
              </div>
            </div>
            <div className="mm-group-mobile-header__actions">
              <button type="button" className="mm-group-mobile-header__icon" onClick={() => setShowReportModal(true)} aria-label="Safety">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </button>
              <button type="button" className="mm-group-mobile-header__icon" onClick={() => setShowMoreMenu(true)} aria-label="More">⋯</button>
            </div>
            <div className="mm-group-mobile-header__status">
              <span className="mm-desk-dot mm-desk-dot--green" aria-hidden />
              Connected
              <span className="mm-group-mobile-header__timer">{formatTimerLong(connectedSecs)}</span>
            </div>
          </header>

          {reconnectingPeers.size > 0 && (
            <div className="shrink-0 px-3 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest bg-amber-500/10 border-b border-amber-500/20 text-amber-100" role="status">
              Reconnecting peers…
            </div>
          )}
          {p2pHealth !== 'good' && !isQueuing && (
            <div className={`shrink-0 px-3 py-1.5 flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-widest border-b ${p2pHealth === 'failed' ? 'bg-rose-500/15 border-rose-500/25 text-rose-100' : 'bg-amber-500/10 border-amber-500/25 text-amber-100'}`} role="status">
              <span>{p2pHealth === 'failed' ? 'Link lost' : 'Unstable network'}</span>
              <button type="button" onClick={retryAllIce} className="px-2 py-0.5 rounded bg-white/15">Retry</button>
            </div>
          )}

          <main className="mm-group-mobile-main">
            <div className="mm-group-mobile-grid">
              {isRecording && <RecordingIndicator />}
              <FloatingVideoReactions reactions={localReactions.map((r) => ({ id: r.id, emoji: r.emoji, x: r.x, y: r.y }))} />
              <VideoTile
                deskStyle
                hideTileMic
                isMe
                stream={localStreamRef.current}
                label={nickname || 'Anonymous'}
                flag={countryToFlag(myCountry)}
                isCreator={isCreator}
                isActiveSpeaker={activeSpeakerId === 'local'}
                handRaised={handRaised}
                isMuted={muted}
              />
              {peers.slice(0, 3).map((p) => (
                <VideoTile
                  key={p.socketId}
                  deskStyle
                  hideTileMic
                  stream={p.stream}
                  label={p.nickname}
                  flag={countryToFlag(p.country)}
                  isCreator={p.isCreator}
                  isActiveSpeaker={activeSpeakerId === p.socketId}
                  quality={connectionQuality.get(p.socketId) || 'good'}
                  handRaised={remoteRaisedHands.has(p.socketId)}
                />
              ))}
              {Array.from({ length: Math.max(0, 3 - peers.length) }).map((_, i) => (
                <VideoTile key={`mob-empty-${i}`} deskStyle hideTileMic isEmpty />
              ))}
            </div>

            <div ref={chatPanelRef} className={`mm-group-mobile-chat ${chatCollapsed ? 'mm-group-mobile-chat--collapsed' : ''}`}>
              <button
                type="button"
                className="mm-group-mobile-chat__head"
                onClick={() => setChatCollapsed((c) => !c)}
                aria-expanded={!chatCollapsed}
              >
                <span className="mm-group-mobile-chat__head-left">
                  <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  Group Chat
                  <span className="mm-group-mobile-chat__count">
                    <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {participantCount}
                  </span>
                  {chatUnread > 0 && <span className="mm-group-mobile-chat__unread">{chatUnread > 9 ? '9+' : chatUnread}</span>}
                </span>
                <span className={`mm-group-mobile-chat__chev ${chatCollapsed ? '' : 'mm-group-mobile-chat__chev--open'}`}>⌃</span>
              </button>

              {!chatCollapsed && (
                <>
                  <div id="group-video-chat-messages" className="mm-group-mobile-chat__messages custom-scrollbar">
                    {messages.map((m, i) => (
                      <GroupDeskChatRow key={m.id || i} m={m} isMe={!m.system && m.socketId === socket?.id} />
                    ))}
                    {strangerTyping && (
                      <div className="mm-group-mobile-chat__typing">
                        Someone is typing
                        <span className="mm-desk-chat__typing-dots"><span /><span /><span /></span>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  {PHASE_3_PRO.miniChatGames && (roomIdRef.current || roomId) && (
                    <div className="px-3 pb-1">
                      <MiniChatGamePanel onSendPrompt={(text) => { setChatInput(text); sendMessage(text); }} />
                    </div>
                  )}
                  <div className="mm-group-mobile-chat__input-row">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      className="mm-group-mobile-chat__input"
                      placeholder="Type a message..."
                    />
                    <button type="button" className="mm-group-mobile-chat__emoji" onClick={() => setShowEmojiPicker((v) => !v)} aria-label="Emoji">😊</button>
                    <button type="button" onClick={sendMessage} className="mm-group-mobile-chat__send" aria-label="Send">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          </main>

          <footer className="mm-mobile-bar">
            <button type="button" onClick={toggleMute} className={`mm-mobile-bar__item ${muted ? 'mm-mobile-bar__item--off' : ''}`}>
              <span className="mm-mobile-bar__icon mm-mobile-bar__icon--green relative">
                <TileMicIcon muted={muted} />
                {!muted && <span className="mm-group-mobile-bar__dot" />}
              </span>
              <span className="mm-mobile-bar__label">Mic</span>
            </button>
            <button type="button" onClick={toggleCamera} className={`mm-mobile-bar__item ${cameraOff ? 'mm-mobile-bar__item--off' : ''}`}>
              <span className="mm-mobile-bar__icon mm-mobile-bar__icon--green relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                {!cameraOff && <span className="mm-group-mobile-bar__dot" />}
              </span>
              <span className="mm-mobile-bar__label">Camera</span>
            </button>
            <button
              type="button"
              onClick={() => { setChatCollapsed(false); setShowChat(true); chatPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}
              className={`mm-mobile-bar__item ${!chatCollapsed ? 'mm-mobile-bar__item--active' : ''}`}
            >
              <span className="mm-mobile-bar__icon mm-mobile-bar__icon--blue relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                {chatUnread > 0 && <span className="mm-mobile-bar__badge">{chatUnread > 9 ? '9+' : chatUnread}</span>}
              </span>
              <span className="mm-mobile-bar__label">Chat</span>
            </button>
            <button type="button" className="mm-mobile-bar__item" title={`${participantCount} participants`}>
              <span className="mm-mobile-bar__icon mm-mobile-bar__icon--blue relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                <span className="mm-mobile-bar__badge" style={{ background: '#3b82f6' }}>{participantCount}</span>
              </span>
              <span className="mm-mobile-bar__label">Participants</span>
            </button>
            <button type="button" onClick={handleLeaveRoom} className="mm-mobile-bar__item">
              <span className="mm-mobile-bar__icon mm-mobile-bar__icon--red">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
              </span>
              <span className="mm-mobile-bar__label">End</span>
            </button>
          </footer>

          {isCreator && (
            <div className="mm-group-mobile-creator-bar">
              {EMOJIS_3D.slice(0, 4).map((e) => (
                <button
                  key={e.char}
                  type="button"
                  onClick={() => {
                    if (balance < 5) return alert('Requires 5 Mana (Coins)');
                    socket.emit('send-3d-emoji', { emoji: e, roomId: roomIdProp || roomIdRef.current });
                  }}
                  className="mm-group-mobile-creator-bar__btn"
                  title={`${e.char} (5 Mana)`}
                >
                  <img src={e.url} className="w-6 h-6" alt={e.char} />
                </button>
              ))}
            </div>
          )}
        </>
      )}

  {/* MINIMAL RENAME OVERLAY — Inline focus */ }
  {
    showRenameModal && (
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[260] w-72 bg-[#1a1d21]/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-5 shadow-2xl animate-fade-in flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h5 className="text-[10px] font-black uppercase tracking-widest text-amber-500">Specialize Topic (25c)</h5>
          <span className="text-[8px] font-bold text-white/20">ENTER TO APPLY</span>
        </div>
        <input
          autoFocus
          type="text"
          maxLength={25}
          value={renameInput}
          onChange={(e) => setRenameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (balance < 25) return alert("Insufficient Mana");
              socket.emit('rename-group-room', { roomId: roomIdProp || roomIdRef.current, newInterest: renameInput.trim() });
              setShowRenameModal(false);
            }
            if (e.key === 'Escape') setShowRenameModal(false);
          }}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-amber-500 outline-none transition-all"
          placeholder="e.g. Gaming, Tech..."
        />
        <div className="flex gap-2">
          <button onClick={() => setShowRenameModal(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/50 hover:bg-white/10">Back</button>
          <button
            onClick={() => {
              if (balance < 25) return alert("Insufficient Mana");
              socket.emit('rename-group-room', { roomId: roomIdProp || roomIdRef.current, newInterest: renameInput.trim() });
              setShowRenameModal(false);
            }}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20"
          >Apply Now</button>
        </div>
      </div>
    )
  }

      <NvidiaCopilotToast
        prompt={unique.copilotPrompt}
        onUse={() => unique.applyCopilotToInput(setChatInput)}
        onDismiss={unique.dismissCopilot}
      />

      <ReportSafetyModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={submitGroupReport}
        prepend={reportParticipantPicker}
        title="Report (anonymous)"
      />

      <ConversationRatingModal open={showRating} onClose={() => { setShowRating(false); finishLeaveRoom(); }} onRate={handleRateConversation} title="Rate this pod?" />
      <VideoMoreSheet
        open={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        isMobile={isMobile}
        isTranslatorActive={isTranslatorActive}
        onToggleTranslate={() => setIsTranslatorActive((v) => !v)}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={startScreenShare}
        onFlipCamera={() => setFacingMode((p) => (p === 'user' ? 'environment' : 'user'))}
        onOpenDevices={() => setShowDevicePicker(true)}
        onIcebreaker={generateAiSpark}
        onCopyLink={copyRoomLink}
        onHandRaise={toggleHandRaise}
        handRaised={handRaised}
        onTip={() => setShowTipModal(true)}
        onHidePip={() => setPipHidden((h) => !h)}
        pipHidden={pipHidden}
        onCyclePipSize={cyclePipSize}
        pipSize={pipSize}
        showGames
        balance={balance}
        onRoomBoost={() => {
          if (balance < 25) return alert('Need 25 coins');
          socket?.emit('spend-coins', { amount: 25, reason: 'room-boost' });
          setToast('Pod boosted in public room browser!');
        }}
        peerOptions={peers.map((p) => ({ id: p.socketId, label: p.nickname || 'User' }))}
        onPinPeer={(id) => setPinnedId(id)}
        onPinLocal
        pinnedId={pinnedId}
      />
      <DevicePickerSheet
        open={showDevicePicker}
        onClose={() => setShowDevicePicker(false)}
        videoDevices={videoDevices}
        audioDevices={audioDevices}
        selectedVideoId=""
        selectedAudioId=""
        onSelectVideo={() => setToast('Switch camera in system settings or flip button')}
        onSelectAudio={() => setToast('Audio device saved for next session')}
      />
      <TipCreatorModal
        open={showTipModal}
        onClose={() => setShowTipModal(false)}
        onTip={(amount) => sendTip(amount, peers.find((p) => p.isCreator)?.socketId)}
        balance={balance}
        creatorName={peers.find((p) => p.isCreator)?.nickname}
      />

      {toast && (
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[200] max-w-[90vw] px-4 py-3 rounded-2xl bg-black/90 border border-white/10 text-xs font-bold text-white shadow-2xl animate-fade-in-up">
          {toast}
        </div>
      )}
    </div>
  );
}

function PiPLocalVideo({ stream, cameraBlur, mirrorSelf = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  if (!stream) return <div className="w-full h-full flex items-center justify-center bg-indigo-500/20 text-2xl">🙋</div>;
  return (
    <div className="relative w-full h-full">
      <video ref={ref} autoPlay muted playsInline className={`w-full h-full object-cover ${mirrorSelf ? '-scale-x-100' : ''}`} style={cameraBlur ? { filter: 'blur(15px)' } : {}} />
      <div className="absolute top-2 left-2 z-50 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      </div>
      <div className="absolute bottom-2 right-2 z-50 text-[10px] font-bold text-white/70">You</div>
    </div>
  );
}

function RemoteVideoTile({ stream, socketId }) {
  const ref = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasVideo, setHasVideo] = useState(true);
  const playCountRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    const videoTracks = stream.getVideoTracks();
    const hasActiveVideo = videoTracks.some(t => t.readyState === 'live' && t.enabled);
    setHasVideo(videoTracks.length > 0 && hasActiveVideo);

    if (!hasActiveVideo && videoTracks.length === 0) {
      setHasVideo(false);
      return;
    }
    if (!hasActiveVideo) {
      const check = () => {
        if (stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)) {
          setHasVideo(true);
          el.srcObject = stream;
          el.play().catch(() => { });
        } else setTimeout(check, 300);
      };
      setTimeout(check, 300);
      return;
    }
    el.srcObject = stream;
    const tryPlay = async () => {
      try {
        if (el.paused) { await el.play(); setIsPlaying(true); }
      } catch (e) {
        if (playCountRef.current < 5) { playCountRef.current++; setTimeout(tryPlay, 500); }
      }
    };
    tryPlay();
    const onUnmute = () => { setIsPlaying(true); tryPlay(); };
    stream.getTracks().forEach((t) => { t.enabled = true; t.addEventListener('unmute', onUnmute); });
    return () => stream.getTracks().forEach((t) => t.removeEventListener('unmute', onUnmute));
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="absolute inset-0 w-full h-full bg-[#0c0e1a] overflow-hidden">
      <video ref={ref} autoPlay playsInline className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${isPlaying && hasVideo ? 'opacity-100' : 'opacity-0'}`} />

      {/* WATERMARKS & AI STATUS */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-3">
        <div className="ai-status-dot" />
        <div className="glass-watermark">AI MONITOR ACTIVE</div>
      </div>
      <div className="absolute bottom-4 right-4 z-50">
        <div className="glass-watermark">ManaMingle</div>
      </div>

      {(!isPlaying || !hasVideo) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-indigo-500/10">
          {!isPlaying && hasVideo ? (
            <>
              <div className="w-10 h-10 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
              <p className="text-[8px] font-black uppercase tracking-widest text-indigo-400/50">Connecting...</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-indigo-500/20 border-2 border-indigo-500/40 flex items-center justify-center text-3xl sm:text-4xl">👤</div>
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Camera off</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
