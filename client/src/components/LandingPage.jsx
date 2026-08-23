import { useState, useEffect, useRef, memo } from 'react';
import { useSocket } from '../hooks/useSocket';
import { CoinBadge } from './CoinBadge';
import { useCreators } from '../hooks/useCreators';
import { useCreatorNotifications } from '../hooks/useCreatorNotifications';
import { MiniTrendChart } from './MiniTrendChart';
import { API_BASE } from '../config/apiBase';

import { countryToFlag } from '../utils/countryFlag';
import { PresenceMap } from './PresenceMap';
import { CreatorMatrix } from './CreatorMatrix';
import { CreatorNotificationBell } from './CreatorNotificationBell';
import { AdSlot } from './AdSlot';
import { RoomBrowser } from './RoomBrowser';
import { useLowPower } from '../context/LowPowerContext';
import { CREATOR_MIN_WITHDRAWAL_COINS } from '../utils/creatorAuth';
import { validateCreatorHandle, validateCreatorPassword } from '../utils/creatorValidation';
import { EventsHubStrip, ConversationModePicker, AiStatusPill } from './unique/UniqueSessionUI';
import { fetchPublicEvents, fetchAiStatus } from '../services/nvidiaAiClient';
import { loadSessionPrefs, saveSessionPrefs } from '../constants/conversationModes';
import { PHASE_4_UNIQUE } from '../constants/features';
import { SettingsPanel, SettingsGearButton } from './SettingsPanel';
import LandingHero from './LandingHero';
import { LandingModeCards } from './LandingModeCards';
import { HellooooBrand, HellooooLogo, HELLOOOO_TAGLINE, HELLOOOO_EMOJI } from './HellooooBrand';

const BlueTick = () => (
  <span className="inline-flex items-center justify-center w-3 h-3 bg-violet-500 rounded-full ml-1.5 shadow-[0_0_14px_rgba(167,139,250,0.45)]">
    <svg className="w-2 h-2 text-black" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  </span>
);


const INTERESTS = [
  { id: 'telugu', label: 'Telugu', desc: 'Find Telugu peers' },
  { id: 'music', label: 'Music', desc: 'Connect with music lovers' },
  { id: 'gaming', label: 'Gaming', desc: 'Find your squad' },
  { id: 'movies', label: 'Movies', desc: 'Find film lovers' },
  { id: 'sports', label: 'Sports', desc: 'Live Action' },
  { id: 'chat', label: 'General', desc: 'Meet anyone' },
];

const MODALS = {
  privacy: {
    title: '🛡️ Private by design',
    body: `Private Policy: \n\n• No accounts. No logs. No history.\n• Sessions are wiped instantly on exit.\n• Private video calls.\n• 100% Anonymous.`,
  },
  integrity: {
    title: '🤝 Community Safety',
    body: `Guidelines: \n\n• Respect all users.\n• No explicit material.\n• No bullying or harassment.\n• Instant ban for violations.`,
  },
  safety: {
    title: '🏛️ Modern Safety',
    body: `Our core defenses: \n\n• 24/7 Smart safety check.\n• Secure private calls.\n• Nothing is ever saved.\n• Spam protection.\n• Admin oversight and monitoring.`,
  },
  dev: {
    title: '💻 How it works',
    body: `Fast & Secure: \n\n• Modern video technology.\n• High-speed connection logic.\n• Built for speed.\n• Secure system rules.\n• Performance-first design.`,
  },
  bug: {
    title: '🛠️ Safety Rewards',
    body: `Report safety issues: \n\n• We reward helpful reports.\n• Direct contact: manaminglee@gmail.com.\n• Fixed in 24-48 hours.\n• Help build a better network.`,
  }
};

const COMMUNITY_POLICY_KEY = 'mm_community_policy_video';
/** Local-only interest bundles for anonymous users (never sent as an account profile) */
const MM_INTEREST_PRESETS_KEY = 'mm_anon_interest_presets_v1';

const INSIGHTS = [
  'Popular right now: music and gaming rooms.',
  'Tip: add interests before starting a chat for better matches.',
  'Group video rooms support up to 4 people.',
  'Your session stays anonymous — no account required.',
  'Report unsafe behavior from any chat screen.',
];

// Mode cards are defined in LandingHero.jsx (single source of truth).
// `group_text` now routes to live Voice Rooms.

export function LandingPage({ onJoin, coinState, isJoining = false, registered = false, currentActiveSeconds = 0, joinMeta = {}, setJoinMeta, country: userCountry = null }) {
  const { balance, streak, canClaim, nextClaim, claimCoins, adsEnabled, adScripts } = coinState || {};
  const [interests, setInterests] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const { socket, connected, country, onlineCount: socketOnlineCount, isCreator: socketIsCreator } = useSocket();
  const onlineCount = typeof socketOnlineCount === 'object' ? socketOnlineCount?.count : (socketOnlineCount || 0);
  const [modal, setModal] = useState(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [insightIndex, setInsightIndex] = useState(0);
  const [creatorForm, setCreatorForm] = useState({ handle: '', platform: 'Instagram', link: '', email: '', password: '', confirmPassword: '' });
  const [linkValidated, setLinkValidated] = useState(false);
  const [linkVerifying, setLinkVerifying] = useState(false);
  const [linkVerifyFailed, setLinkVerifyFailed] = useState(false);
  const [refProcessed, setRefProcessed] = useState(false);
  const [platformDropdownOpen, setPlatformDropdownOpen] = useState(false);
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [approvalTimer, setApprovalTimer] = useState(15);
  const [uniqueAccessCode, setUniqueAccessCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [statusCheckCode, setStatusCheckCode] = useState('');
  const [statusCheckResult, setStatusCheckResult] = useState(null); // null | 'not_found' | { ...creator }
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showCreatorModal, setShowCreatorModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [forgotForm, setForgotForm] = useState({ handle: '', referralCode: '' });
  const [resetForm, setResetForm] = useState({ password: '', confirm: '' });
  const [forgotMessage, setForgotMessage] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [customRoomName, setCustomRoomName] = useState('');
  const [rotatingPlaceholder] = useState(() => {
    const picks = ['anime', 'movies', 'politics', 'music', 'gaming', 'tech', 'dating', 'fashion', 'sport', 'cars'];
    return picks[Math.floor(Math.random() * picks.length)];
  });
  const [profileForm, setProfileForm] = useState({ bio: '', avatar: '' });
  const [loginForm, setLoginForm] = useState({ handle: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isSecretAuthorized] = useState(() => new URLSearchParams(window.location.search).has('manage_creator'));
  const [isReferredUser] = useState(() => new URLSearchParams(window.location.search).has('ref'));
  // Custom dialog modal — replaces system alert/confirm
  const [dialog, setDialog] = useState(null); // { title, body, confirm?, onConfirm?, onCancel? }
  const [showCommunityPolicy, setShowCommunityPolicy] = useState(false);
  const [pendingVideoMode, setPendingVideoMode] = useState(null);
  const { creatorStatus, registerCreator, verifyReferral, requestWithdrawal, login, checkStatus, reRequestApproval, updateProfile, fetchStatus, fetchMyActivity, fetchMyWithdrawals, fetchMyAnalytics, fetchFeaturedCreators, requestPasswordReset, resetPassword } = useCreators();

  const creatorReferralCode =
    creatorStatus?.referral_code ||
    uniqueAccessCode ||
    (typeof window !== 'undefined' ? window.localStorage.getItem('mm_creatorId') : '') ||
    '';

  const {
    notifications: creatorNotifications,
    unreadCount: creatorUnreadCount,
    loading: creatorNotificationsLoading,
    fetchNotifications,
    markRead: markCreatorNotificationsRead,
  } = useCreatorNotifications(creatorReferralCode, socket);
  const { lowPower, setLowPower } = useLowPower();
  const [languageFilter, setLanguageFilter] = useState(joinMeta.language || '');
  const [sessionMode, setSessionMode] = useState(joinMeta.conversationMode || loadSessionPrefs().conversationMode || 'free');
  const [sessionContract, setSessionContract] = useState(joinMeta.topicContract || loadSessionPrefs().topicContract || 'chill');
  const [publicEvents, setPublicEvents] = useState([]);
  const [aiOnline, setAiOnline] = useState(false);
  const startRef = useRef(null);
  const [interestPresets, setInterestPresets] = useState([]);
  const [dashboardActivity, setDashboardActivity] = useState([]);
  const [dashboardWithdrawals, setDashboardWithdrawals] = useState([]);
  const [dashboardAnalytics, setDashboardAnalytics] = useState([]);
  const [creatorFormError, setCreatorFormError] = useState('');
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MM_INTEREST_PRESETS_KEY);
      if (raw) setInterestPresets(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchPublicEvents().then((d) => setPublicEvents(d?.events || [])).catch(() => {});
    fetchAiStatus().then((s) => setAiOnline(!!s?.online)).catch(() => {});
  }, []);

  const handleSessionMode = (mode) => {
    setSessionMode(mode);
    saveSessionPrefs({ conversationMode: mode, topicContract: sessionContract });
    setJoinMeta?.((p) => ({ ...p, conversationMode: mode }));
  };

  const handleSessionContract = (contract) => {
    setSessionContract(contract);
    saveSessionPrefs({ conversationMode: sessionMode, topicContract: contract });
    setJoinMeta?.((p) => ({ ...p, topicContract: contract }));
  };

  // Helper to show an alert-dialog
  const showAlert = (title, body) => new Promise(resolve => {
    setDialog({ title, body, onConfirm: () => { setDialog(null); resolve(true); }, onCancel: null });
  });
  // Helper to show a confirm-dialog
  const showConfirm = (title, body) => new Promise(resolve => {
    setDialog({ title, body, confirm: true, onConfirm: () => { setDialog(null); resolve(true); }, onCancel: () => { setDialog(null); resolve(false); } });
  });



  useEffect(() => {
    // Detect Referral Link
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode && !refProcessed) {
      verifyReferral(refCode).then(() => {
        setRefProcessed(true);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    }

    const interval = setInterval(() => {
      setInsightIndex(prev => (prev + 1) % INSIGHTS.length);
    }, 12000);
    return () => clearInterval(interval);
  }, [verifyReferral, refProcessed]);

  const [approvalData, setApprovalData] = useState(null);

  // Approval Timer Logic
  useEffect(() => {
    let timer;
    let pollInterval;
    if (waitingForApproval && approvalTimer > 0 && !creatorStatus) {
      timer = setInterval(() => {
        setApprovalTimer(prev => prev - 1);
      }, 1000);

      // Poll status every 3 seconds if waiting (backup for when socket is unavailable)
      pollInterval = setInterval(async () => {
        if (uniqueAccessCode) {
          const status = await checkStatus(uniqueAccessCode);
          if (status && status.status === 'approved') {
            setApprovalData(status);
            setWaitingForApproval(false);
          }
        }
      }, 10000);
    }
    return () => {
      clearInterval(timer);
      clearInterval(pollInterval);
    };
  }, [waitingForApproval, approvalTimer, creatorStatus, uniqueAccessCode, checkStatus]);

  useEffect(() => {
    fetchFeaturedCreators().then(({ creators }) => setFeaturedCreators(creators || [])).catch(() => {});
  }, [fetchFeaturedCreators]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('creator_reset');
    if (token) {
      setResetToken(token);
      setShowResetPasswordModal(true);
      setShowCreatorModal(true);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (data.password) {
        try { sessionStorage.setItem('mm_creator_password_once', data.password); } catch { /* ignore */ }
      }
      if (data.referral_code === uniqueAccessCode && waitingForApproval) {
        if (data.status === 'approved') {
          setApprovalData({ ...data, status: 'approved' });
          setWaitingForApproval(false);
        } else if (data.status === 'rejected') {
          setWaitingForApproval(false);
          showAlert('Application rejected', data.rejection_reason || 'Your application was not approved.');
        }
      }
      setStatusCheckResult(prev => {
        if (prev && typeof prev === 'object' && prev.referral_code === data.referral_code) {
          return { ...prev, status: data.status, password: data.password || prev.password, rejection_reason: data.rejection_reason };
        }
        return prev;
      });
      if (creatorStatus?.referral_code === data.referral_code) {
        fetchStatus();
        fetchNotifications();
      }
    };
    const onWithdrawalUpdated = () => {
      if (showDashboardModal) {
        fetchMyWithdrawals().then((w) => setDashboardWithdrawals(w.withdrawals || []));
        fetchStatus();
      }
      fetchNotifications();
    };
    socket.on('creator-status-changed', handler);
    socket.on('creator-withdrawal-updated', onWithdrawalUpdated);

    return () => {
      socket.off('creator-status-changed', handler);
      socket.off('creator-withdrawal-updated', onWithdrawalUpdated);
    };
  }, [socket, uniqueAccessCode, waitingForApproval, creatorStatus?.referral_code, showDashboardModal, fetchMyWithdrawals, fetchNotifications]);

  useEffect(() => {
    if (!creatorStatus?.referral_code || creatorStatus.status !== 'approved') return;
    if (!showDashboardModal && !showCreatorModal) return;
    let cancelled = false;
    (async () => {
      const [a, w, analytics] = await Promise.all([
        showDashboardModal ? fetchMyActivity() : Promise.resolve({ entries: [] }),
        showDashboardModal ? fetchMyWithdrawals() : Promise.resolve({ withdrawals: [] }),
        fetchMyAnalytics(),
      ]);
      if (cancelled) return;
      if (showDashboardModal) {
        setDashboardActivity(a.entries || []);
        setDashboardWithdrawals(w.withdrawals || []);
      }
      const series = analytics.series || [];
      setDashboardAnalytics(series.map((d) => (d.referrals || 0) + (d.tips || 0) + (d.follows || 0) + Math.floor((d.coins || 0) / 10)));
    })();
    return () => { cancelled = true; };
  }, [showDashboardModal, showCreatorModal, creatorStatus?.referral_code, creatorStatus?.status, creatorStatus?.coins_earned, fetchMyActivity, fetchMyWithdrawals, fetchMyAnalytics]);

  const addInterest = (interestArg) => {
    if (!interestArg) return;
    const isPredefined = INTERESTS.find(i => i.id === interestArg?.id || i.id === interestArg);
    const newInterest = isPredefined ? isPredefined : { id: interestArg.toLowerCase(), label: interestArg };
    if (!interests.find(i => i.id === newInterest.id)) setInterests([...interests, newInterest]);
  };

  const removeInterest = (id) => setInterests(interests.filter(idArg => idArg.id !== id));

  const saveAnonymousInterestBundle = () => {
    if (interests.length === 0) {
      showAlert('Add topics first', 'Pick at least one interest, then save a quick bundle. Still 100% anonymous.');
      return;
    }
    const entry = {
      id: `anon_${Date.now()}`,
      label: `Bundle ${interestPresets.length + 1}`,
      items: interests.map((i) => ({ id: i.id, label: i.label })),
    };
    const next = [...interestPresets, entry].slice(-5);
    setInterestPresets(next);
    try {
      localStorage.setItem(MM_INTEREST_PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    showAlert('Saved on this device', 'No account needed. Clear site data to remove bundles.');
  };

  const loadAnonymousInterestBundle = (presetId) => {
    const p = interestPresets.find((x) => x.id === presetId);
    if (!p) return;
    setInterests(p.items.map((x) => INTERESTS.find((i) => i.id === x.id) || { id: x.id, label: x.label || x.id }));
  };

  const getAiSuggestions = async () => {
    if (isSuggesting) return;
    setIsSuggesting(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/suggest`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        (data.suggestions || []).slice(0, 5).forEach((topic) => {
          if (topic) addInterest(String(topic).trim());
        });
      }
    } catch (e) { } finally { setIsSuggesting(false); }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = inputValue.trim();
      if (val) {
        addInterest(val);
        setInputValue('');
      }
    }
  };

  const handleStartInteraction = (mode, policyBypass = false) => {
    const nick = (joinMeta.displayNickname || 'Anonymous').trim().slice(0, 30) || 'Anonymous';
    const meta = {
      language: languageFilter,
      region: userCountry || country,
      displayNickname: nick,
      conversationMode: sessionMode,
      topicContract: sessionContract,
      calmMode: joinMeta.calmMode || false,
    };
    saveSessionPrefs({ conversationMode: sessionMode, topicContract: sessionContract });
    if (setJoinMeta) setJoinMeta((p) => ({ ...p, ...meta }));
    if (!policyBypass && (mode === 'video' || mode === 'group_video')) {
      try {
        if (!sessionStorage.getItem(COMMUNITY_POLICY_KEY)) {
          setPendingVideoMode(mode);
          setShowCommunityPolicy(true);
          return;
        }
      } catch {
        /* sessionStorage unavailable */
      }
    }
    if (mode === 'group_video' || mode === 'group_text') {
      setScanning(true);
      setTimeout(() => {
        onJoin(interests.length === 0 ? 'general' : interests.map(i => i.label || i).join(', '), nick, mode, null, meta);
        setScanning(false);
      }, 600);
      return;
    }
    setScanning(true);
    setTimeout(() => {
      onJoin(interests.length === 0 ? 'general' : interests.map(i => i.label || i).join(', '), nick, mode, null, meta);
      setScanning(false);
    }, 1000);
  };

  const acceptCommunityPolicyAndContinue = () => {
    try {
      sessionStorage.setItem(COMMUNITY_POLICY_KEY, '1');
    } catch { /* ignore */ }
    const mode = pendingVideoMode;
    setShowCommunityPolicy(false);
    setPendingVideoMode(null);
    if (mode) handleStartInteraction(mode, true);
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) return (showAlert('File Too Large', 'Max avatar size is 2MB. Optimized Base64 will be stored.'));
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileForm(prev => ({ ...prev, avatar: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = async () => {
    const res = await updateProfile(profileForm.bio, profileForm.avatar);
    if (res.success) {
      setShowProfileModal(false);
      (showAlert('Profile Linked', 'Your identity has been updated on the network.'));
    } else {
      (showAlert('Transmission Error', 'Profile uplink failed. Check connection.'));
    }
  };

  const scrollToStart = () => startRef.current?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="mm-landing text-white relative">

      {/* Flat site background — same color everywhere */}
      <div className="mm-landing-bg" aria-hidden="true" />

      {/* COMMUNITY POLICY (first-time video / group video) */}
      {showCommunityPolicy && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="community-policy-title">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0c0e14] p-8 shadow-2xl">
            <h2 id="community-policy-title" className="text-lg font-black uppercase tracking-wide text-white mb-2">Community safety</h2>
            <p className="text-[11px] text-white/50 leading-relaxed mb-6">
              Video on Helloooo 👋 is anonymous and live. You must be 18+ where required. No nudity, no harassment, no illegal content.
              Reports are reviewed; violations can lead to blocks and bans. By continuing you agree to follow these rules and our guidelines.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowCommunityPolicy(false); setPendingVideoMode(null); }}
                className="flex-1 rounded-2xl border border-white/10 py-3 text-[11px] font-black uppercase text-white/50 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={acceptCommunityPolicyAndContinue}
                className="flex-1 rounded-2xl bg-violet-500 py-3 text-[11px] font-black uppercase text-black hover:bg-violet-400"
              >
                I understand — continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCANNING OVERLAY */}
      {scanning && (
        <div className="fixed inset-0 z-[2000] mm-landing-scan flex flex-col items-center justify-center">
          <div className="mm-landing-scan-ring" />
          <span className="mt-5 text-sm font-semibold tracking-wide text-white/75">Finding your match...</span>
          <span className="mt-1 text-xs text-white/35">Secure anonymous connection</span>
        </div>
      )}

      {/* HEADER */}
      {!showDashboardModal && (
        <header className="mm-landing-header">
          <div className="mm-landing-header__bar">
            <div className="mm-landing-header__brand">
              <button type="button" onClick={scrollToStart} className="flex items-center gap-3 min-w-0 text-left rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40 mm-compact-btn">
                <HellooooLogo size={28} className="shrink-0 rounded-lg" />
                <div className="flex flex-col min-w-0">
                  <HellooooBrand size="sm" />
                  <span className="hidden sm:block text-[10px] text-white/45 tracking-widest uppercase">{HELLOOOO_EMOJI} {HELLOOOO_TAGLINE}</span>
                </div>
              </button>
            </div>
            <div className="mm-landing-header__actions">
              <button
                type="button"
                onClick={() => setShowCreatorModal(true)}
                className="mm-hide-mobile mm-compact-btn px-3.5 py-2 rounded-xl border border-violet-500/25 bg-violet-500/10 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 transition-colors"
              >
                For Creators
              </button>
              <SettingsGearButton
                onClick={() => setShowSettings(true)}
                className="mm-compact-btn p-2 rounded-xl border border-white/10 bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              />
              {connected && balance !== undefined && (
                <CoinBadge balance={balance} streak={streak} canClaim={canClaim} nextClaim={nextClaim ?? 0} claimCoins={claimCoins} registered={registered} currentActiveSeconds={currentActiveSeconds} isCreator={!!creatorStatus || socketIsCreator} />
              )}
              <div className="mm-landing-stat-pill shrink-0" title={`${(onlineCount ?? 0).toLocaleString()} people online`}>
                {country && <span title={`Your region: ${country}`}>{countryToFlag(country)}</span>}
                <span className="tabular-nums">{(onlineCount ?? 0).toLocaleString()}</span>
                <span className="hidden sm:inline">online</span>
              </div>
              {creatorReferralCode && (
                <CreatorNotificationBell
                  notifications={creatorNotifications}
                  unreadCount={creatorUnreadCount}
                  loading={creatorNotificationsLoading}
                  onMarkRead={markCreatorNotificationsRead}
                  onRefresh={fetchNotifications}
                  onOpenDashboard={() => setShowDashboardModal(true)}
                />
              )}
              {creatorStatus && (
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <div className="mm-hide-mobile flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-fuchsia-500/15 to-indigo-500/10 border border-violet-500/25 rounded-full text-[9px] font-black text-violet-200/90 uppercase tracking-tight max-w-[140px] md:max-w-none">
                    <span className="truncate">@{creatorStatus.handle_name}</span>
                    {creatorStatus.status === 'approved' && <BlueTick />}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDashboardModal(true)}
                    className="mm-hide-mobile mm-compact-btn px-2 py-1.5 bg-white/10 border border-white/15 text-white/90 rounded-lg text-xs font-medium hover:bg-white/15 transition-all"
                  >Dashboard</button>
                  <button
                    type="button"
                    onClick={() => {
                      window.localStorage.setItem('mm_logout_flag', 'true');
                      window.localStorage.removeItem('mm_creatorId');
                      window.location.reload();
                    }}
                    className="mm-compact-btn px-2 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
                    title="Logout Session"
                  >Out</button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* HERO SECTION */}
      {!showDashboardModal && (
        <main className="mm-landing-main mm-landing-neural-mesh">

          <AdSlot slotKey="hero" script={adScripts?.hero} adsEnabled={adsEnabled} className="w-full max-w-4xl" />

          {/* Redesigned 3D hero — mobile-first, replaces the old static header */}
          <LandingHero
            connected={connected}
            isJoining={isJoining}
            onlineCount={onlineCount ?? 0}
            lowPower={lowPower}
          />

          <section className="mm-landing-section mm-landing-section--wide text-left mm-landing-fade-in">
            <div className="mt-4 flex justify-start mm-landing-fade-in mm-landing-fade-in-delay-1">
              <AiStatusPill online={aiOnline} />
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-2 w-full max-w-3xl mm-landing-fade-in mm-landing-fade-in-delay-1">
              <input
                type="text"
                value={joinMeta.displayNickname || ''}
                onChange={(e) => setJoinMeta?.((p) => ({ ...p, displayNickname: e.target.value.slice(0, 30) }))}
                placeholder="Display name (optional)"
                className="mm-landing-field flex-1 w-full"
              />
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="mm-landing-field sm:max-w-[11rem] w-full"
                aria-label="Language preference"
              >
                <option value="">Any language</option>
                <option value="en">English</option>
                <option value="te">Telugu</option>
                <option value="hi">Hindi</option>
                <option value="es">Spanish</option>
              </select>
            </div>
            <div className="mt-4 flex flex-wrap justify-start gap-2 mm-landing-fade-in mm-landing-fade-in-delay-2">
              <button type="button" onClick={() => setShowCreatorModal(true)} className="mm-hide-desktop mm-landing-chip px-4">
                For Creators
              </button>
              <button type="button" onClick={() => setLowPower(!lowPower)} className="mm-landing-chip px-4">
                {lowPower ? '⚡ Low power: On' : 'Low power: Off'}
              </button>
            </div>
          </section>

          {/* INTEREST DOCK - REFINED COMPACT */}
          <section ref={startRef} className="mm-landing-section mm-landing-section--wide mm-landing-anchor mm-landing-fade-in mm-landing-fade-in-delay-2">
            <div className="mm-landing-glass p-6 sm:p-8">
              <div className="flex flex-col items-start relative z-[1] w-full">
                <span className="mm-landing-section-label">Step 1</span>
                <span className="mm-landing-section-title mb-2">Pick how you want to talk</span>
                <p className="text-xs text-white/45 text-left mb-5 max-w-xl">
                  Choose a mode, then add interests below for better matches.
                </p>

                <LandingModeCards
                  onStart={handleStartInteraction}
                  connected={connected}
                  isJoining={isJoining}
                  className="mb-8 w-full"
                />

                <span className="mm-landing-section-label">Step 2</span>
                <span className="mm-landing-section-title mb-5">Choose your interests</span>

                <div className="flex flex-wrap justify-start gap-2 mb-8">
                  {INTERESTS.filter(r => !interests.find(i => i.id === r.id)).slice(0, 8).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => addInterest(r.id)}
                      className="mm-landing-chip"
                    >
                      #{r.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full max-w-xl">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={`Try "${rotatingPlaceholder}"...`}
                    className="mm-landing-field w-full text-left pr-12"
                  />
                  <button onClick={getAiSuggestions} title="Suggest topics" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 hover:bg-violet-500/25 transition-colors">
                    <svg className={`w-3.5 h-3.5 ${isSuggesting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </button>
                </div>

                {interests.length > 0 && (
                  <div className="flex flex-wrap justify-start gap-2 mt-5">
                    {interests.map(i => (
                      <div key={i.id} className="mm-landing-tag">
                        {i.label}
                        <button type="button" onClick={() => removeInterest(i.id)} className="mm-landing-tag-btn opacity-50 hover:opacity-100 transition-opacity ml-0.5" aria-label={`Remove ${i.label}`}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-start gap-2 w-full px-1">
                  <button
                    type="button"
                    onClick={saveAnonymousInterestBundle}
                    className="mm-landing-chip px-4 py-2"
                  >
                    Save topic list (this device)
                  </button>
                  {interestPresets.length > 0 && (
                    <label className="flex items-center gap-2 text-[9px] text-white/40 font-bold uppercase tracking-widest">
                      <span>Load</span>
                      <select
                        aria-label="Load saved topic bundle"
                        className="rounded-lg bg-black/50 border border-white/10 px-2 py-1.5 text-white text-[10px] max-w-[11rem]"
                        defaultValue=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) loadAnonymousInterestBundle(v);
                          e.target.value = '';
                        }}
                      >
                        <option value="">Saved bundles…</option>
                        {interestPresets.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-2 text-left max-w-md">
                  Saved topics stay in your browser only. No account required.
                </p>
              </div>
            </div>
          </section>

          {PHASE_4_UNIQUE.communityEvents && publicEvents.length > 0 && (
            <EventsHubStrip events={publicEvents} />
          )}

          {PHASE_4_UNIQUE.structuredModes && (
            <section className="mm-landing-section mm-landing-section--narrow mm-landing-fade-in mm-landing-fade-in-delay-2">
              <div className="mm-neural-panel p-6 sm:p-8">
                <span className="mm-neural-badge mb-4 inline-block">NVIDIA AI · Session setup</span>
                <ConversationModePicker
                  mode={sessionMode}
                  contract={sessionContract}
                  onMode={handleSessionMode}
                  onContract={handleSessionContract}
                />
              </div>
            </section>
          )}

          <AdSlot slotKey="sidebar" script={adScripts?.sidebar} adsEnabled={adsEnabled} className="w-full max-w-2xl" />

          {/* Mode selection now lives in <LandingHero> above (step 1),
              so this section is intentionally removed to avoid duplication. */}

          <section className="mm-landing-section mm-landing-section--medium">
            <div className="text-center mb-5">
              <span className="mm-landing-section-label">Browse</span>
              <h3 className="mm-landing-section-title">Active rooms</h3>
            </div>
            <RoomBrowser
              connected={connected}
              onJoinRoom={(room) => {
                const nick = (joinMeta.displayNickname || 'Anonymous').trim().slice(0, 30) || 'Anonymous';
                onJoin(room.interest || 'general', nick, room.mode, room.id, {
                  language: languageFilter,
                  region: userCountry || country,
                  displayNickname: nick,
                  conversationMode: sessionMode,
                  topicContract: sessionContract,
                });
              }}
            />
          </section>

          <PresenceMap onlineCount={onlineCount} />

          <section className="mm-landing-section mm-landing-section--medium">
            <div className="mm-landing-insight">
              <div className="mm-landing-insight-icon" aria-hidden="true">💡</div>
              <div className="text-sm text-white/75 leading-relaxed flex-1 transition-opacity duration-500">
                {INSIGHTS[insightIndex]}
              </div>
            </div>
          </section>

          <AdSlot slotKey="footer" script={adScripts?.footer} adsEnabled={adsEnabled} className="w-full max-w-5xl" />
        </main>
      )}

      {/* FOOTER */}
      <footer className="mm-landing-footer">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-start gap-10">
          <div className="max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <HellooooLogo size={28} />
              <HellooooBrand size="md" />
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              👋 {HELLOOOO_TAGLINE}. Anonymous interest-based chat, video & audio — built for privacy and real connections.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 flex-1 w-full min-w-0">
            <div className="space-y-3">
              <h5 className="mm-landing-section-label mb-2">Legal</h5>
              <div className="flex flex-col gap-2">
                {['Privacy', 'Integrity', 'Safety'].map(m => (
                  <button key={m} onClick={() => setModal(m.toLowerCase())} className="text-sm text-left text-white/50 hover:text-white transition-colors">{m}</button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <h5 className="mm-landing-section-label mb-2">Help</h5>
              <div className="flex flex-col gap-2">
                {['Dev', 'Bug'].map(m => (
                  <button key={m} onClick={() => setModal(m.toLowerCase())} className="text-sm text-left text-white/50 hover:text-white transition-colors">{m === 'Dev' ? 'How it works' : 'Report a bug'}</button>
                ))}
                <button onClick={() => setModal('safety')} className="text-sm text-left text-white/50 hover:text-white transition-colors">Safety overview</button>
              </div>
            </div>
            <div className="space-y-3">
              <h5 className="mm-landing-section-label mb-2">Creators</h5>
              <button type="button" onClick={() => setShowCreatorModal(true)} className="text-sm text-left text-white/50 hover:text-white transition-colors">Open creator program</button>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto pt-8 mt-8 border-t border-white/[0.06] text-xs text-white/35 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>© 2026 Helloooo 👋</span>
          <span className="text-white/25">helloooo.site</span>
        </div>
      </footer>

      {/* CREATOR MODAL */}
      {showCreatorModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-6 bg-black/80" onClick={() => setShowCreatorModal(false)}>
          <div className="relative w-full max-w-lg bg-[#161a22] border border-white/10 rounded-2xl p-6 sm:p-8 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowCreatorModal(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >✕</button>

            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white">Creator Program</h3>
              <p className="text-sm text-white/50 mt-1">Apply, check status, or log in to manage your creator account.</p>
            </div>

            {!approvalData && !waitingForApproval && !creatorStatus && (
              <CreatorMatrix
                embedded
                creatorStatus={creatorStatus}
                onOpenDashboard={() => { setShowCreatorModal(false); setShowDashboardModal(true); }}
                onOpenApply={() => {}}
                onOpenStatus={() => { setShowCreatorModal(false); setShowStatusModal(true); }}
                onOpenLogin={() => { setShowCreatorModal(false); setShowLoginModal(true); }}
                onEditProfile={() => {
                  setProfileForm({
                    bio: creatorStatus?.bio || '',
                    avatar: creatorStatus?.avatar_url || ''
                  });
                  setShowProfileModal(true);
                }}
                onWithdraw={(upi) => requestWithdrawal(upi)}
                onLogout={() => {
                  localStorage.setItem('mm_logout_flag', '1');
                  localStorage.removeItem('mm_creatorId');
                  window.location.reload();
                }}
                showAlert={showAlert}
              />
            )}

            <div className="text-center mb-6">
              <p className="text-xs text-white/40">{approvalData ? 'Approved account' : waitingForApproval ? 'Application in review' : creatorStatus ? 'Your creator account' : 'New application'}</p>
            </div>

            {featuredCreators.length > 0 && !creatorStatus && (
              <div className="mb-8">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Featured creators</div>
                <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                  {featuredCreators.map((c) => (
                    <a
                      key={c.handle_name}
                      href={`/creator/${c.handle_name}`}
                      className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-violet-500/30 transition-colors"
                    >
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-xs">⭐</span>
                      )}
                      <span className="text-[10px] font-black text-white">@{c.handle_name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {approvalData ? (
              <div className="space-y-8 animate-in-zoom">
                <div className="p-8 rounded-[40px] bg-emerald-500/5 border-2 border-emerald-500/20 space-y-6 shadow-[0_0_50px_rgba(16,185,129,0.1)]">
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center text-4xl mb-4 animate-bounce">✅</div>
                    <h4 className="text-xl font-black italic uppercase text-white">Validation Success!</h4>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      {approvalData.password ? 'Admin-assigned credentials' : 'Use your registration password to log in'}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-black/40 rounded-2xl p-4 border border-white/5 flex justify-between items-center group">
                      <div>
                        <div className="text-[8px] font-black uppercase text-white/20 mb-1">Creator Handle</div>
                        <div className="text-xs font-black text-white italic uppercase tracking-widest">@{approvalData.handle_name}</div>
                      </div>
                      <span className="text-[10px] opacity-10 group-hover:opacity-40 transition-opacity">🆔</span>
                    </div>
                    {approvalData.password ? (
                    <div className="bg-black/40 rounded-2xl p-4 border border-white/5 flex justify-between items-center group">
                      <div>
                        <div className="text-[8px] font-black uppercase text-white/20 mb-1">Temporary Password</div>
                        <div className="text-xs font-black text-violet-400 italic uppercase select-all tracking-widest">{approvalData.password}</div>
                      </div>
                      <span className="text-[10px] opacity-10 group-hover:opacity-40 transition-opacity">🔒</span>
                    </div>
                    ) : (
                    <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
                      <div className="text-[8px] font-black uppercase text-white/20 mb-1">Login Password</div>
                      <p className="text-[10px] text-white/50 leading-relaxed">Use the password you chose when you applied. Open the bell icon for admin updates.</p>
                    </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      const content = approvalData.password
                        ? `HELLOOOO CREATOR CREDENTIALS\n\nHandle: @${approvalData.handle_name}\nAccess Code: ${approvalData.referral_code}\nPassword: ${approvalData.password}\n\nNote: Reach admin team at manaminglee@gmail.com for issues.`
                        : `HELLOOOO CREATOR CREDENTIALS\n\nHandle: @${approvalData.handle_name}\nAccess Code: ${approvalData.referral_code}\nPassword: (the one you set during registration)\n\nNote: Reach admin team at manaminglee@gmail.com for issues.`;
                      const blob = new Blob([content], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `mm_approved_${approvalData.handle_name}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                      window.localStorage.setItem('mm_creatorId', approvalData.referral_code);
                      window.location.reload();
                    }}
                    className="w-full py-5 bg-emerald-500 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-emerald-500/20"
                  >Download and Enter Hub →</button>
                </div>
              </div>
            ) : waitingForApproval ? (
              <div className="space-y-8 animate-in-zoom">
                <div className="text-center py-8">
                  {approvalTimer > 0 ? (
                    <div className="space-y-6">
                      <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
                        <div className="absolute inset-0 border-4 border-violet-500/20 rounded-full" />
                        <div
                          className="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"
                          style={{ animationDuration: '0.8s' }}
                        />
                        <span className="text-3xl font-black italic text-violet-400 tabular-nums">{approvalTimer}</span>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xl font-black italic uppercase tracking-tighter text-white">Validating Identity...</h4>
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest animate-pulse">Wait for Admin or AI Appraisal</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8 animate-fade-in-up">
                      <div className="p-8 rounded-[45px] bg-indigo-500/5 border-2 border-indigo-500/20 space-y-8 shadow-[0_0_50px_rgba(99,102,241,0.15)]">
                        <div className="text-center">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400/60 mb-2">Unique Access Code</h4>
                          <div className="w-full bg-black/40 rounded-[30px] py-10 px-6 text-2xl font-black italic text-center tracking-[0.1em] text-white border border-white/5 select-all hover:border-indigo-500/30 transition-all">
                            {uniqueAccessCode}
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-6">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(uniqueAccessCode);
                              setCodeCopied(true);
                              showAlert('Code copied', 'Your unique access code was saved to the clipboard.');
                            }}
                            className="px-10 py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-500 hover:scale-105 transition-all shadow-2xl shadow-indigo-600/30 active:scale-95"
                          >
                            {codeCopied ? 'Code Copied ✓' : 'Copy Mandatory Code'}
                          </button>

                          <p className="text-[9px] font-bold text-white/20 uppercase text-center leading-relaxed max-w-xs">
                            Validation is taking longer than expected. <span className="text-white/60">Copy this code now.</span> You will need it to check your status under the "Returning Creator" section.
                          </p>
                        </div>
                      </div>

                      {codeCopied && (
                        <button
                          onClick={() => {
                            setWaitingForApproval(false);
                            setShowCreatorModal(false);
                          }}
                          className="w-full h-14 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-indigo-400 transition-all"
                        >Close and Check Later</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : !creatorStatus ? (
              <div className="space-y-6">
                <div className="space-y-4 text-center mb-8">
                  <p className="text-xs font-bold text-white/60 leading-normal">
                    Verified creators get a <span className="text-violet-400">Blue Tick</span>, unique handles, and earn <span className="text-emerald-400">₹150 per 10k clicks</span>.
                  </p>
                </div>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="@handle_name"
                    className="w-full h-14 bg-white/5 border border-white/5 focus:border-violet-500/30 rounded-2xl px-6 text-sm outline-none text-white font-bold"
                    value={creatorForm.handle}
                    onChange={e => {
                      const h = e.target.value.replace(/^@/, '');
                      setCreatorFormError('');
                      const platformUrls = {
                        'Instagram': `https://instagram.com/${h}`,
                        'YouTube': `https://youtube.com/@${h}`,
                        'Snapchat': `https://snapchat.com/add/${h}`,
                        'X (Twitter)': `https://x.com/${h}`,
                        'TikTok': `https://tiktok.com/@${h}`,
                      };
                      const autoLink = h ? (platformUrls[creatorForm.platform] || '') : '';
                      setCreatorForm(f => ({ ...f, handle: e.target.value, link: autoLink }));
                      setLinkValidated(false);
                    }}
                  />
                  {creatorForm.handle && !validateCreatorHandle(creatorForm.handle).ok && (
                    <p className="text-[9px] text-amber-400/80 px-2">{validateCreatorHandle(creatorForm.handle).error}</p>
                  )}
                  <input
                    type="email"
                    placeholder="Email (for approval & payout updates)"
                    className="w-full h-14 bg-white/5 border border-white/5 focus:border-violet-500/30 rounded-2xl px-6 text-sm outline-none text-white font-bold"
                    value={creatorForm.email}
                    onChange={(e) => setCreatorForm((f) => ({ ...f, email: e.target.value }))}
                  />
                  <p className="text-[9px] text-white/25 px-2">Recommended — used for approval, password reset, and payout emails.</p>
                  <input
                    type="password"
                    placeholder="Create login password (min 8 characters)"
                    autoComplete="new-password"
                    className="w-full h-14 bg-white/5 border border-white/5 focus:border-violet-500/30 rounded-2xl px-6 text-sm outline-none text-white font-bold"
                    value={creatorForm.password}
                    onChange={(e) => setCreatorForm((f) => ({ ...f, password: e.target.value }))}
                  />
                  <input
                    type="password"
                    placeholder="Confirm login password"
                    autoComplete="new-password"
                    className="w-full h-14 bg-white/5 border border-white/5 focus:border-violet-500/30 rounded-2xl px-6 text-sm outline-none text-white font-bold"
                    value={creatorForm.confirmPassword}
                    onChange={(e) => setCreatorForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  />
                  {creatorForm.password && !validateCreatorPassword(creatorForm.password, creatorForm.confirmPassword).ok && creatorForm.confirmPassword && (
                    <p className="text-[9px] text-amber-400/80 px-2">{validateCreatorPassword(creatorForm.password, creatorForm.confirmPassword).error}</p>
                  )}
                  <p className="text-[9px] text-white/25 px-2">You will use this password to log in after admin approval.</p>
                  <div className="relative group">
                    <button
                      onClick={() => setPlatformDropdownOpen(!platformDropdownOpen)}
                      type="button"
                      className="w-full h-14 bg-white/5 border border-white/5 focus:border-violet-500/30 rounded-2xl px-6 text-sm outline-none text-white/50 flex items-center justify-between transition-all hover:bg-white/[0.08]"
                    >
                      <span>{creatorForm.platform || 'Select Platform'}</span>
                      <svg className={`w-4 h-4 transition-transform duration-300 ${platformDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {platformDropdownOpen && (
                      <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-[1000] bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-in-zoom">
                        {['Instagram', 'YouTube', 'Snapchat', 'X (Twitter)', 'TikTok'].map(p => {
                          const platformUrls = {
                            'Instagram': `https://instagram.com/${creatorForm.handle.replace(/^@/, '')}`,
                            'YouTube': `https://youtube.com/@${creatorForm.handle.replace(/^@/, '')}`,
                            'Snapchat': `https://snapchat.com/add/${creatorForm.handle.replace(/^@/, '')}`,
                            'X (Twitter)': `https://x.com/${creatorForm.handle.replace(/^@/, '')}`,
                            'TikTok': `https://tiktok.com/@${creatorForm.handle.replace(/^@/, '')}`,
                          };
                          return (
                            <button
                              key={p}
                              onClick={() => {
                                const newLink = platformUrls[p] || '';
                                setCreatorForm(f => ({ ...f, platform: p, link: newLink }));
                                setLinkValidated(false);
                                setPlatformDropdownOpen(false);
                              }}
                              className="w-full h-12 px-6 text-left text-xs font-bold text-white/60 hover:text-white hover:bg-violet-500/10 transition-all border-b border-white/[0.03] last:border-0"
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder={`e.g. https://instagram.com/${creatorForm.handle.replace(/^@/, '') || 'yourhandle'}`}
                        className={`flex-1 h-14 bg-white/5 border rounded-2xl px-4 text-sm outline-none text-white transition-all ${linkValidated ? 'border-emerald-500/50 shadow-[0_0_10px_#10b98120]' :
                          linkVerifyFailed ? 'border-rose-500/40' :
                            'border-white/5 focus:border-violet-500/30'
                          }`}
                        value={creatorForm.link}
                        onChange={e => {
                          setCreatorForm({ ...creatorForm, link: e.target.value });
                          setLinkValidated(false);
                          setLinkVerifyFailed(false);
                        }}
                      />
                      <button
                        type="button"
                        disabled={linkVerifying || !creatorForm.link}
                        onClick={async () => {
                          const url = creatorForm.link.trim();
                          if (!url) return;
                          // Validate URL format first
                          try { new URL(url); } catch { return showAlert('Invalid URL', 'Please enter a valid URL starting with https://'); }
                          setLinkVerifying(true);
                          setLinkValidated(false);
                          setLinkVerifyFailed(false);
                          try {
                            const res = await fetch(`${API_BASE}/api/validate-url`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ url })
                            });
                            const data = await res.json();
                            if (data.valid) {
                              setLinkValidated(true);
                              setLinkVerifyFailed(false);
                            } else {
                              setLinkVerifyFailed(true);
                              setLinkValidated(false);
                            }
                          } catch {
                            // Network error - allow submission anyway
                            setLinkValidated(true);
                          } finally {
                            setLinkVerifying(false);
                          }
                        }}
                        title="Background verify — no new tab opened"
                        className={`h-14 px-4 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all border min-w-[80px] flex items-center justify-center ${linkValidated ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' :
                          linkVerifyFailed ? 'bg-rose-500/20 border-rose-500/40 text-rose-400' :
                            linkVerifying ? 'bg-white/5 border-white/10 text-white/40 cursor-wait' :
                              'bg-white/5 border-white/10 text-white/40 hover:border-violet-500/40 hover:text-violet-400 disabled:opacity-50'
                          }`}
                      >
                        {linkVerifying ? (
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : linkValidated ? '✓ Live' : linkVerifyFailed ? '✗ Dead' : 'Verify'}
                      </button>
                    </div>
                    <p className={`text-[9px] px-2 ${linkValidated ? 'text-emerald-400/60' : linkVerifyFailed ? 'text-rose-400/60' : 'text-white/20'
                      }`}>
                      {linkValidated ? '✓ Profile link is reachable and verified.' :
                        linkVerifyFailed ? '⚠ Link seems unreachable. Double-check the URL.' :
                          'Auto-filled from your handle. Click Verify to confirm in background.'}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      setCreatorFormError('');
                      const handleCheck = validateCreatorHandle(creatorForm.handle);
                      if (!handleCheck.ok) return showAlert('Invalid handle', handleCheck.error);
                      if (!creatorForm.link) return showAlert('Missing Profile Link', 'Please enter your profile link.');
                      if (!linkValidated) {
                        const go = await showConfirm('Profile Not Verified', "You haven't verified your profile link yet. Are you sure you want to submit?");
                        if (!go) return;
                      }
                      const passCheck = validateCreatorPassword(creatorForm.password, creatorForm.confirmPassword);
                      if (!passCheck.ok) return showAlert('Password required', passCheck.error);
                      const res = await registerCreator(
                        creatorForm.handle,
                        creatorForm.platform,
                        creatorForm.link,
                        creatorForm.email,
                        creatorForm.password,
                        creatorForm.confirmPassword
                      );
                      if (res.success) {
                        setUniqueAccessCode(res.accessCode);
                        setWaitingForApproval(true);
                        setApprovalTimer(15);
                        fetchStatus();
                      }
                      else {
                        setCreatorFormError(res.error || 'Registration failed');
                        showAlert('Registration Failed', res.error || 'Something went wrong. Please try again.');
                      }
                    }}
                    className="w-full h-14 bg-violet-400 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white transition-all shadow-xl shadow-violet-500/25"
                  >Register as Creator</button>

                  <div className="pt-10 flex flex-col items-center gap-6 border-t border-white/5">
                    <div className="flex items-center gap-4 text-[8px] font-black uppercase tracking-[0.4em] text-white/20 whitespace-nowrap italic">
                      <span>Apply</span>
                      <span className="text-violet-500 animate-pulse">→</span>
                      <span>Check Status</span>
                      <span className="text-violet-500 animate-pulse">→</span>
                      <span>Login</span>
                    </div>

                    <div className="flex gap-4 w-full">
                      <button
                        onClick={() => { setShowCreatorModal(false); setShowStatusModal(true); }}
                        className="flex-1 py-4 rounded-xl bg-white/5 border border-white/5 text-[9px] font-black uppercase text-white/40 hover:text-violet-400 hover:border-violet-400/20 transition-all tracking-widest"
                      >Check Status</button>
                      <button
                        onClick={() => { setShowCreatorModal(false); setShowLoginModal(true); }}
                        className="flex-1 py-4 rounded-xl bg-white/5 border border-white/5 text-[9px] font-black uppercase text-white/40 hover:text-indigo-400 hover:border-indigo-400/20 transition-all tracking-widest"
                      >Creator Login</button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in-zoom">
                <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 space-y-4 text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Account Identity</div>
                  <h4 className="text-3xl font-black italic uppercase tracking-tighter text-white">
                    @{creatorStatus.handle_name}
                    {creatorStatus.status === 'approved' && <BlueTick />}
                  </h4>
                  <div className="flex justify-center gap-4">
                    {creatorStatus.status === 'approved' ? (
                      <span className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_#10b98130]">Account Active</span>
                    ) : (
                      <span className="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest animate-pulse">Waiting for manual appraisal</span>
                    )}
                  </div>
                </div>
                {creatorStatus.status === 'approved' && (
                  <div className="space-y-6">
                    {/* GROWTH VELOCITY ANALYTICS */}
                    <div className="mb-8 animate-in-zoom" style={{ animationDelay: '100ms' }}>
                      <MiniTrendChart data={dashboardAnalytics.length ? dashboardAnalytics : [0, 0, 0, 0, 0, 0, 0]} color="#a78bfa" />
                      <div className="flex justify-between mt-3 px-2 text-[8px] font-black uppercase text-white/10 tracking-[0.3em] italic">
                        <span className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-violet-400" />
                          Activity: referrals + tips + follows (7 days)
                        </span>
                        <span className="text-emerald-400/40 tabular-nums">
                          {dashboardAnalytics.reduce((a, b) => a + b, 0)} events
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-6 rounded-[32px] bg-white/[0.03] border border-white/5">
                        <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Earned</div>
                        <div className="text-xl font-black italic text-emerald-400">₹{creatorStatus.earnings_rs || 0}</div>
                        <div className="text-[8px] font-bold text-white/10 uppercase mt-1 italic">Creator Earnings</div>
                      </div>
                      <div className="p-6 rounded-[32px] bg-white/[0.03] border border-white/5">
                        <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Referral Clicks</div>
                        <div className="text-xl font-black italic text-indigo-400">{creatorStatus.referral_count || 0}</div>
                        <div className="text-[8px] font-bold text-white/10 uppercase mt-1 italic">Total Referrals</div>
                      </div>
                    </div>

                    <div className="p-8 rounded-[32px] bg-indigo-500/5 border border-indigo-500/10 space-y-4">
                      <div className="text-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 italic">Profile Details</span>
                        <p className="text-[8px] font-black text-white/20 uppercase mt-1">Use these to login from any device</p>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="bg-black/40 rounded-2xl p-4 border border-white/5 flex justify-between items-center group">
                          <div>
                            <div className="text-[8px] font-black uppercase text-white/20 mb-1">Public Handle</div>
                            <div className="text-xs font-black text-white italic uppercase">{creatorStatus?.handle_name || ''}</div>
                          </div>
                          <span className="text-[10px] opacity-10 group-hover:opacity-40 transition-opacity">🆔</span>
                        </div>
                        <div className="bg-black/40 rounded-2xl p-4 border border-white/5 flex justify-between items-center group">
                          <div>
                            <div className="text-[8px] font-black uppercase text-white/20 mb-1">Account Password</div>
                            <div className="text-xs font-black text-emerald-400 italic uppercase select-all">{creatorStatus?.password || ''}</div>
                          </div>
                          <span className="text-[10px] opacity-10 group-hover:opacity-40 transition-opacity">🔒</span>
                        </div>
                        <button
                          onClick={() => {
                            const content = `HELLOOOO CREATOR CREDENTIALS\n\nHandle: @${creatorStatus.handle_name}\nCreator ID: ${creatorStatus.referral_code}\nPassword: ${creatorStatus.password}\nReferral Link: ${window.location.origin}/?ref=${creatorStatus.referral_code}\n\nNote: If you have forgotten these, reach the admin team at manaminglee@gmail.com`;
                            const blob = new Blob([content], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `mm_creator_${creatorStatus.handle_name}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                            showAlert('Downloaded', 'Your creator credentials were downloaded to this device. Keep them private.');
                          }}
                          className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-white/40 text-[9px] font-black uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-all"
                        >Download Account Details →</button>
                        <p className="text-[7px] text-center font-black uppercase tracking-widest text-white/10 italic">Forgotten? Reach Admin Team</p>
                      </div>
                    </div>

                    <div className="p-8 rounded-[32px] bg-white/[0.01] border border-white/5">
                      <div className="flex justify-between items-center mb-4 px-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Authorized IP Addresses</span>
                        <span className="text-[8px] font-black text-emerald-400 uppercase italic animate-pulse">Verified</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(creatorStatus.authorized_ips || []).map(ipNode => (
                          <span key={ipNode} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-[9px] font-bold text-white/30 uppercase tracking-widest">{ipNode}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 pt-6 border-t border-white/5">
                  <div className="flex justify-between items-center px-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Referral Link</span>
                    {creatorStatus.status === 'approved' && <span className="text-[9px] font-bold text-emerald-400 uppercase italic animate-pulse">Referral Ready</span>}
                  </div>
                  <div className="flex gap-2">
                    <input
                      disabled
                      readOnly
                      value={creatorStatus.status === 'approved' ? `${window.location.origin}?ref=${creatorStatus.referral_code}` : 'Pending Appraisal...'}
                      className="flex-1 h-14 bg-white/5 border border-white/5 rounded-2xl px-6 text-[10px] font-bold text-white/40 outline-none overflow-hidden text-ellipsis italic"
                    />
                    {creatorStatus.status === 'approved' && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}?ref=${creatorStatus.referral_code}`);
                          showAlert('Link copied', 'Your referral link was saved to the clipboard.');
                        }}
                        className="px-8 h-14 rounded-2xl bg-violet-400 text-black font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all shadow-xl shadow-violet-500/25"
                      >Copy Link</button>
                    )}
                  </div>
                </div>

                {creatorStatus.status === 'approved' && creatorStatus.earnings_rs >= 1500 && (
                  <button
                    onClick={async () => {
                      const upi = prompt('Enter UPI ID for withdrawal:');
                      if (upi) {
                        const res = await requestWithdrawal(upi);
                        if (res.success) showAlert('Withdrawal requested', 'Your withdrawal request was sent. Coins will be debited after verification.');
                        else showAlert('Withdrawal failed', res.error || 'Could not submit the withdrawal request.');
                      }
                    }}
                    className="w-full h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-emerald-500 hover:text-white transition-all shadow-xl shadow-emerald-500/20"
                  >Authorize Withdrawal (₹{creatorStatus.earnings_rs})</button>
                )}

                <div className="text-[9px] font-bold text-white/10 text-center uppercase tracking-widest italic pt-4">
                  Earnings Logic: 10 Coins / Click | 10000 Coins = ₹150 | Min Withdrawal ₹1500
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATOR LOGIN MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in-zoom" onClick={() => setShowLoginModal(false)}>
          <div className="relative w-full max-w-sm bg-black border border-white/10 rounded-[50px] p-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowLoginModal(false)} className="absolute top-6 right-8 text-white/20 hover:text-white transition-colors">✕</button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4 text-2xl shadow-[0_0_20px_#6366f120]">🔑</div>
              <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Creator Login</h3>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-2">Creator Hub Authorization</p>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Creator Handle"
                value={loginForm.handle}
                onChange={e => setLoginForm({ ...loginForm, handle: e.target.value })}
                className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-6 text-sm outline-none text-white focus:border-indigo-500/30 transition-all font-bold"
              />
              <input
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-6 text-sm outline-none text-white focus:border-indigo-500/30 transition-all tracking-widest"
              />
              <button
                onClick={async () => {
                  setLoginError('');
                  const res = await login(loginForm.handle, loginForm.password);
                  if (res.success) {
                    setShowLoginModal(false);
                    setLoginForm({ handle: '', password: '' });
                  } else {
                    setLoginError(res.error);
                  }
                }}
                className="w-full h-14 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white hover:text-black transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
              >Login as Creator</button>
              {loginError && <p className="text-rose-500 text-[10px] text-center font-black uppercase tracking-widest mt-4 animate-shake">{loginError}</p>}
              <button
                type="button"
                onClick={() => { setShowLoginModal(false); setShowForgotPasswordModal(true); setForgotMessage(''); }}
                className="w-full mt-4 text-[9px] font-black uppercase tracking-widest text-white/35 hover:text-violet-400 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORGOT PASSWORD MODAL */}
      {showForgotPasswordModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in-zoom" onClick={() => setShowForgotPasswordModal(false)}>
          <div className="relative w-full max-w-sm bg-black border border-white/10 rounded-[50px] p-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowForgotPasswordModal(false)} className="absolute top-6 right-8 text-white/20 hover:text-white transition-colors">✕</button>
            <div className="text-center mb-8">
              <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Reset Password</h3>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-2">Handle + access code from your application</p>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Creator handle"
                value={forgotForm.handle}
                onChange={(e) => setForgotForm({ ...forgotForm, handle: e.target.value })}
                className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-6 text-sm outline-none text-white font-bold"
              />
              <input
                type="text"
                placeholder="Access code (referral code)"
                value={forgotForm.referralCode}
                onChange={(e) => setForgotForm({ ...forgotForm, referralCode: e.target.value })}
                className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-6 text-sm outline-none text-white font-mono"
              />
              <button
                type="button"
                onClick={async () => {
                  setForgotMessage('');
                  const res = await requestPasswordReset(forgotForm.handle, forgotForm.referralCode);
                  if (res.success) {
                    setForgotMessage(res.message || 'Check your email for a reset link.');
                  } else {
                    setForgotMessage(res.error || 'Request failed');
                  }
                }}
                className="w-full h-14 bg-violet-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white hover:text-black transition-all"
              >
                Send reset link
              </button>
              {forgotMessage && <p className="text-[10px] text-center text-violet-300/80 font-bold">{forgotMessage}</p>}
            </div>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL (from email link) */}
      {showResetPasswordModal && resetToken && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in-zoom">
          <div className="relative w-full max-w-sm bg-black border border-white/10 rounded-[50px] p-10 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setShowResetPasswordModal(false);
                const url = new URL(window.location.href);
                url.searchParams.delete('creator_reset');
                window.history.replaceState({}, '', url.pathname + url.search);
              }}
              className="absolute top-6 right-8 text-white/20 hover:text-white transition-colors"
            >✕</button>
            <div className="text-center mb-8">
              <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Set New Password</h3>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-2">Min. 8 characters</p>
            </div>
            <div className="space-y-4">
              <input
                type="password"
                placeholder="New password"
                value={resetForm.password}
                onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })}
                className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-6 text-sm outline-none text-white"
              />
              <input
                type="password"
                placeholder="Confirm password"
                value={resetForm.confirm}
                onChange={(e) => setResetForm({ ...resetForm, confirm: e.target.value })}
                className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-6 text-sm outline-none text-white"
              />
              <button
                type="button"
                onClick={async () => {
                  setResetMessage('');
                  if (resetForm.password !== resetForm.confirm) {
                    setResetMessage('Passwords do not match.');
                    return;
                  }
                  const res = await resetPassword(resetToken, resetForm.password);
                  if (res.success) {
                    setResetMessage('Password updated. You can log in now.');
                    setTimeout(() => {
                      setShowResetPasswordModal(false);
                      setShowLoginModal(true);
                      const url = new URL(window.location.href);
                      url.searchParams.delete('creator_reset');
                      window.history.replaceState({}, '', url.pathname + url.search);
                    }, 1500);
                  } else {
                    setResetMessage(res.error || 'Reset failed');
                  }
                }}
                className="w-full h-14 bg-emerald-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white hover:text-black transition-all"
              >
                Update password
              </button>
              {resetMessage && <p className="text-[10px] text-center text-emerald-400/90 font-bold">{resetMessage}</p>}
            </div>
          </div>
        </div>
      )}

      {/* CHECK STATUS MODAL */}
      {showStatusModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in-zoom" onClick={() => { setShowStatusModal(false); setStatusCheckResult(null); setStatusCheckCode(''); }}>
          <div className="relative w-full max-w-sm bg-black border border-white/10 rounded-[50px] p-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setShowStatusModal(false); setStatusCheckResult(null); setStatusCheckCode(''); }} className="absolute top-6 right-8 text-white/20 hover:text-white transition-colors text-xl">✕</button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4 text-2xl shadow-[0_0_24px_rgba(167,139,250,0.2)]">🔍</div>
              <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Check Application Status</h3>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-2">Enter your access code or handle name</p>
            </div>
            <div className="space-y-6">
              {!statusCheckResult ? (
                <>
                  <input
                    type="text"
                    value={statusCheckCode}
                    onChange={e => { setStatusCheckCode(e.target.value); setStatusCheckResult(null); }}
                    placeholder="e.g. handle1234 or @yourhandle"
                    className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl px-6 text-sm outline-none text-white focus:border-violet-500/30 transition-all font-bold tracking-widest"
                  />
                  <button
                    disabled={checkingStatus || !statusCheckCode.trim()}
                    onClick={async () => {
                      const code = statusCheckCode.trim().replace(/^@/, '');
                      if (!code) return;
                      setCheckingStatus(true);
                      // Try access code first, then handle name as fallback
                      let data = await checkStatus(code);
                      if (!data) {
                        // Try looking up by handle name directly
                        data = await checkStatus(`handle:${code}`);
                      }
                      setCheckingStatus(false);
                      setStatusCheckResult(data || 'not_found');
                    }}
                    className="w-full h-14 bg-violet-400 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white transition-all shadow-xl shadow-violet-500/25 disabled:opacity-50"
                  >
                    {checkingStatus ? 'Checking...' : 'Check Status →'}
                  </button>
                </>
              ) : statusCheckResult === 'not_found' ? (
                <div className="text-center space-y-6">
                  <div className="text-5xl">❌</div>
                  <div>
                    <div className="text-sm font-black text-white uppercase tracking-widest">Access Code Not Found</div>
                    <p className="text-[10px] text-white/30 font-bold mt-2 leading-relaxed">
                      The code <span className="text-white/60 font-black">"{statusCheckCode}"</span> doesn't match any application.
                      Make sure you're entering the exact code you received after registering.
                    </p>
                  </div>
                  <button
                    onClick={() => { setStatusCheckResult(null); setStatusCheckCode(''); }}
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/10 transition-all"
                  >Try Again</button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">👤</div>
                      <div>
                        <div className="text-xs text-white/20 font-black uppercase tracking-widest">Handle</div>
                        <div className="font-black text-white text-lg italic uppercase">@{statusCheckResult?.handle_name || ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Status</span>
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${statusCheckResult.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        statusCheckResult.status === 'rejected' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                        }`}>{statusCheckResult.status === 'approved' ? '✅ Approved' : statusCheckResult.status === 'rejected' ? '❌ Rejected' : '⏳ Pending Review'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Platform</span>
                      <span className="text-[10px] font-black text-white/60 uppercase">{statusCheckResult?.platform || ''}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Applied</span>
                      <span className="text-[10px] font-black text-white/40">{new Date(statusCheckResult.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {statusCheckResult.status === 'approved' ? (
                    <button
                      onClick={() => {
                        window.localStorage.setItem('mm_creatorId', statusCheckResult.referral_code);
                        window.location.reload();
                      }}
                      className="w-full h-12 bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white hover:text-black transition-all shadow-xl shadow-emerald-500/20"
                    >Login as Creator →</button>
                  ) : statusCheckResult.status === 'pending' ? (
                    <button
                      onClick={async () => {
                        await reRequestApproval(statusCheckResult.referral_code);
                        setStatusCheckResult({ ...statusCheckResult, _pinged: true });
                      }}
                      disabled={statusCheckResult._pinged}
                      className="w-full h-12 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-indigo-500 hover:text-white transition-all disabled:opacity-50"
                    >{statusCheckResult._pinged ? '✓ Approval Reminder Sent' : 'Remind Admin to Review →'}</button>
                  ) : null}

                  <button
                    onClick={() => { setStatusCheckResult(null); setStatusCheckCode(''); }}
                    className="w-full h-10 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white/40 transition-colors"
                  >← Check Another Code</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATOR DASHBOARD MODAL */}
      {showDashboardModal && creatorStatus && (
        <div className="fixed inset-0 z-[5000] flex flex-col bg-[#050505] animate-in-zoom overflow-hidden" onClick={() => setShowDashboardModal(false)}>
          <div className="flex-1 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="max-w-6xl mx-auto px-8 py-20">

              {/* TOP HEADER */}
              <div className="flex justify-between items-center mb-16 px-4">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 h-10 bg-violet-400 rounded-full animate-pulse" />
                  <div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Creator Dashboard</h2>
                    <p className="text-[10px] font-black text-violet-400/40 uppercase tracking-[0.4em]">Auth Level: Verified Creator</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setShowDashboardModal(false)} className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-white hover:bg-white hover:text-black transition-all uppercase tracking-widest">Exit HUD</button>
                  <button onClick={() => { localStorage.setItem('mm_logout_flag', '1'); localStorage.removeItem('mm_creatorId'); window.location.reload(); }} className="px-6 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-[10px] font-black text-rose-500 hover:bg-rose-500 hover:text-white transition-all uppercase tracking-widest">Deactivate</button>
                </div>
              </div>

              {/* MAIN HUD GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">

                {/* LEFT: IDENTITY MATRIX */}
                <div className="lg:col-span-1 space-y-8">
                  <div className="p-10 rounded-[50px] bg-white/[0.02] border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-5 font-black text-6xl italic group-hover:opacity-10 transition-all">ID</div>
                    <div className="flex flex-col items-center text-center">
                      <div className="w-40 h-40 rounded-full border-2 border-violet-400/40 p-2 mb-6 group-hover:scale-105 transition-transform relative">
                        <div className="absolute inset-0 rounded-full bg-violet-400/10 animate-pulse" />
                        <img src={creatorStatus.avatar_url || '/apple-touch-icon.png'} className="w-full h-full object-cover rounded-full relative z-10" />
                      </div>
                      <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">@{creatorStatus.handle_name} <BlueTick /></h3>
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-2">{creatorStatus.platform} Influencer</p>

                      <div className="mt-8 text-[11px] font-bold text-white/60 leading-relaxed max-w-[200px] italic">
                        {creatorStatus.bio || "No biography synced. Update your identity via the Profile Matrix."}
                      </div>

                      <button
                        onClick={() => {
                          setProfileForm({ bio: creatorStatus.bio || '', avatar: creatorStatus.avatar_url || '' });
                          setShowProfileModal(true);
                        }}
                        className="mt-8 px-8 py-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-500 hover:text-black transition-all"
                      >Update Metadata →</button>
                    </div>
                  </div>

                  <div className="p-8 rounded-[40px] bg-indigo-500/5 border border-indigo-500/10 space-y-4">
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Share Hub</h4>
                    <div className="p-5 bg-black/40 rounded-2xl border border-white/5">
                      <div className="text-[8px] font-black text-white/20 uppercase mb-2">Referral URL</div>
                      <div className="text-[11px] font-bold text-white italic break-all mb-4">{`${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${creatorStatus.referral_code}`}</div>
                      <button
                        type="button"
                        onClick={() => {
                          const u = `${window.location.origin}/?ref=${creatorStatus.referral_code}`;
                          navigator.clipboard.writeText(u);
                          showAlert('Copied', 'Referral link copied to clipboard.');
                        }}
                        className="w-full py-3 bg-white/5 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-white hover:text-black transition-all"
                      >Copy Link</button>
                    </div>
                  </div>
                </div>

                {/* MIDDLE/RIGHT: FINANCIAL HUD & ANALYTICS */}
                <div className="lg:col-span-2 space-y-8">

                  {/* WALLET BAR */}
                  <div className="p-12 rounded-[60px] bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent opacity-40 group-hover:scale-150 transition-all duration-1000" />
                    <div className="w-full md:flex-1 min-w-0">
                      <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-4">Total Liquid Assets</h3>
                      <div className="text-7xl font-black italic text-white flex items-baseline gap-4 tabular-nums">
                        ₹{creatorStatus.earnings_rs || 0}<span className="text-xl text-white/20">INR</span>
                      </div>
                      <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest mt-4">Calculated from {creatorStatus.coins_earned || 0} lifetime creator coins</p>
                      <p className="text-[9px] font-bold text-white/25 mt-2 max-w-md">INR unlocks in blocks of 10,000 coins (₹150 per block). Withdrawals require at least {CREATOR_MIN_WITHDRAWAL_COINS.toLocaleString()} coins.</p>
                      {(() => {
                        const coins = creatorStatus.coins_earned || 0;
                        const pct = Math.min(100, (coins / CREATOR_MIN_WITHDRAWAL_COINS) * 100);
                        return (
                          <div className="mt-6 max-w-md">
                            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-white/35 mb-1">
                              <span>Payout threshold</span>
                              <span className="tabular-nums">{coins.toLocaleString()} / {CREATOR_MIN_WITHDRAWAL_COINS.toLocaleString()} coins</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden border border-white/10">
                              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      type="button"
                      disabled={(creatorStatus.coins_earned || 0) < CREATOR_MIN_WITHDRAWAL_COINS}
                      title={(creatorStatus.coins_earned || 0) < CREATOR_MIN_WITHDRAWAL_COINS ? `Need ${CREATOR_MIN_WITHDRAWAL_COINS.toLocaleString()} creator coins to request payout` : 'Request payout'}
                      onClick={async () => {
                        if ((creatorStatus.coins_earned || 0) < CREATOR_MIN_WITHDRAWAL_COINS) return;
                        const upi = prompt('Enter UPI ID for Payout:');
                        if (upi) {
                          const res = await requestWithdrawal(upi);
                          if (res.error) showAlert('Payout blocked', res.error);
                          else showAlert('Transmitted', 'Withdrawal request sent to admin. Coins will be debited after verified.');
                        }
                      }}
                      className="px-12 py-6 bg-emerald-500 text-black font-black uppercase tracking-widest text-xs rounded-[30px] hover:bg-white hover:scale-105 transition-all shadow-[0_20px_50px_rgba(16,185,129,0.3)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >Request Payout</button>
                  </div>

                  {/* STATS GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="md:col-span-2 p-8 rounded-[40px] bg-white/[0.02] border border-white/5">
                      <MiniTrendChart data={dashboardAnalytics.length ? dashboardAnalytics : [0, 0, 0, 0, 0, 0, 0]} color="#34d399" />
                      <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest mt-3">7-day activity (referrals, tips, follows)</p>
                    </div>
                    <div className="p-10 rounded-[50px] bg-white/[0.02] border border-white/5 group hover:border-violet-500/30 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Total Audience</span>
                        <span className="text-2xl group-hover:scale-110 transition-transform">👥</span>
                      </div>
                      <div className="text-5xl font-black italic text-white tabular-nums group-hover:text-violet-400 transition-colors">{creatorStatus.followers_count || 0}</div>
                      <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mt-2 italic">Followers reached through profile</p>
                    </div>
                    <div className="p-10 rounded-[50px] bg-white/[0.02] border border-white/5 group hover:border-indigo-500/30 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Influence Conversions</span>
                        <span className="text-2xl group-hover:scale-110 transition-transform">🔥</span>
                      </div>
                      <div className="text-5xl font-black italic text-white tabular-nums group-hover:text-indigo-400 transition-colors uppercase">{creatorStatus.referral_count || 0}</div>
                      <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mt-2 italic">Users joined via your unique uplink</p>
                    </div>
                  </div>

                  {/* ACTIVITY & WITHDRAWAL LEDGER */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-8 rounded-[40px] bg-white/[0.02] border border-white/5 max-h-64 overflow-y-auto">
                      <div className="text-[10px] font-black text-white/35 uppercase tracking-widest mb-4">Recent activity</div>
                      {dashboardActivity.length === 0 ? (
                        <p className="text-[10px] text-white/25">No entries yet. Share your referral link or use the app from linked devices to populate activity.</p>
                      ) : (
                        <ul className="space-y-2">
                          {dashboardActivity.slice(0, 12).map((row, i) => (
                            <li key={row.id || i} className="text-[10px] text-white/55 border-b border-white/[0.04] pb-2 flex justify-between gap-2">
                              <span className="text-emerald-400/90 font-mono truncate">{row.action || row.details || '—'}</span>
                              {row.amount != null && (
                                <span className="text-amber-400/90 shrink-0 tabular-nums">{row.amount > 0 ? '+' : ''}{row.amount}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="p-8 rounded-[40px] bg-white/[0.02] border border-white/5 max-h-64 overflow-y-auto">
                      <div className="text-[10px] font-black text-white/35 uppercase tracking-widest mb-4">Withdrawal history</div>
                      {dashboardWithdrawals.length === 0 ? (
                        <p className="text-[10px] text-white/25">No payout requests yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {dashboardWithdrawals.map((w) => (
                            <li key={w.id} className="text-[10px] text-white/55 flex flex-col gap-1 border-b border-white/[0.04] pb-2">
                              <div className="flex justify-between gap-2">
                                <span className="text-white/40">{w.created_at ? new Date(w.created_at).toLocaleString() : '—'}</span>
                                <span className={`font-black uppercase shrink-0 ${w.status === 'pending' ? 'text-amber-400' : w.status === 'paid' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {w.status || 'pending'}
                                </span>
                              </div>
                              {w.admin_note && <span className="text-[9px] text-white/35 italic">{w.admin_note}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* SECURITY PROTOCOL BAR */}
                  <div className="p-8 rounded-[40px] bg-black/40 border border-white/5 grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div>
                      <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Access PIN</div>
                      {(() => {
                        const once = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('mm_creator_password_once') : null;
                        if (once) {
                          return <div className="text-lg font-black text-violet-400 select-all" title="Save this password securely">{once}</div>;
                        }
                        return <p className="text-[10px] text-white/35 leading-relaxed">Hidden for security. Use the password shown when you were approved, or contact admin for a reset.</p>;
                      })()}
                    </div>
                    <div>
                      <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Matrix Code</div>
                      <div className="text-lg font-black text-white select-all hover:scale-105 transition-all w-fit cursor-help" title="Referral ID">{creatorStatus.referral_code}</div>
                    </div>
                    <div>
                      <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Verification Status</div>
                      <div className="text-lg font-black text-emerald-500 italic uppercase">System Approved</div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROFILE EDITOR MODAL */}
      {showProfileModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in-zoom" onClick={() => setShowProfileModal(false)}>
          <div className="relative w-full max-w-sm bg-[#0a0a0a] border border-white/10 rounded-[50px] p-10 shadow-[0_0_100px_rgba(6,182,212,0.15)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowProfileModal(false)} className="absolute top-8 right-8 text-white/20 hover:text-white transition-colors">✕</button>

            <div className="text-center mb-8">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">Edit Profile</h3>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-2">Personalize your Identity</p>
            </div>

            <div className="space-y-8">
              <div className="flex flex-col items-center">
                <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-input').click()}>
                  <div className="w-32 h-32 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden group-hover:border-violet-500/50 transition-all">
                    {profileForm.avatar ? (
                      <img src={profileForm.avatar} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl grayscale opacity-20 group-hover:opacity-100 group-hover:grayscale-0 transition-all">📸</span>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-full transition-all">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Upload</span>
                  </div>
                  <input id="avatar-input" type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
                </div>
                <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-4">Tap to upload photo (Max 2MB)</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-violet-400/60 uppercase tracking-widest ml-4">About You</label>
                  <textarea
                    placeholder="Tell your fans something special..."
                    className="w-full h-32 bg-white/5 border border-white/5 focus:border-violet-500/30 rounded-3xl p-6 text-sm outline-none text-white font-bold resize-none transition-all"
                    value={profileForm.bio}
                    onChange={e => setProfileForm(prev => ({ ...prev, bio: e.target.value.slice(0, 150) }))}
                  />
                  <div className="text-right text-[8px] font-black text-white/10 uppercase tracking-widest px-4">{profileForm.bio.length}/150</div>
                </div>
              </div>

              <button
                onClick={saveProfile}
                className="w-full h-16 bg-violet-500 text-black font-black uppercase tracking-widest text-[11px] rounded-2xl hover:bg-white hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-violet-500/25"
              >Save Identity →</button>
            </div>
          </div>
        </div>
      )}

      {/* STANDARD MODAL */}
      {modal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/90 backdrop-blur-3xl animate-in-zoom" onClick={() => setModal(null)}>
          <div className="relative w-full max-w-sm bg-black border border-white/10 rounded-[40px] p-10 text-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setModal(null)} className="absolute top-6 right-8 text-white/20 hover:text-white transition-colors text-xl">✕</button>
            <h3 className="text-2xl font-black text-white italic uppercase mb-6 tracking-tighter">{MODALS[modal]?.title}</h3>
            <p className="text-[11px] text-white/40 leading-relaxed font-bold uppercase tracking-widest whitespace-pre-line">{MODALS[modal]?.body}</p>
            <button onClick={() => setModal(null)} className="mt-10 w-full h-14 bg-violet-500 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white transition-all shadow-xl shadow-violet-500/25">Got it</button>
          </div>
        </div>
      )}

      {/* CUSTOM APP DIALOG — replaces system alert/confirm */}
      {dialog && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 bg-black/90 backdrop-blur-3xl">
          <div className="w-full max-w-xs bg-[#0a0a0a] border border-white/10 rounded-[40px] p-8 shadow-2xl animate-in-zoom">
            <div className="text-center mb-6">
              <div className="text-3xl mb-4">{dialog.confirm ? '⚠️' : 'ℹ️'}</div>
              <h4 className="text-base font-black uppercase tracking-widest text-white italic mb-3">{dialog.title}</h4>
              <p className="text-[11px] text-white/40 font-bold leading-relaxed">{dialog.body}</p>
            </div>
            <div className={`flex gap-3 ${dialog.confirm ? 'flex-row' : 'flex-col'}`}>
              <button
                onClick={dialog.onConfirm}
                className="flex-1 h-12 bg-violet-400 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white transition-all"
              >OK</button>
              {dialog.confirm && dialog.onCancel && (
                <button
                  onClick={dialog.onCancel}
                  className="flex-1 h-12 bg-white/5 border border-white/10 text-white/40 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white/10 transition-all"
                >Cancel</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
