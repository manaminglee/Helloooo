import { useState, useEffect, useRef, memo, Suspense } from 'react';
import { useSocket } from '../hooks/useSocket';
import { CoinBadge } from './CoinBadge';
import { useCreators } from '../hooks/useCreators';
import { useCreatorNotifications } from '../hooks/useCreatorNotifications';
import { API_BASE } from '../config/apiBase';

import { countryToFlag } from '../utils/countryFlag';
import { AdSlot } from './AdSlot';
import { useLowPower } from '../context/LowPowerContext';
import { CREATOR_MIN_WITHDRAWAL_COINS } from '../utils/creatorAuth';
import { validateCreatorHandle, validateCreatorPassword } from '../utils/creatorValidation';
import { fetchPublicEvents, fetchAiStatus } from '../services/nvidiaAiClient';
import { loadSessionPrefs, saveSessionPrefs } from '../constants/conversationModes';
import { PHASE_4_UNIQUE } from '../constants/features';
import { SettingsGearButton } from './SettingsGear';
import LandingHero from './LandingHero';
import { LandingModeCards } from './LandingModeCards';
import { HellooooBrand, HellooooLogo, HELLOOOO_TAGLINE, HELLOOOO_EMOJI } from './HellooooBrand';
import { lazyRetry } from '../utils/lazyRetry';
import { CreatorNotificationBell } from './CreatorNotificationBell';
import { compressImageFile } from '../utils/compressImage';
import { CreatorLiveStudio } from './CreatorLiveStudio';
import { validateCreatorUpi } from '../utils/creatorValidation';
import CreatorVerifyModal from './CreatorVerifyModal';
import CreatorHub from './CreatorHub';
import { clearCreatorSession, getCreatorSessionToken } from '../utils/creatorAuth';
import { VirtualMarketRateChip } from './VirtualMarketPanel';

// Below-the-fold / secondary UI — keep landing first paint light.
const MiniTrendChart = lazyRetry(() =>
  import('./MiniTrendChart').then((m) => ({ default: m.MiniTrendChart }))
);
const PresenceMap = lazyRetry(() =>
  import('./PresenceMap').then((m) => ({ default: m.PresenceMap }))
);
const CreatorMatrix = lazyRetry(() =>
  import('./CreatorMatrix').then((m) => ({ default: m.CreatorMatrix }))
);
const RoomBrowser = lazyRetry(() =>
  import('./RoomBrowser').then((m) => ({ default: m.RoomBrowser }))
);
const SettingsPanel = lazyRetry(() =>
  import('./SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
);
const EventsHubStrip = lazyRetry(() =>
  import('./unique/UniqueSessionUI').then((m) => ({ default: m.EventsHubStrip }))
);
const ConversationModePicker = lazyRetry(() =>
  import('./unique/UniqueSessionUI').then((m) => ({ default: m.ConversationModePicker }))
);
const AiStatusPill = lazyRetry(() =>
  import('./unique/UniqueSessionUI').then((m) => ({ default: m.AiStatusPill }))
);

const BlueTick = () => (
  <span className="inline-flex items-center justify-center w-3 h-3 bg-violet-500 rounded-full ml-1.5 shadow-[0_0_14px_rgba(167,139,250,0.45)]">
    <svg className="w-2 h-2 text-black" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  </span>
);


const LANGUAGE_OPTIONS = [
  { value: '', label: 'Any language', flag: '🌐' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'te', label: 'Telugu', flag: '🇮🇳' },
  { value: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { value: 'es', label: 'Spanish', flag: '🇪🇸' },
];

function LanguagePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = LANGUAGE_OPTIONS.find((o) => o.value === value) || LANGUAGE_OPTIONS[0];

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`mm-lang-picker ${open ? 'mm-lang-picker--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="mm-landing-field mm-lang-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language preference"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mm-lang-picker__current">
          <span className="mm-lang-picker__flag" aria-hidden>{selected.flag}</span>
          <span>{selected.label}</span>
        </span>
        <span className="mm-lang-picker__chev" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="mm-lang-picker__menu" role="listbox" aria-label="Languages">
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <li key={opt.value || 'any'} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`mm-lang-picker__option ${active ? 'mm-lang-picker__option--active' : ''}`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="mm-lang-picker__flag" aria-hidden>{opt.flag}</span>
                  <span className="mm-lang-picker__label">{opt.label}</span>
                  {active && <span className="mm-lang-picker__check" aria-hidden>✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

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
  const [dashboardUpi, setDashboardUpi] = useState('');
  const [upiSaveMsg, setUpiSaveMsg] = useState('');
  const [loginForm, setLoginForm] = useState({ handle: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isSecretAuthorized] = useState(() => new URLSearchParams(window.location.search).has('manage_creator'));
  const [isReferredUser] = useState(() => new URLSearchParams(window.location.search).has('ref'));
  // Custom dialog modal — replaces system alert/confirm
  const [dialog, setDialog] = useState(null); // { title, body, confirm?, onConfirm?, onCancel? }
  const [showCommunityPolicy, setShowCommunityPolicy] = useState(false);
  const [pendingVideoMode, setPendingVideoMode] = useState(null);
  const { creatorStatus, registerCreator, verifyReferral, requestWithdrawal, login, logout, checkStatus, reRequestApproval, updateProfile, fetchStatus, fetchMyActivity, fetchMyWithdrawals, fetchMyAnalytics, fetchFeaturedCreators, requestPasswordReset, resetPassword } = useCreators();

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

  // Approval wait: countdown + poll. Do NOT gate on !creatorStatus —
  // register() saves mm_creatorId and fetchStatus() fills creatorStatus immediately,
  // which previously froze the timer at 15 forever.
  useEffect(() => {
    if (!waitingForApproval) return undefined;

    if (creatorStatus?.status === 'approved') {
      setApprovalData(creatorStatus);
      setWaitingForApproval(false);
      return undefined;
    }
    if (creatorStatus?.status === 'rejected') {
      setWaitingForApproval(false);
      showAlert(
        'Application rejected',
        creatorStatus.rejection_reason || 'Your application was not approved.'
      );
      return undefined;
    }

    const code =
      uniqueAccessCode ||
      creatorStatus?.referral_code ||
      (typeof window !== 'undefined' ? window.localStorage.getItem('mm_creatorId') : null);

    if (code && !uniqueAccessCode) setUniqueAccessCode(code);

    const tick = setInterval(() => {
      setApprovalTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const poll = setInterval(async () => {
      if (!code) return;
      const status = await checkStatus(code);
      if (!status) return;
      if (status.status === 'approved') {
        setApprovalData(status);
        setWaitingForApproval(false);
      } else if (status.status === 'rejected') {
        setWaitingForApproval(false);
        showAlert(
          'Application rejected',
          status.rejection_reason || 'Your application was not approved.'
        );
      }
    }, 4000);

    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showAlert is stable enough; avoid restarting every render
  }, [waitingForApproval, creatorStatus?.status, creatorStatus?.referral_code, uniqueAccessCode, checkStatus]);

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
    if (mode === 'lives') {
      setScanning(true);
      setTimeout(() => {
        onJoin('general', nick, mode, null, meta);
        setScanning(false);
      }, 350);
      return;
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

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showAlert('File Too Large', 'Pick a photo under 8MB — we compress it before upload.');
      return;
    }
    try {
      const dataUrl = await compressImageFile(file, { maxSide: 512, maxBytes: 380_000 });
      setProfileForm((prev) => ({ ...prev, avatar: dataUrl }));
    } catch (err) {
      showAlert('Avatar Error', err?.message || 'Could not process that image.');
    }
  };

  const saveProfile = async () => {
    const res = await updateProfile(profileForm.bio, profileForm.avatar);
    if (res.success) {
      setShowProfileModal(false);
      showAlert('Profile Linked', 'Your identity has been updated on the network.');
    } else {
      showAlert('Transmission Error', res.error || 'Profile uplink failed. Try a smaller photo.');
    }
  };

  useEffect(() => {
    if (creatorStatus?.preferred_upi != null) {
      setDashboardUpi(creatorStatus.preferred_upi || '');
    }
  }, [creatorStatus?.preferred_upi]);

  const referralUrl = typeof window !== 'undefined' && creatorStatus?.referral_code
    ? `${window.location.origin}/?ref=${creatorStatus.referral_code}`
    : '';
  const referralQrSrc = referralUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(referralUrl)}`
    : '';

  const openCreatorFlow = () => {
    if (creatorStatus?.status === 'approved') {
      setShowDashboardModal(true);
      return;
    }
    setShowCreatorModal(true);
  };

  const jumpFromDashboard = (mode, meta = {}) => {
    setShowDashboardModal(false);
    if (mode === 'lives' && meta.createLive) {
      const nick = (joinMeta.displayNickname || creatorStatus?.handle_name || 'Anonymous').trim().slice(0, 30);
      if (setJoinMeta) {
        setJoinMeta((p) => ({ ...p, displayNickname: nick, createLive: true }));
      }
      onJoin('general', nick, 'lives', null, { createLive: true, displayNickname: nick });
      return;
    }
    handleStartInteraction(mode, true);
  };

  const onCreatorHubAction = (actionId) => {
    switch (actionId) {
      case 'create_live':
        if (!getCreatorSessionToken()) {
          showAlert('Login required', 'Secure creator session missing. Please log in again.');
          setShowDashboardModal(false);
          setShowCreatorModal(true);
          return;
        }
        jumpFromDashboard('lives', { createLive: true });
        break;
      case 'watch_lives':
        jumpFromDashboard('lives');
        break;
      case 'group_text':
      case 'group_video':
      case 'video':
        jumpFromDashboard(actionId);
        break;
      case 'profile':
        setProfileForm({ bio: creatorStatus.bio || '', avatar: creatorStatus.avatar_url || '' });
        setShowProfileModal(true);
        break;
      case 'payout':
        // Scroll focus via UPI section — keep dashboard open
        document.getElementById('mm-creator-payout')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      case 'referral':
        if (referralUrl) {
          navigator.clipboard.writeText(referralUrl);
          showAlert('Copied', 'Referral link copied.');
        }
        break;
      default:
        break;
    }
  };

  const saveDashboardUpi = async () => {
    const check = validateCreatorUpi(dashboardUpi);
    if (!check.ok) {
      setUpiSaveMsg(check.error);
      return;
    }
    const res = await updateProfile(undefined, undefined, check.upi);
    if (res.success) {
      setUpiSaveMsg('UPI saved for payouts.');
      fetchStatus();
    } else {
      setUpiSaveMsg(res.error || 'Could not save UPI.');
    }
  };

  const requestPayoutFromDashboard = async () => {
    if ((creatorStatus?.coins_earned || 0) < CREATOR_MIN_WITHDRAWAL_COINS) return;
    const saved = creatorStatus?.preferred_upi || dashboardUpi;
    const upi = saved?.trim() || prompt('Enter UPI ID for Payout:');
    if (!upi) return;
    const res = await requestWithdrawal(upi);
    if (res.error) showAlert('Payout blocked', res.error);
    else showAlert('Transmitted', 'Withdrawal request sent to admin.');
  };

  const scrollToStart = () => startRef.current?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="mm-landing text-white relative">

      {/* Flat site background — same color everywhere */}
      <div className="mm-landing-bg" aria-hidden="true" />

      {/* COMMUNITY POLICY (first-time video / group video) */}
      {showCommunityPolicy && (
        <div className="mm-modal-overlay z-[2100]" role="dialog" aria-modal="true" aria-labelledby="community-policy-title">
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
                onClick={openCreatorFlow}
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
                    onClick={async () => {
                      await logout();
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

          {/* Names block — centered vertical stack */}
          <section className="mm-landing-section mm-landing-names mm-landing-fade-in">
            <div className="mm-landing-names__stack mm-landing-fade-in mm-landing-fade-in-delay-1">
              <Suspense fallback={null}>
                <AiStatusPill online={aiOnline} />
              </Suspense>
              <input
                type="text"
                value={joinMeta.displayNickname || ''}
                onChange={(e) => setJoinMeta?.((p) => ({ ...p, displayNickname: e.target.value.slice(0, 30) }))}
                placeholder="Display name (optional)"
                className="mm-landing-field"
              />
              <LanguagePicker
                value={languageFilter}
                onChange={setLanguageFilter}
              />
              <button type="button" onClick={openCreatorFlow} className="mm-hide-desktop mm-landing-chip px-4">
                For Creators
              </button>
              <button type="button" onClick={() => setLowPower(!lowPower)} className="mm-landing-chip px-4">
                {lowPower ? '⚡ Low power: On' : 'Low power: Off'}
              </button>
            </div>
          </section>

          {/* INTEREST DOCK - centered */}
          <section ref={startRef} className="mm-landing-section mm-landing-section--medium mm-landing-anchor mm-landing-fade-in mm-landing-fade-in-delay-2 mm-landing-step-panel">
            <div className="mm-landing-glass p-6 sm:p-8">
              <div className="flex flex-col items-center text-center relative z-[1] w-full">
                <span className="mm-landing-section-label">Step 1</span>
                <span className="mm-landing-section-title mb-2">Pick how you want to talk</span>
                <p className="text-xs text-white/45 mb-5 max-w-md">
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

                <div className="flex flex-wrap justify-center gap-2 mb-8">
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

                <div className="relative w-full max-w-md">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={`Try "${rotatingPlaceholder}"...`}
                    className="mm-landing-field w-full text-center pr-12"
                  />
                  <button onClick={getAiSuggestions} title="Suggest topics" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 hover:bg-violet-500/25 transition-colors">
                    <svg className={`w-3.5 h-3.5 ${isSuggesting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </button>
                </div>

                {interests.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 mt-5">
                    {interests.map(i => (
                      <div key={i.id} className="mm-landing-tag">
                        {i.label}
                        <button type="button" onClick={() => removeInterest(i.id)} className="mm-landing-tag-btn opacity-50 hover:opacity-100 transition-opacity ml-0.5" aria-label={`Remove ${i.label}`}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2 w-full px-1">
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
                <p className="text-xs text-white/40 mt-2 text-center max-w-md">
                  Saved topics stay in your browser only. No account required.
                </p>
              </div>
            </div>
          </section>

          {PHASE_4_UNIQUE.communityEvents && publicEvents.length > 0 && (
            <Suspense fallback={null}>
              <EventsHubStrip events={publicEvents} />
            </Suspense>
          )}

          {PHASE_4_UNIQUE.structuredModes && (
            <section className="mm-landing-section mm-landing-section--narrow mm-landing-fade-in mm-landing-fade-in-delay-2">
              <div className="mm-neural-panel p-6 sm:p-8">
                <span className="mm-neural-badge mb-4 inline-block">NVIDIA AI · Session setup</span>
                <Suspense fallback={null}>
                  <ConversationModePicker
                    mode={sessionMode}
                    contract={sessionContract}
                    onMode={handleSessionMode}
                    onContract={handleSessionContract}
                  />
                </Suspense>
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
            <Suspense fallback={<p className="text-sm text-white/40 text-center py-4">Loading rooms…</p>}>
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
            </Suspense>
          </section>

          <Suspense fallback={null}>
            <PresenceMap onlineCount={onlineCount} />
          </Suspense>

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
              <button type="button" onClick={openCreatorFlow} className="text-sm text-left text-white/50 hover:text-white transition-colors">Open creator program</button>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto pt-8 mt-8 border-t border-white/[0.06] text-xs text-white/35 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>© 2026 Helloooo 👋</span>
          <span className="text-white/25">helloooo.site</span>
        </div>
      </footer>

      <CreatorVerifyModal
        open={showCreatorModal}
        onClose={() => setShowCreatorModal(false)}
        registerCreator={registerCreator}
        login={login}
        checkStatus={checkStatus}
        requestPasswordReset={requestPasswordReset}
        featuredCreators={featuredCreators}
        showAlert={showAlert}
        onOpenDashboard={() => {
          setShowCreatorModal(false);
          setShowDashboardModal(true);
        }}
      />

      {showLoginModal && (
        <div className="mm-modal-overlay z-[2000] animate-in-zoom" onClick={() => setShowLoginModal(false)}>
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
        <div className="mm-modal-overlay z-[2000] animate-in-zoom" onClick={() => setShowForgotPasswordModal(false)}>
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
                  const res = await requestPasswordReset({
                    handle: forgotForm.handle,
                    referral_code: forgotForm.referralCode,
                  });
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
        <div className="mm-modal-overlay z-[2100] animate-in-zoom">
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
        <div className="mm-modal-overlay z-[2000] animate-in-zoom" onClick={() => { setShowStatusModal(false); setStatusCheckResult(null); setStatusCheckCode(''); }}>
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
                  <button onClick={async () => { await logout(); window.location.reload(); }} className="px-6 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-[10px] font-black text-rose-500 hover:bg-rose-500 hover:text-white transition-all uppercase tracking-widest">Deactivate</button>
                </div>
              </div>

              {/* CREATOR HUB — Create Live + modes */}
              <div className="mb-10 px-4">
                <CreatorHub
                  creator={creatorStatus}
                  sessionOk={!!getCreatorSessionToken()}
                  onAction={onCreatorHubAction}
                />
              </div>

              {/* QUICK ACTIONS (legacy shortcuts) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-10 px-4">
                <button type="button" onClick={() => jumpFromDashboard('lives', { createLive: true })} className="py-3 px-3 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-[9px] font-black uppercase tracking-widest text-rose-100 hover:bg-rose-500/25 transition-all">Create Live</button>
                <button type="button" onClick={() => jumpFromDashboard('lives')} className="py-3 px-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-[9px] font-black uppercase tracking-widest text-amber-100 hover:border-amber-400/40 transition-all">Browse Lives</button>
                <button type="button" onClick={() => jumpFromDashboard('group_text')} className="py-3 px-3 rounded-2xl bg-white/[0.03] border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:border-violet-500/30 hover:text-violet-300 transition-all">Voice Room</button>
                <button type="button" onClick={() => { setProfileForm({ bio: creatorStatus.bio || '', avatar: creatorStatus.avatar_url || '' }); setShowProfileModal(true); }} className="py-3 px-3 rounded-2xl bg-white/[0.03] border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:border-emerald-500/30 hover:text-emerald-300 transition-all">Edit Profile</button>
              </div>

              {/* YOUTUBE LIVE STUDIO (optional external) */}
              <div className="mb-12 px-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3 px-1">Optional · YouTube RTMP</p>
                <CreatorLiveStudio socket={socket} enabled={creatorStatus.status === 'approved'} compact />
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
                    <div className="p-5 bg-black/40 rounded-2xl border border-white/5 flex flex-col sm:flex-row gap-4 items-center">
                      {referralQrSrc && (
                        <img src={referralQrSrc} alt="Referral QR" className="w-24 h-24 rounded-xl border border-white/10 bg-white p-1 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 w-full">
                        <div className="text-[8px] font-black text-white/20 uppercase mb-2">Referral URL</div>
                        <div className="text-[11px] font-bold text-white italic break-all mb-4">{referralUrl}</div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(referralUrl); showAlert('Copied', 'Referral link copied to clipboard.'); }}
                            className="flex-1 min-w-[120px] py-3 bg-white/5 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-white hover:text-black transition-all"
                          >Copy Link</button>
                          <a
                            href={`/creator/${encodeURIComponent(creatorStatus.handle_name || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-w-[120px] py-3 text-center bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-500/20 transition-all"
                          >Public Profile</a>
                        </div>
                      </div>
                    </div>
                    <div id="mm-creator-payout" className="p-5 bg-black/40 rounded-2xl border border-white/5 space-y-3">
                      <div className="text-[8px] font-black text-white/20 uppercase">Saved UPI (payouts)</div>
                      <input
                        type="text"
                        value={dashboardUpi}
                        onChange={(e) => { setDashboardUpi(e.target.value); setUpiSaveMsg(''); }}
                        placeholder="yourname@upi"
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-500/40"
                      />
                      {upiSaveMsg && <p className="text-[10px] text-emerald-300/90">{upiSaveMsg}</p>}
                      <button type="button" onClick={saveDashboardUpi} className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20">Save UPI</button>
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
                      <VirtualMarketRateChip className="mt-3" />
                      <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest mt-4">Calculated from {creatorStatus.coins_earned || 0} lifetime creator coins</p>
                      <p className="text-[9px] font-bold text-white/25 mt-2 max-w-md">INR unlocks in blocks of 10,000 coins (₹150 per block). Withdrawals require at least {CREATOR_MIN_WITHDRAWAL_COINS.toLocaleString()} coins. Live estimate uses Platform Virtual Economy Rate — historical payouts keep the rate frozen at event time.</p>
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
                      onClick={requestPayoutFromDashboard}
                      className="px-12 py-6 bg-emerald-500 text-black font-black uppercase tracking-widest text-xs rounded-[30px] hover:bg-white hover:scale-105 transition-all shadow-[0_20px_50px_rgba(16,185,129,0.3)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >Request Payout</button>
                  </div>

                  {/* STATS GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="md:col-span-2 p-8 rounded-[40px] bg-white/[0.02] border border-white/5">
                      <Suspense fallback={null}>
                        <MiniTrendChart data={dashboardAnalytics.length ? dashboardAnalytics : [0, 0, 0, 0, 0, 0, 0]} color="#34d399" />
                      </Suspense>
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
                    <div className="p-10 rounded-[50px] bg-white/[0.02] border border-white/5 group hover:border-rose-500/30 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Tips Received</span>
                        <span className="text-2xl group-hover:scale-110 transition-transform">🎁</span>
                      </div>
                      <div className="text-5xl font-black italic text-white tabular-nums group-hover:text-rose-400 transition-colors">{creatorStatus.tips_received_total || 0}</div>
                      <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mt-2 italic">Lifetime coins tipped to you</p>
                    </div>
                    <div className="p-10 rounded-[50px] bg-white/[0.02] border border-white/5 group hover:border-indigo-500/30 transition-all md:col-span-2">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Influence Conversions</span>
                        <span className="text-2xl group-hover:scale-110 transition-transform">🔥</span>
                      </div>
                      <div className="text-5xl font-black italic text-white tabular-nums group-hover:text-indigo-400 transition-colors uppercase">{creatorStatus.referral_count || 0}</div>
                      <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mt-2 italic">Users joined via your unique uplink</p>
                    </div>
                  </div>

                  {/* NOTIFICATIONS */}
                  <div className="p-8 rounded-[40px] bg-white/[0.02] border border-white/5 max-h-72 overflow-y-auto">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[10px] font-black text-white/35 uppercase tracking-widest">Notifications</div>
                      {creatorUnreadCount > 0 && (
                        <span className="text-[9px] font-black text-rose-400 uppercase">{creatorUnreadCount} unread</span>
                      )}
                    </div>
                    {creatorNotificationsLoading && creatorNotifications.length === 0 ? (
                      <p className="text-[10px] text-white/25">Loading…</p>
                    ) : creatorNotifications.length === 0 ? (
                      <p className="text-[10px] text-white/25">No admin alerts yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {creatorNotifications.slice(0, 8).map((n) => (
                          <li key={n.id} className={`text-[10px] border-b border-white/[0.04] pb-2 ${!n.read ? 'text-white/75' : 'text-white/45'}`}>
                            <div className="font-black text-white/90">{n.title}</div>
                            <div className="text-white/50 mt-0.5">{n.message}</div>
                          </li>
                        ))}
                      </ul>
                    )}
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
        <div className="mm-modal-overlay z-[2500] animate-in-zoom" onClick={() => setShowProfileModal(false)}>
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
        <div className="mm-modal-overlay z-[2000] animate-in-zoom" onClick={() => setModal(null)}>
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
        <div className="mm-modal-overlay z-[3000]">
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

      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </Suspense>
      )}
    </div>
  );
}
