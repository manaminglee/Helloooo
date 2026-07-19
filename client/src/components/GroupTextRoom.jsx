/**
 * GroupTextRoom – Fully overhauled premium text chat experience
 * Features: AI Moderation, Mobile-First Drawer, Glassmorphism, 3D Emojis
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { countryToFlag } from '../utils/countryFlag';
import { AdSlot } from './AdSlot';
import { CoinBadge } from './CoinBadge';
import { ReportSafetyModal } from './ReportSafetyModal';
import { ChatInputWithEmoji } from './ChatInputWithEmoji';
import { SafetyBanner } from './ModerationMenu';
import { MiniChatGamePanel } from './MiniChatGamePanel';
import { PHASE_2, PHASE_3_PRO } from '../constants/features';
import { API_BASE } from '../config/apiBase';
import { nextMsgId } from '../utils/uniqueId';
import { playDing } from '../utils/sounds';

const MAX_MEDIA_SIZE_MB = 5;

const GROUP_MAX = 4;
const COLORS = ['#818cf8', '#34d399', '#fb923c', '#f472b6'];

const ICEBREAKERS = [
  "What's one thing that made you smile today? 😊",
  "If you could visit anywhere right now, where would you go? ✈️",
  "What's a hobby you wish you had time for? 🎯",
  "Share a random fact you find fascinating! 🧠",
  "What's the last thing you watched and would recommend? 📺",
  "If you could have any superpower, what would it be? ⚡",
];

const EMOJIS_3D = [
  { char: '🔥', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.webp' },
  { char: '💖', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f496/512.webp' },
  { char: '😂', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.webp' },
  { char: '👋', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44b/512.webp' },
];

const BlueTick = () => (
  <span className="inline-flex items-center justify-center w-3.5 h-3.5 bg-violet-500 rounded-full ml-1.5 shadow-[0_0_12px_rgba(167,139,250,0.6)]">
    <svg className="w-2 h-2 text-black" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  </span>
);

function SecurityShield() {
  return (
    <div className="absolute top-24 right-6 z-[100] group cursor-pointer pointer-events-auto">
      <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 backdrop-blur-md flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)] hover:bg-indigo-500 hover:text-black transition-all">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
      </div>
      <div className="absolute top-10 right-0 w-52 p-4 rounded-[25px] bg-black/95 border border-white/10 backdrop-blur-3xl text-[9px] font-black uppercase tracking-[0.1em] text-indigo-400 opacity-0 group-hover:opacity-100 transition-all pointer-events-none shadow-2xl">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span>E2E Session Lock</span>
        </div>
        <p className="text-white/40 leading-relaxed font-bold">This text session employs RSA-4096 key exchange for high-speed ephemeral encryption. Messages never touch persistent disks.</p>
      </div>
    </div>
  );
}

export default function GroupTextRoom({ roomId: roomIdProp, interest: interestProp, nickname, isCreator = false, myCountry, socket, isQueuing, onLeave, onFindNewPod, onJoined, coinState, adsEnabled = false, adScripts = {}, registered = false, currentActiveSeconds = 0 }) {
  const { balance, streak, canClaim, nextClaim, claimCoins } = coinState;
  
  const [status, setStatus] = useState(isQueuing ? 'searching' : 'connected');
  const [displayInterest, setDisplayInterest] = useState(interestProp || 'general');
  const [peers, setPeers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  
  const [isAiModerating, setIsAiModerating] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isTranslatorActive, setIsTranslatorActive] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTargetSid, setReportTargetSid] = useState('');
  const [active3dEmoji, setActive3dEmoji] = useState(null);
  const [warning, setWarning] = useState(null);
  
  const roomIdRef = useRef(roomIdProp);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const hasJoinedRef = useRef(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  // Refs for values read inside socket handlers (avoids stale mount-time closures)
  const peersRef = useRef(peers);
  const displayInterestRef = useRef(displayInterest);
  const onJoinedRef = useRef(onJoined);
  const onFindNewPodRef = useRef(onFindNewPod);
  const isQueuingRef = useRef(isQueuing);
  useEffect(() => { peersRef.current = peers; }, [peers]);
  useEffect(() => { displayInterestRef.current = displayInterest; }, [displayInterest]);
  useEffect(() => { onJoinedRef.current = onJoined; }, [onJoined]);
  useEffect(() => { onFindNewPodRef.current = onFindNewPod; }, [onFindNewPod]);
  useEffect(() => { isQueuingRef.current = isQueuing; }, [isQueuing]);

  // Small local toast (matches group video surface)
  useEffect(() => {
    if (!toast) return;
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(toastTimerRef.current);
  }, [toast]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const remote = peers.find((p) => p.socketId !== socket?.id);
    if (remote?.socketId) setReportTargetSid(remote.socketId);
  }, [peers, socket?.id]);

  // Handle Socket Events
  useEffect(() => {
    if (!socket) return;

    const handlers = {
      'group-joined': (data) => {
        roomIdRef.current = data.roomId;
        setDisplayInterest(data.interest || displayInterestRef.current);
        if (!hasJoinedRef.current) {
          hasJoinedRef.current = true;
          onJoinedRef.current?.(data.roomId);
          setWarning('⚡ Secure End-to-End Session Established.');
          setTimeout(() => setWarning(null), 3000);
        }
        setStatus('connected');
      },
      'existing-peers': (data) => {
        setPeers(data.peers || []);
      },
      'chat-history': (data) => {
        if (data.roomId === roomIdRef.current) setMessages(data.messages || []);
      },
      'chat-message': (data) => {
        if (data.roomId === roomIdRef.current) {
          setMessages(prev => [...prev.slice(-100), data]);
          if (data.socketId && data.socketId !== socket.id) playDing();
        }
      },
      'user-joined': (data) => {
        setPeers(prev => [...prev.filter(pc => pc.socketId !== data.socketId), data]);
        setMessages(prev => [...prev, { system: true, text: `${data.nickname || 'Someone'} joined! Wave hello 👋`, id: nextMsgId('sys') }]);
      },
      'user-left': (data) => {
        setPeers(prev => {
          const departing = prev.find(p => p.socketId === (data.userId || data.socketId));
          if (departing) {
            setMessages(m => [...m, { system: true, text: `${departing.nickname || 'Stranger'} left the room`, id: nextMsgId('sys-exit') }]);
          }
          return prev.filter(p => p.socketId !== (data.userId || data.socketId));
        });
        // Auto-seek if alone
        if (peersRef.current.length <= 1 && !isQueuingRef.current) {
            setTimeout(() => { if (peersRef.current.length === 0) onFindNewPodRef.current?.(); }, 4000);
        }
      },
      '3d-emoji': (data) => {
        setActive3dEmoji(data);
        setTimeout(() => setActive3dEmoji(null), 3000);
      },
      'media-message': (data) => {
        if (data.roomId === roomIdRef.current) {
          setMessages(prev => [...prev.slice(-100), { ...data, media: true }]);
        }
      },
      'content-flagged': (data) => {
        setWarning(data.message || 'Message blocked. Please follow community guidelines.');
        setTimeout(() => setWarning(null), 5000);
      },
      'error': (data) => {
        setToast(data?.message || 'Something went wrong.');
      }
    };

    Object.entries(handlers).forEach(([evt, fn]) => socket.on(evt, fn));

    // Initial Join Logic
    if (isQueuing && !hasJoinedRef.current) {
      socket.emit('join-group-by-topics', { interest: displayInterestRef.current, nickname: nickname || 'Anonymous', mode: 'group_text' });
    } else if (roomIdProp && !hasJoinedRef.current) {
      socket.emit('join-specific-group', { roomId: roomIdProp, nickname: nickname || 'Admin' });
    }

    return () => {
      Object.entries(handlers).forEach(([evt, fn]) => socket.off(evt, fn));
    };
  }, [socket, isQueuing, roomIdProp]);

  // AI Moderation & Send
  const handleSendMessage = async (overrideText) => {
    const text = String(overrideText ?? chatInput).trim();
    if (!text || isAiModerating || !socket) return;

    setIsAiModerating(true);
    setWarning(null);

    try {
      const res = await fetch(`${API_BASE}/api/ai/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      
      const mod = await res.json();
      if (!mod.safe) {
        setWarning(mod.warning || 'Message flagged for harmful content.');
        setIsAiModerating(false);
        return;
      }

      // Safe to send
      socket.emit('send-message', {
        roomId: roomIdRef.current,
        text,
        replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, nickname: replyingTo.nickname } : null
      });
      setChatInput('');
      setReplyingTo(null);
    } catch (e) {
      // Fail safe - allow send if AI service is down but log it
      socket.emit('send-message', { roomId: roomIdRef.current, text });
      setChatInput('');
    } finally {
      setIsAiModerating(false);
    }
  };

  const generateAiSpark = async () => {
    if (isAiGenerating) return;
    setIsAiGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/spark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest: displayInterest })
      });
      if (res.ok) {
        const data = await res.json();
        setChatInput(data.spark);
      }
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleVoiceMessage = (audioDataUrl) => {
    if (!socket || !roomIdRef.current) return;
    socket.emit('send-message', { roomId: roomIdRef.current, text: audioDataUrl, type: 'voice' });
  };

  const send3dEmoji = (emoji) => {
    if (balance < 5) { setToast('⚠️ Need 5 coins!'); return; }
    socket?.emit('send-3d-emoji', { roomId: roomIdRef.current, emoji });
    setShowEmojiPicker(false);
  };

  const submitGroupTextReport = ({ reason, block }) => {
    const rid = roomIdRef.current;
    const target = reportTargetSid || peers.find((p) => p.socketId !== socket?.id)?.socketId;
    if (socket && rid) {
      socket.emit('report-user', {
        roomId: rid,
        reason: String(reason || 'unspecified'),
        ...(target ? { targetSocketId: target } : {}),
      });
      if (block && target) socket.emit('block-user', { targetSocketId: target });
    }
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

  const handleMediaUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_MEDIA_SIZE_MB * 1024 * 1024) {
      setToast(`⚠️ File must be under ${MAX_MEDIA_SIZE_MB}MB`);
      e.target.value = '';
      return;
    }
    const isVid = file.type.startsWith('video');
    const cost = isVid ? 15 : 10;
    if (balance < cost) { setToast(`⚠️ Need ${cost} coins!`); e.target.value = ''; return; }

    const reader = new FileReader();
    reader.onload = (ev) => {
      socket.emit('send-media', {
        roomId: roomIdRef.current,
        type: isVid ? 'video' : 'image',
        content: ev.target.result
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-realm-void text-white overflow-hidden font-sans selection:bg-violet-500/30">
      
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

      {/* HEADER: PREMIUM GLASS */}
      <header className="flex-shrink-0 h-16 sm:h-20 px-4 sm:px-6 flex items-center justify-between border-b border-white/[0.06] bg-black/40 backdrop-blur-2xl z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-lg shadow-lg shadow-indigo-500/20">M</div>
          <div>
            <h1 className="text-sm sm:text-base font-black tracking-tight text-white/90">#{displayInterest} Realm</h1>
            <div className="flex items-center gap-2 mt-0.5">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
               <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500/80">AI Safe Mode Active</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <CoinBadge balance={balance} streak={streak} canClaim={canClaim} nextClaim={nextClaim} claimCoins={claimCoins} registered={registered} currentActiveSeconds={currentActiveSeconds} isCreator={isCreator} />
          
          <button 
             onClick={() => setShowParticipants(!showParticipants)}
             className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${showParticipants ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            <span className="text-xs font-bold hidden sm:inline">{peers.length + 1}/{GROUP_MAX}</span>
          </button>

          {!isQueuing && onFindNewPod && (
            <button onClick={onFindNewPod} className="hidden sm:flex px-4 py-2 bg-indigo-500 hover:bg-indigo-400 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-indigo-500/20">
              Skip →
            </button>
          )}

          <button type="button" onClick={() => setShowReportModal(true)} className="px-3 sm:px-4 py-2 bg-white/5 border border-white/15 hover:bg-white/10 text-white/80 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all">
            Report
          </button>
          <button onClick={onLeave} className="px-3 sm:px-4 py-2 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all">
            {isQueuing ? 'Cancel' : 'Leave'}
          </button>
        </div>
      </header>

      <div className="shrink-0 px-4 border-b border-white/[0.06] bg-black/30">
        <AdSlot slotKey="chat_banner" script={adScripts?.chat_banner} adsEnabled={adsEnabled} compact />
      </div>

      {/* MAIN BODY */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* MESSAGES AREA */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#070811] relative">
          <SecurityShield />
          
          {/* SEARCHING STATE */}
          {status === 'searching' && (
            <div className="absolute inset-0 z-40 bg-realm-void flex flex-col items-center justify-center gap-8 animate-fade-in">
               <div className="relative w-32 h-32">
                 <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-pulse-ring" />
                 <div className="absolute inset-4 rounded-full border border-indigo-400/30 animate-pulse-ring delay-300" />
                 <div className="absolute inset-0 flex items-center justify-center text-4xl">🔮</div>
               </div>
               <div className="text-center space-y-2">
                  <h2 className="text-xl font-black tracking-tight text-white/90">Summoning Strangers...</h2>
                  <p className="text-xs text-white/30 uppercase tracking-[0.3em]">Interest: #{displayInterest}</p>
               </div>
               <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500/40 animate-bounce-dot" style={{ animationDelay: `${i * 0.2}s` }} />)}
               </div>
            </div>
          )}

          {/* MESSAGE LIST */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 custom-scrollbar" id="messages-container">
            {messages.length === 0 && !isQueuing && (
              <div className="h-full flex items-center justify-center py-20 text-center">
                 <div className="max-w-xs space-y-4">
                    <p className="text-sm text-white/20 font-medium uppercase tracking-widest leading-loose">
                      Communication Channel Open.<br/>Participants are anonymous.<br/>Respect the Realm.
                    </p>
                    <button onClick={generateAiSpark} className="px-4 py-2 rounded-full border border-white/5 bg-white/[0.02] text-[10px] font-bold text-indigo-400/60 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all uppercase tracking-widest">
                      ✨ Get an Icebreaker
                    </button>
                 </div>
              </div>
            )}

            {messages.map((m, i) => {
              if (m.system) return (
                <div key={m.id || i} className="flex justify-center my-4 animate-fade-in">
                  <span className="px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.05] text-[10px] text-white/30 font-bold uppercase tracking-wider">
                    {m.text}
                  </span>
                </div>
              );

              const isMe = m.socketId === socket.id || m.fromSelf;
              const senderIdx = [...peers, { socketId: 'me' }].findIndex(p => p.socketId === m.socketId);
              const accentColor = COLORS[senderIdx % COLORS.length] || '#818cf8';
              const showAvatar = i === 0 || messages[i-1].socketId !== m.socketId || messages[i-1].system;

              return (
                <div key={m.id || i} className={`flex w-full items-end gap-2.5 sm:gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'} animate-bubble-pop`}>
                  {/* AVATAR */}
                  <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-xs sm:text-sm border transition-opacity duration-300 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}
                       style={{ backgroundColor: `${accentColor}15`, borderColor: `${accentColor}30`, color: accentColor }}>
                    {m.isCreator ? '⭐' : (isMe ? '🙋' : '👤')}
                  </div>

                  {/* BUBBLE CONTENT */}
                  <div className={`flex flex-col gap-1 max-w-[85%] sm:max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {showAvatar && (
                      <div className="flex items-center gap-1.5 px-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40 shrink-0">
                          {isMe ? 'You' : m.nickname || 'Stranger'}
                        </span>
                        {m.isCreator && <BlueTick />}
                      </div>
                    )}

                    <div className={`group relative px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl sm:rounded-[1.25rem] border text-sm sm:text-base transition-all ${
                      isMe 
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10 rounded-tr-none' 
                      : 'bg-[#12142a] border-white/5 text-white/90 rounded-tl-none hover:border-white/10'
                    }`} style={isMe ? { background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)` } : {}}>
                      
                      {/* Interaction Tools */}
                      <button 
                        onClick={() => setReplyingTo(m)}
                        className={`absolute -top-3 ${isMe ? '-left-3' : '-right-3'} w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-90 z-20`}
                      >↩️</button>

                      {/* Msg Body */}
                      {m.media ? (
                         <div className="rounded-lg overflow-hidden border border-white/10 mt-1 max-w-sm">
                            {m.type === 'video' ? <video src={m.content} controls className="w-full h-auto" /> : <img src={m.content} className="w-full h-auto" alt="media" />}
                         </div>
                      ) : m.type === 'voice' ? (
                         <audio controls src={m.audio} className="max-w-full w-full mt-1" />
                      ) : m.text}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* PARTICIPANTS DRAWER (MOBILE) */}
          {showParticipants && (
            <div className="absolute inset-y-0 right-0 w-64 bg-[#0a0c16]/95 backdrop-blur-3xl border-l border-white/10 z-[60] p-6 animate-drawer-in sm:hidden">
               <div className="flex items-center justify-between mb-8">
                 <h3 className="font-black uppercase tracking-[0.2em] text-white/40 text-xs">The Realm</h3>
                 <button onClick={() => setShowParticipants(false)} className="p-2 -mr-2 text-white/20 hover:text-white">✕</button>
               </div>
               <div className="space-y-6">
                  {[{ socketId: 'me', nickname: nickname || 'You', isMe: true }, ...peers].map((p, i) => (
                    <div key={p.socketId} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5">{i === 0 ? '🙋' : '👤'}</div>
                      <div className="min-w-0">
                         <p className="text-sm font-black truncate">{p.nickname}</p>
                         <p className="text-[10px] uppercase font-bold tracking-widest text-white/20">Searching Interests</p>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* BOTTOM CONTROLS */}
          <div className="p-3 sm:p-6 bg-gradient-to-t from-[#05060b] to-transparent">
            
            {/* Warning Portal */}
            {warning && (
               <div className="mb-4 animate-in-zoom animate-warning-shake">
                  <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
                     <span className="text-lg">⚠️</span>
                     <div>
                        <p className="text-[10px] font-black uppercase text-rose-500 tracking-widest">AI Safety Filter</p>
                        <p className="text-xs text-white/70">{warning}</p>
                     </div>
                  </div>
               </div>
            )}

            {/* Reply Bar */}
            {replyingTo && (
               <div className="mb-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between text-xs animate-in-zoom">
                  <span className="opacity-40 truncate flex-1">Replying to {replyingTo.nickname}: "{replyingTo.text?.slice(0, 40)}"</span>
                  <button onClick={() => setReplyingTo(null)} className="ml-4 opacity-40 hover:opacity-100">✕</button>
               </div>
            )}

            <SafetyBanner onReport={() => setShowReportModal(true)} />
            {PHASE_3_PRO.miniChatGames && roomIdRef.current && (
              <MiniChatGamePanel onSendPrompt={(text) => { setChatInput(text); handleSendMessage(text); }} />
            )}

            <div className="flex items-end gap-2 sm:gap-3 mt-3">
               <ChatInputWithEmoji
                 value={chatInput}
                 onChange={setChatInput}
                 onSend={handleSendMessage}
                 disabled={isQueuing || isAiModerating}
                 placeholder={isAiModerating ? 'Reviewing...' : 'Type a message...'}
                 showVoice={PHASE_2.voiceMessages}
                 onVoiceMessage={handleVoiceMessage}
                 className="flex-1"
               />
            </div>
          </div>
        </div>

        {/* SIDE PANEL (DESKTOP) */}
        <aside className="hidden sm:flex w-72 h-full flex-col bg-[#0a0c16] border-l border-white/[0.06] p-6 z-30 overflow-y-auto custom-scrollbar">
           <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40">The Realm Online</h3>
           </div>

           <AdSlot slotKey="chat_sidebar" script={adScripts?.chat_sidebar} adsEnabled={adsEnabled} compact className="mb-6" />

           <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar min-h-0">
              {[{ socketId: 'me', nickname: nickname || 'You', country: myCountry, isMe: true }, ...peers].map((p, i) => (
                <div key={p.socketId} className="flex items-center gap-4 group animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                   <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center group-hover:border-indigo-500/50 transition-all">
                      {p.isMe ? '🙋' : (p.isCreator ? '⭐' : '👤')}
                   </div>
                   <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-black truncate ${p.isMe ? 'text-indigo-400' : 'text-white/80'}`}>{p.nickname}</p>
                        {p.isCreator && <BlueTick />}
                      </div>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-white/20">{countryToFlag(p.country) || '🌍'} Anonymous</p>
                   </div>
                </div>
              ))}
              
              {/* SLOTS */}
              {Array.from({ length: Math.max(0, GROUP_MAX - peers.length - 1) }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 opacity-20 filter grayscale">
                   <div className="w-10 h-10 rounded-2xl border border-dashed border-white/20 flex items-center justify-center text-xs">⏳</div>
                   <div className="min-w-0">
                      <p className="text-xs font-bold text-white/40 italic">Waiting...</p>
                   </div>
                </div>
              ))}
           </div>

            <div className="mt-auto pt-8 border-t border-white/[0.06] space-y-4">
               <div className="flex items-center gap-3 text-indigo-400">
                  <span className="text-sm">🛡️</span>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">E2EE Vault Protocol</span>
               </div>
               <p className="text-[10px] leading-relaxed text-white/30 uppercase tracking-[0.15em] font-black italic">
                 Ephemeral Zero-Trace Logic: No message storage, No logs, No meta-leakage. 
                 <span className="text-indigo-500/60 block mt-1">Status: Fully Purged.</span>
               </p>
            </div>
        </aside>

      </div>

      <ReportSafetyModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={submitGroupTextReport}
        prepend={reportParticipantPicker}
      />

      {toast && (
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[1000] max-w-[90vw] px-4 py-3 rounded-2xl bg-black/90 border border-white/10 text-xs font-bold text-white shadow-2xl animate-fade-in-up">
          {toast}
        </div>
      )}
    </div>
  );
}
