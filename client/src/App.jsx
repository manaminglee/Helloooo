import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { LandingPage } from './components/LandingPage';
import MobileNav from './components/MobileNav';
import { useLiveManifest, isLiveAudioSurface } from './utils/pwaManifest';
import {
  parseOpaqueLocation,
  requestNavGrant,
  verifyNavGrant,
  pageForMode,
  modeForPage,
  replaceOpaqueUrl,
  pushOpaqueUrl,
} from './utils/opaqueRoutes';
import { AgeVerificationGate } from './components/AgeVerificationGate';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { registerBestPush, watchServiceWorkerUpdates } from './utils/pushNotifications';
import { IosSwipeBack } from './components/IosSwipeBack';
import { unlockIosMedia } from './utils/iosMediaUnlock';
import { UnblockPaymentModal } from './components/UnblockPaymentModal';
import { ToastProvider, useToast } from './components/Toast';
import { ConnectionBanner } from './components/ConnectionBanner';
import { verifyStripeReturn } from './utils/paymentCheckout';
import { LowPowerProvider } from './context/LowPowerContext';
import { useSocket } from './hooks/useSocket';
import { useCoins } from './hooks/useCoins';
import { loadReconnectSession, clearReconnectSession, saveReconnectSession } from './utils/reconnectSession';
import { API_BASE } from './config/apiBase';
import { lazyRetry, clearChunkReloadFlag } from './utils/lazyRetry';
import { applyPageSeo, applyPrivateSessionSeo } from './utils/seo';
import { useAudioIdentity } from './hooks/useAudioIdentity';
import { HellooooLoader } from './components/HellooooBrand';
// Lazy load off-screen and secondary modules for extreme performance
const AdminDashboard = lazyRetry(() => import('./components/AdminDashboard'));
const AgencyDashboard = lazyRetry(() => import('./components/AgencyDashboard'));
const LivesApp = lazyRetry(() => import('./components/lives/LivesApp'));
const TextChat = lazyRetry(() => import('./components/TextChat'));
const GroupVideoRoom = lazyRetry(() => import('./components/GroupVideoRoom'));
const GroupTextRoom = lazyRetry(() => import('./components/GroupTextRoom'));
// Group text is superseded by live voice channels (with the shared coin race).
const GroupAudioRoom = lazyRetry(() => import('./components/GroupAudioRoom'));
const GiftOverlayLazy = lazyRetry(() =>
  import('./components/GiftDrawer').then((m) => ({ default: m.GiftOverlay }))
);
const VideoChat = lazyRetry(() => import('./components/VideoChat'));
const CreatorPublicProfile = lazyRetry(() =>
  import('./components/CreatorPublicProfile').then((m) => ({ default: m.CreatorPublicProfile }))
);

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[50vh] w-full">
    <HellooooLoader size={140} label="Helloooo" hint="Loading..." transparent />
  </div>
);

const STATES = { LANDING: 'landing', CHAT: 'chat', ADMIN: 'admin', AGENCY: 'agency', CREATOR_PROFILE: 'creator_profile' };
const MODES = { TEXT: 'text', VIDEO: 'video', GROUP_TEXT: 'group_text', GROUP_VIDEO: 'group_video', LIVES: 'lives' };

export default function App() {
  return (
    <LowPowerProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </LowPowerProvider>
  );
}

function AppShell() {
  const { toast } = useToast();
  const [gateVerified, setGateVerified] = useState(() =>
    sessionStorage.getItem('wc_age') === '1' && sessionStorage.getItem('wc_bot') === '1'
  );

  const [appState, setAppState] = useState(() => {
    if (window.location.pathname === '/matrix-admin') return STATES.ADMIN;
    if (window.location.pathname === '/agency') return STATES.AGENCY;
    return STATES.LANDING;
  });
  const [mode, setMode] = useState(null);

  /* Live and Audio are one installable app. The manifest is swapped whenever
     the person is on either surface, so an install from there lands back on it
     instead of the landing page. */
  useEffect(() => {
    const inLiveApp = mode === MODES.LIVES || mode === MODES.GROUP_TEXT;
    useLiveManifest(inLiveApp ? 'live' : 'default');
  }, [mode]);
  const [interest, setInterest] = useState('general');
  const [roomId, setRoomId] = useState(null);
  const [joinMeta, setJoinMeta] = useState({
    language: '',
    region: '',
    displayNickname: 'Anonymous',
    conversationMode: 'free',
    topicContract: 'chill',
    calmMode: false,
  });
  const [showUnblockPay, setShowUnblockPay] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState('');
  const [creatorHandle, setCreatorHandle] = useState(null);
  const [pendingJoinRoomId, setPendingJoinRoomId] = useState(null);
  const [joinLinkOpts, setJoinLinkOpts] = useState({ paToken: null, asCohost: false });
  const [isJoining, setIsJoining] = useState(false);
  const [roomJoinNotice, setRoomJoinNotice] = useState('');
  const { socket, connected, country, onlineCount, adsEnabled, adScripts, allowDevTools, nickname, isCreator, isBlocked, contentFlagged, registered, activeSeconds, isPro, subscription } = useSocket();
  const coinState = useCoins();
  const audioIdentityHook = useAudioIdentity(socket);
  const coinStateWithAds = useMemo(
    () => ({ ...coinState, adsEnabled, adScripts }),
    [coinState, adsEnabled, adScripts]
  );
  const [swUpdateReg, setSwUpdateReg] = useState(null);

  const displayCoinBalance = audioIdentityHook.identity?.coins ?? coinState.balance;

  useEffect(() => {
    return watchServiceWorkerUpdates((_phase, reg) => {
      if (reg?.waiting) setSwUpdateReg(reg);
    });
  }, []);

  useEffect(() => {
    if (!audioIdentityHook.identity?.username) return undefined;
    const key = `audio:${String(audioIdentityHook.identity.username).toLowerCase()}`;
    void registerBestPush({ ownerKey: key });
    return undefined;
  }, [audioIdentityHook.identity?.username]);

  useEffect(() => {
    clearChunkReloadFlag();
    applyPageSeo();
  }, []);

  useEffect(() => {
    if (appState === STATES.LANDING) {
      applyPageSeo();
      return;
    }
    if (appState === STATES.ADMIN) {
      applyPrivateSessionSeo('Admin');
      return;
    }
    if (appState === STATES.AGENCY) {
      applyPrivateSessionSeo('Agency');
      return;
    }
    if (appState === STATES.CREATOR_PROFILE) return;
    if (appState === STATES.CHAT && mode) {
      const labels = {
        [MODES.VIDEO]: 'Video Chat',
        [MODES.TEXT]: 'Text Chat',
        [MODES.GROUP_VIDEO]: 'Group Video',
        [MODES.GROUP_TEXT]: 'Voice Room',
        [MODES.LIVES]: 'Lives',
      };
      applyPrivateSessionSeo(labels[mode] || 'Chat');
    }
  }, [appState, mode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const parsed = parseOpaqueLocation();
      if (parsed.kind === 'blocked') {
        replaceOpaqueUrl('/');
        toast('Open Live and Audio from the app. That link is not valid.', { type: 'warn' });
        return;
      }
      if (parsed.kind === 'profile') {
        setCreatorHandle(parsed.navId);
        setAppState(STATES.CREATOR_PROFILE);
        return;
      }
      if (parsed.kind === 'legacy-join') {
        try {
          const grant = await requestNavGrant('join', parsed.roomId);
          const url = new URL(grant.path, window.location.origin);
          if (parsed.pa) url.searchParams.set('pa', parsed.pa);
          if (parsed.asCohost) url.searchParams.set('cohost', '1');
          if (!cancelled) {
            replaceOpaqueUrl(`${url.pathname}${url.search}`);
            setPendingJoinRoomId(parsed.roomId);
            setJoinLinkOpts({ paToken: parsed.pa || null, asCohost: parsed.asCohost });
          }
        } catch {
          if (!cancelled) {
            replaceOpaqueUrl('/');
            toast('That invite is no longer valid.', { type: 'warn' });
          }
        }
        return;
      }
      if (parsed.kind !== 'page') return;
      const verified = await verifyNavGrant({ n: parsed.n, auth: parsed.auth, extra: parsed.extra });
      if (cancelled) return;
      if (!verified.ok) {
        replaceOpaqueUrl('/');
        toast('This page needs a valid session. Open it from Helloooo.', { type: 'warn' });
        return;
      }
      if (verified.page === 'join' && parsed.extra) {
        setPendingJoinRoomId(parsed.extra);
        setJoinLinkOpts({ paToken: parsed.pa || null, asCohost: parsed.asCohost });
        return;
      }
      const nextMode = modeForPage(verified.page);
      if (nextMode) {
        setMode(nextMode);
        setAppState(STATES.CHAT);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (!payment) return;

    const clearPaymentQuery = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      url.searchParams.delete('session_id');
      url.searchParams.delete('product');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    };

    if (payment === 'cancel') {
      setPaymentNotice('Payment cancelled.');
      clearPaymentQuery();
      return;
    }

    if (payment !== 'success') return;

    let cancelled = false;
    verifyStripeReturn(params)
      .then((result) => {
        if (cancelled || !result) return;
        if (result.product === 'unblock') {
          setPaymentNotice('Payment successful — access restored.');
        } else if (result.product === 'pro') {
          setPaymentNotice('Pro activated — enjoy your premium features!');
        } else {
          setPaymentNotice('Payment successful.');
        }
      })
      .catch((e) => {
        if (!cancelled) setPaymentNotice(e.message || 'Payment verification failed.');
      })
      .finally(() => {
        if (!cancelled) clearPaymentQuery();
      });

    return () => { cancelled = true; };
  }, []);

  // Surface payment results as global toasts
  useEffect(() => {
    if (!paymentNotice) return;
    toast(paymentNotice, { type: 'success', duration: 6000 });
    setPaymentNotice('');
  }, [paymentNotice, toast]);

  useEffect(() => {
    if (!socket || !connected || !pendingJoinRoomId) return;
    const rid = pendingJoinRoomId;
    fetch(`${API_BASE}/api/rooms/${rid}`)
      .then((r) => r.json())
      .then((room) => {
        if (room.joinable && room.mode) {
          setInterest(room.interest || 'general');
          setMode(room.mode);
          setRoomId(rid);
          setAppState(STATES.CHAT);
          window.history.pushState({ mode: room.mode, roomId: rid }, '');
        } else {
          setRoomJoinNotice('That room is no longer available. Pick a mode below to start a new session.');
        }
      })
      .catch(() => {
        setRoomJoinNotice('Could not reach the server to join that room. Check your connection and try again.');
      })
      .finally(() => setPendingJoinRoomId(null));
  }, [socket, connected, pendingJoinRoomId]);

  // Surface room-join problems as global toasts
  useEffect(() => {
    if (!roomJoinNotice) return;
    toast(roomJoinNotice, { type: 'warn', duration: 6000 });
    setRoomJoinNotice('');
  }, [roomJoinNotice, toast]);

  // Surface moderation flags as global toasts (replaces the old fixed banner)
  useEffect(() => {
    if (!contentFlagged) return;
    toast(`⚠️ ${String(contentFlagged)}`, { type: 'warn', duration: 6000 });
  }, [contentFlagged, toast]);

  useEffect(() => {
    if (!socket) return;
    const onReconnectToken = (data) => {
      if (data?.token && data?.roomId) {
        saveReconnectSession({ token: data.token, roomId: data.roomId, mode: data.mode, nickname: joinMeta.displayNickname });
      }
    };
    const onReconnectSuccess = (data) => {
      clearReconnectSession();
      if (!data?.roomId || !data?.mode) {
        setAppState(STATES.LANDING);
        setMode(null);
        setRoomId(null);
        return;
      }
      setRoomId(data.roomId);
      setMode(data.mode);
      setInterest(data.interest || 'general');
      setAppState(STATES.CHAT);
    };
    const onReconnectFailed = () => clearReconnectSession();
    socket.on('reconnect-token', onReconnectToken);
    const saved = loadReconnectSession();
    if (saved?.token && connected) {
      socket.emit('reconnect-session', { token: saved.token });
    }
    socket.on('reconnect-success', onReconnectSuccess);
    socket.on('reconnect-failed', onReconnectFailed);
    return () => {
      socket.off('reconnect-token', onReconnectToken);
      socket.off('reconnect-success', onReconnectSuccess);
      socket.off('reconnect-failed', onReconnectFailed);
    };
  }, [socket, connected, joinMeta.displayNickname]);

  useEffect(() => {
    if (appState === STATES.CHAT && !mode) {
      setAppState(STATES.LANDING);
      setRoomId(null);
    }
  }, [appState, mode]);

  const { setBalance } = coinState;
  useEffect(() => {
    if (socket) {
    const onCoinsUpdated = ({ coins: next, audio }) => {
      if (next === undefined) return;
      if (audioIdentityHook.identity?.username) {
        if (audio) setBalance(next);
      } else if (!audio) {
        setBalance(next);
      }
    };
      const onConnected = (data) => {
        if (data?.coins !== undefined) setBalance(data.coins);
      };
      socket.on('coins-updated', onCoinsUpdated);
      socket.on('connected', onConnected);

      // Activity Accumulator: Heartbeat every 20s to ensure milestones (3m, 1h) are tracked by server
      const activityInterval = setInterval(() => {
        if (connected) {
          socket.emit('accumulate-activity', { seconds: 20 });
        }
      }, 20000);

      return () => {
        socket.off('coins-updated', onCoinsUpdated);
        socket.off('connected', onConnected);
        clearInterval(activityInterval);
      };
    }
  }, [socket, connected, setBalance, audioIdentityHook.identity?.username]);

  // Manage browser back button
  useEffect(() => {
    const handlePopState = (e) => {
      // If we're not on the landing page, go back to it
      if (appState !== STATES.LANDING) {
        handleBackInternal();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [appState]);


  const handleBackInternal = () => {
    if (roomId && socket) {
      socket.emit('leave-room', { roomId });
      if (mode === MODES.GROUP_TEXT) {
        socket.emit('audio:leave', { channelId: roomId });
      }
    } else if ((mode === MODES.GROUP_TEXT || mode === MODES.GROUP_VIDEO) && socket) {
      // Leaving a group mode while still queuing (no room yet) — release the queue slot
      socket.emit('cancel-group-queue');
    }
    if (mode === MODES.TEXT || mode === MODES.VIDEO) socket?.emit('cancel-find-partner');
    if (mode === MODES.GROUP_TEXT) {
      // Keep voice identity for creators (re-linked from session); clear for guests only.
      try {
        const hasCreator = !!window.localStorage?.getItem?.('mm_creator_session');
        if (!hasCreator) void audioIdentityHook.logout();
      } catch {
        void audioIdentityHook.logout();
      }
    }
    setRoomId(null);
    setAppState(STATES.LANDING);
    setMode(null);
    setInterest('general');
    setJoinMeta((prev) => ({ ...prev, createLive: false }));
    replaceOpaqueUrl('/');
  };

  // Called when user selects a mode from the landing page
  const handleJoin = (interestVal, nick, m, rid = null, meta = {}) => {
    if (!socket || !connected || isJoining) return;
    setIsJoining(true);
    const intst = (interestVal || 'general').trim().toLowerCase() || 'general';
    const displayNick = (nick || joinMeta.displayNickname || 'Anonymous').trim().slice(0, 30) || 'Anonymous';
    const page = pageForMode(m);
    void (async () => {
      try {
        if (page) {
          const grant = await requestNavGrant(page, rid || '');
          pushOpaqueUrl(grant.path);
        }
        setJoinMeta((prev) => ({
          ...prev,
          ...meta,
          displayNickname: displayNick,
          createLive: !!meta.createLive,
        }));
        setInterest(intst);
        setMode(m);
        setRoomId(rid);
        setAppState(STATES.CHAT);
      } catch (err) {
        replaceOpaqueUrl('/');
        toast(err?.message || 'Could not open that page.', { type: 'warn' });
      } finally {
        setTimeout(() => setIsJoining(false), 500);
      }
    })();
  };

  const handleJoined = (rid) => setRoomId(rid);

  const handleAdminJoin = (rid, m, intst) => {
    const page = pageForMode(m);
    void (async () => {
      try {
        if (page) {
          const grant = await requestNavGrant(page, rid || '');
          pushOpaqueUrl(grant.path);
        }
        setRoomId(rid);
        setMode(m);
        setInterest(intst || 'general');
        setAppState(STATES.CHAT);
      } catch (err) {
        toast(err?.message || 'Could not open that page.', { type: 'warn' });
      }
    })();
  };

  const handleLeaveRoom = () => {
    handleBack();
  };

  const handleCancelQueue = () => {
    handleBack();
  };

  const handleBack = () => {
    if (appState !== STATES.LANDING) {
      window.history.back(); // This will trigger popstate
    }
  };

  const handleFindNewPartner = () => {
    if (!socket) return;
    if (roomId) socket.emit('leave-room', { roomId });
    setRoomId(null);
    socket.emit('find-partner', {
      mode,
      interest,
      nickname: nickname || 'Anonymous',
      conversationMode: joinMeta.conversationMode || 'free',
      topicContract: joinMeta.topicContract || 'chill',
      language: joinMeta.language,
      region: joinMeta.region || country,
    });
  };

  const handleFindNewPod = () => {
    if (!socket) return;
    if (roomId) socket.emit('leave-room', { roomId });
    setRoomId(null);
    socket.emit('join-group-by-topics', { interest, nickname: nickname || 'Anonymous', mode });
  };

  const renderContent = () => {
    if (appState === STATES.ADMIN) return <AdminDashboard onJoinRoom={handleAdminJoin} />;
    if (appState === STATES.AGENCY) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <AgencyDashboard />
        </Suspense>
      );
    }
    if (isBlocked) {
      return (
        <div className="min-h-screen bg-realm-void flex items-center justify-center p-6 text-white font-sans text-center">
          <div className="max-w-md w-full p-8 rounded-3xl bg-rose-500/10 border border-rose-500/20 backdrop-blur-xl animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center bg-rose-500/20 mb-6 border border-rose-500/50 text-rose-500 text-3xl">⚠️</div>
            <h1 className="text-2xl font-bold mb-3 tracking-tight text-white">Access Restricted</h1>
            <p className="text-sm text-white/50 mb-8 leading-relaxed">
              Your connection has been blocked due to multiple violations of our terms of service and community guidelines.
            </p>
            <div className="bg-black/40 p-5 rounded-2xl border border-white/5 mb-8">
              <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">Unblock Account</h3>
              <p className="text-[11px] text-white/40 mb-4">Pay the unblock fee via Stripe, Razorpay, or test mode (dev) to restore access.</p>
              <button className="btn w-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 shadow-none hover:text-white py-3 rounded-xl font-bold text-xs min-h-[48px]" onClick={() => setShowUnblockPay(true)}>
                Pay to unblock
              </button>
            </div>
            <p className="text-[10px] text-white/20">Provide the Admin with your IP if this was a mistake.</p>
            <UnblockPaymentModal open={showUnblockPay} onClose={() => setShowUnblockPay(false)} />
          </div>
        </div>
      );
    }
    if (appState === STATES.CREATOR_PROFILE && creatorHandle) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <CreatorPublicProfile handle={creatorHandle} />
        </Suspense>
      );
    }
    if (appState === STATES.LANDING || (appState === STATES.CHAT && !mode)) {
      return (
        <div className="mm-page-enter mmnav-pad">
          <LandingPage
            onJoin={handleJoin}
            connected={connected}
            onlineCount={onlineCount}
            coinState={coinStateWithAds}
            isJoining={isJoining}
            registered={registered}
            currentActiveSeconds={activeSeconds}
            joinMeta={joinMeta}
            setJoinMeta={setJoinMeta}
            country={country}
          />

          {/* Phone navigation. Only here — inside a call or a live the screen
              belongs to the video, and a persistent bar would both cover it and
              make it easy to walk out of a session by accident. */}
          <MobileNav
            active="home"
            onTab={(tab) => {
              void unlockIosMedia();
              if (tab === 'home') return;
              const next = {
                video: MODES.VIDEO,
                live: MODES.LIVES,
                audio: MODES.GROUP_TEXT,
                chat: MODES.TEXT,
              }[tab];
              if (next) handleJoin(interest || 'general', joinMeta.displayNickname, next);
            }}
          />
        </div>
      );
    }
    if (mode === MODES.LIVES) {
      return (
        <IosSwipeBack onBack={handleBack}>
          <div className="mm-page-enter">
            <Suspense fallback={<LoadingFallback />}>
              <LivesApp
                socket={socket}
                identityHook={audioIdentityHook}
                isCreator={isCreator}
                initialCreateLive={!!joinMeta.createLive}
                onExit={handleBack}
              />
            </Suspense>
          </div>
        </IosSwipeBack>
      );
    }
    if (mode === MODES.TEXT) {
      return (
        <IosSwipeBack onBack={handleBack}>
        <div className="mm-page-enter">
          <TextChat
            socket={socket}
            connected={connected}
            country={country}
            onlineCount={onlineCount}
            interest={interest}
            nickname={isCreator ? nickname : (joinMeta.displayNickname || nickname)}
            language={joinMeta.language}
            region={joinMeta.region || country}
            isCreator={isCreator}
            adsEnabled={adsEnabled}
            adScripts={adScripts}
            onBack={handleBack}
            onJoined={handleJoined}
            onFindNewPartner={handleFindNewPartner}
            coinState={coinState}
            registered={registered}
            currentActiveSeconds={activeSeconds}
            conversationMode={joinMeta.conversationMode}
            topicContract={joinMeta.topicContract}
            calmMode={joinMeta.calmMode}
            isPro={isPro}
            subscription={subscription}
          />
        </div>
        </IosSwipeBack>
      );
    }
    if (mode === MODES.VIDEO) {
      return (
        <IosSwipeBack onBack={handleBack}>
        <div className="mm-page-enter">
          <VideoChat
            socket={socket}
            connected={connected}
            country={country}
            onlineCount={onlineCount}
            interest={interest}
            nickname={isCreator ? nickname : (joinMeta.displayNickname || nickname)}
            isCreator={isCreator}
            adsEnabled={adsEnabled}
            adScripts={adScripts}
            onBack={handleBack}
            onJoined={handleJoined}
            onFindNewPartner={handleFindNewPartner}
            coinState={coinState}
            registered={registered}
            currentActiveSeconds={activeSeconds}
            conversationMode={joinMeta.conversationMode}
            topicContract={joinMeta.topicContract}
            calmMode={joinMeta.calmMode}
            isPro={isPro}
            subscription={subscription}
          />
        </div>
        </IosSwipeBack>
      );
    }
    if (mode === MODES.GROUP_TEXT) {
      if (!import.meta.env?.VITE_LEGACY_GROUP_TEXT) {
        return (
          <IosSwipeBack onBack={roomId ? handleLeaveRoom : handleCancelQueue}>
          <div className="mm-page-enter">
            <GroupAudioRoom
              socket={socket}
              coins={audioIdentityHook.identity?.coins ?? 0}
              nickname={audioIdentityHook.identity?.username || 'Anonymous'}
              audioIdentity={audioIdentityHook.identity}
              audioIdentityHook={audioIdentityHook}
              onIdentityUpdate={audioIdentityHook.refresh}
              isCreator={isCreator}
              initialChannelId={roomId}
              initialPaToken={joinLinkOpts.paToken}
              initialAsCohost={joinLinkOpts.asCohost}
              onExit={roomId ? handleLeaveRoom : handleCancelQueue}
            />
          </div>
          </IosSwipeBack>
        );
      }
      return (
        <IosSwipeBack onBack={roomId ? handleLeaveRoom : handleCancelQueue}>
        <div className="mm-page-enter">
          <GroupTextRoom
            roomId={roomId}
            interest={interest}
            nickname={isCreator ? nickname : (joinMeta.displayNickname || nickname)}
            isCreator={isCreator}
            myCountry={country}
            socket={socket}
            isQueuing={!roomId}
            onLeave={roomId ? handleLeaveRoom : handleCancelQueue}
            onFindNewPod={roomId ? handleFindNewPod : undefined}
            onJoined={handleJoined}
            coinState={coinState}
            adsEnabled={adsEnabled}
            adScripts={adScripts}
            registered={registered}
            currentActiveSeconds={activeSeconds}
          />
        </div>
        </IosSwipeBack>
      );
    }
    if (mode === MODES.GROUP_VIDEO) {
      return (
        <IosSwipeBack onBack={roomId ? handleLeaveRoom : handleCancelQueue}>
        <div className="mm-page-enter">
          <GroupVideoRoom
            roomId={roomId}
            interest={interest}
            nickname={isCreator ? nickname : (joinMeta.displayNickname || nickname)}
            isCreator={isCreator}
            myCountry={country}
            socket={socket}
            isQueuing={!roomId}
            onLeave={roomId ? handleLeaveRoom : handleCancelQueue}
            onFindNewPod={roomId ? handleFindNewPod : undefined}
            onJoined={handleJoined}
            coinState={coinState}
            adsEnabled={adsEnabled}
            adScripts={adScripts}
            registered={registered}
            currentActiveSeconds={activeSeconds}
            conversationMode={joinMeta.conversationMode}
            topicContract={joinMeta.topicContract}
            calmMode={joinMeta.calmMode}
            isPro={isPro}
          />
        </div>
        </IosSwipeBack>
      );
    }
    return (
      <div className="mm-page-enter">
        <LandingPage
          onJoin={handleJoin}
          connected={connected}
          onlineCount={onlineCount}
          coinState={coinStateWithAds}
          isJoining={isJoining}
          registered={registered}
          currentActiveSeconds={activeSeconds}
          joinMeta={joinMeta}
          setJoinMeta={setJoinMeta}
          country={country}
        />
      </div>
    );
  };

  if (!gateVerified) {
    return (
      <AgeVerificationGate onVerified={() => setGateVerified(true)} />
    );
  }

  return (
    <>
      <ConnectionBanner connected={connected} />
      <div className="relative flex min-h-[100dvh] w-full max-w-[100vw] flex-1 flex-col overflow-x-hidden mm-mobile-safe">
        <Suspense fallback={<LoadingFallback />}>
          {renderContent()}
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <GiftOverlayLazy socket={socket} />
      </Suspense>

      <PwaInstallPrompt
        variant={isLiveAudioSurface(mode) ? 'live' : 'default'}
      />
      <PwaUpdatePrompt registration={swUpdateReg} onDismiss={() => setSwUpdateReg(null)} />
    </>
  );
}
