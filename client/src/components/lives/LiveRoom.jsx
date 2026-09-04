import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { useLiveRoom } from '../../hooks/useLiveRoom';
import { useLiveKitLive } from '../../hooks/useLiveKitLive';
import { useLiveKitOpponent } from '../../hooks/useLiveKitOpponent';
import { useFloatingReactions } from '../../hooks/useFloatingReactions';
import { useLiveViewport, useLiveBodyLock } from '../../hooks/useLiveViewport';
import { hapticTap, hapticSuccess } from '../../utils/haptics';
import { NutsSymbol } from '../NutsSymbol';
import { MmIcon } from '../icons/MmIcon';
import { VerifiedBadge } from '../icons/VerifiedBadge';
import CreatorSheet from './CreatorSheet';
import { AudioCoinShop } from '../AudioIdentityGate';
import LiveGiftTray from './LiveGiftTray';
import {
  LiveViewerSheet, LiveUserSheet, LiveModerationSheet, LiveReportSheet, LiveStatsSheet,
} from './LiveSheets';
import { GiftArt } from '../icons/GiftArt';
import {
  Avatar, CommentStream, HeartLayer, GiftBanners, FullscreenGift,
  StateOverlay, ReconnectBanner, LiveToast, ConfirmDialog, compact,
} from './LiveBits';
import { HellooooLoader } from '../HellooooBrand';
import HpPartnerSheet from './HpPartnerSheet';
import GuestJoinBar from './GuestJoinBar';
import UserProfileSheet from './UserProfileSheet';
import DmChatSheet from './DmChatSheet';

const COMBO_MS = 4000;

/**
 * The live room. One component serves both roles:
 *   mode="viewer" — subscribes to the host's stream, comments, likes, gifts
 *   mode="host"   — publishes camera + mic, plus mod tools and earnings
 *
 * The video element is mounted once, outside every state branch, so a role
 * change, sheet or comment burst never remounts (and therefore never
 * restarts) the media stream.
 */
export default function LiveRoom({
  socket,
  live,
  mode = 'viewer',
  identity,
  identityHook,
  onExit,
  onEndLive,
  onSwitchBattleLive = null,
}) {
  const isHost = mode === 'host';
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const opponentVideoRef = useRef(null);
  const inputRef = useRef(null);

  useLiveBodyLock();
  useLiveViewport(rootRef);

  const { hearts, burst, remove } = useFloatingReactions();

  const onReaction = useCallback((count, colors) => burst(count, colors), [burst]);

  const room = useLiveRoom(socket, live?.id, {
    asHost: isHost,
    onReaction,
    handle: isHost ? null : live?.handle,   // hosts never see a Follow button
  });
  const {
    comments, pinnedComment, viewerCount, likes, banners, fullscreenGift,
    battle, topGifter, stats, settings, isModerator, muted,
    roomState, endSummary, notice, following, followKnown,
    sendComment, sendGift, react, follow, moderation, toast,
  } = room;

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [beautyOn, setBeautyOn] = useState(true);
  const [text, setText] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [modOpen, setModOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [userSheet, setUserSheet] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [combo, setCombo] = useState(null);
  const [soundOn, setSoundOn] = useState(isHost);
  const [liked, setLiked] = useState(false);
  const [hpOpen, setHpOpen] = useState(false);
  const [dmPeer, setDmPeer] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [guestState, setGuestState] = useState(null);
  const [battleSpark, setBattleSpark] = useState(false);
  const [mutualFollow, setMutualFollow] = useState(false);

  const [guestPublish, setGuestPublish] = useState(false);

  const media = useLiveKitLive({
    enabled: !!live?.id && roomState !== 'ended' && roomState !== 'removed',
    socket,
    liveId: live?.id,
    asHost: isHost,
    asGuest: !isHost && guestPublish,
    videoElRef: videoRef,
    mirrorLocal: isHost || guestPublish,
    beautyEnabled: (isHost || guestPublish) && (live?.beautyEnabled !== false) && beautyOn,
  });

  /* HP split screen. `hpActive` is derived straight from the battle record, so
     the moment the server ends the battle — a side exiting, the timer, a host
     dropping — the opponent pane unmounts and this room goes full-bleed again
     without any extra teardown step. */
  const hpActive = battle?.status === 'active'
    && (battle.liveA === live?.id || battle.liveB === live?.id);
  const mySide = hpActive ? (battle.liveA === live?.id ? 'A' : 'B') : null;

  const opponent = useLiveKitOpponent({
    enabled: hpActive && roomState !== 'ended' && roomState !== 'removed',
    socket,
    liveId: live?.id,
    battleId: hpActive ? battle.id : null,
    videoElRef: opponentVideoRef,
  });

  const leaveHp = useCallback(() => {
    if (!socket || !live?.id) return;
    socket.emit('live:hp-leave', { liveId: live.id });
  }, [socket, live?.id]);

  const meLabel = mySide === 'B' ? battle?.handleB : battle?.handleA;
  const themLabel = mySide === 'B' ? battle?.handleA : battle?.handleB;
  const myScore = mySide === 'B' ? battle?.scoreB : battle?.scoreA;
  const theirScore = mySide === 'B' ? battle?.scoreA : battle?.scoreB;
  const opponentLiveId = mySide === 'B' ? battle?.liveA : battle?.liveB;

  const comboTimer = useRef(null);
  const balance = identity?.coins ?? 0;

  // --- sound unlock (mobile autoplay policy) --------------------------------
  const unlockSound = useCallback(() => {
    if (soundOn) return;
    setSoundOn(true);
    document.querySelectorAll('audio').forEach((a) => { void a.play?.().catch(() => {}); });
    void videoRef.current?.play?.().catch(() => {});
  }, [soundOn]);

  // --- likes ----------------------------------------------------------------
  const onLike = useCallback(() => {
    unlockSound();
    hapticTap(10);
    react(1);
    setLiked(true);
    setTimeout(() => setLiked(false), 380);
  }, [react, unlockSound]);

  // --- gifts + combo --------------------------------------------------------
  const armCombo = useCallback((gift) => {
    clearTimeout(comboTimer.current);
    setCombo((prev) => ({
      gift,
      count: prev?.gift?.id === gift.id ? prev.count + 1 : 1,
      key: Date.now(),
    }));
    comboTimer.current = setTimeout(() => setCombo(null), COMBO_MS);
  }, []);

  /* The tray hands us the full gift record, so the combo button can render the
     right icon and price without a second catalog lookup. */
  const sendFromTray = useCallback(async (giftId, side, gift) => {
    const res = await sendGift(giftId, side);
    if (res?.ok) {
      hapticSuccess();
      identityHook?.refresh?.();
      armCombo(gift || { id: giftId, tier: 'basic' });
    }
    return res;
  }, [sendGift, identityHook, armCombo]);

  const repeatCombo = useCallback(async () => {
    if (!combo?.gift?.id) return;
    hapticTap(8);
    const res = await sendGift(combo.gift.id, 'A');
    if (res?.ok) {
      identityHook?.refresh?.();
      armCombo(combo.gift);
    } else if (res?.insufficient) {
      setCombo(null);
      setGiftOpen(true);
    }
  }, [combo, sendGift, identityHook, armCombo]);

  useEffect(() => {
    if (!socket || !live?.id) return undefined;
    const onGuestAccepted = (p) => {
      if (p.liveId !== live.id) return;
      setGuestPublish(true);
      setGuestState({ joined: true, username: identity?.username });
    };
    const onGuestReq = (p) => {
      if (p.liveId !== live.id) return;
      setGuestState({ pending: true, username: p.username, socketId: p.socketId });
    };
    const onGuestJoined = (p) => {
      if (p.liveId !== live.id) return;
      setGuestState({ joined: true, username: p.username, socketId: p.socketId, handle: p.handle });
      setBattleSpark(true);
      setTimeout(() => setBattleSpark(false), 1600);
    };
    const onGuestLeft = (p) => {
      if (p.liveId !== live.id) return;
      setGuestState(null);
      setGuestPublish(false);
    };
    const onBattleStart = () => {
      setBattleSpark(true);
      setTimeout(() => setBattleSpark(false), 1800);
    };
    const onCreatorStarted = (payload) => {
      try {
        if (document.hidden && payload?.handle) {
          import('../../utils/browserNotify').then((m) => {
            m.notifyUser?.(`@${payload.handle} is live`, { body: payload.title || 'Tap to watch' });
          });
        }
      } catch { /* */ }
    };
    socket.on('live:join-request', onGuestReq);
    socket.on('live:join-accepted', onGuestAccepted);
    socket.on('live:guest-joined', onGuestJoined);
    socket.on('live:guest-left', onGuestLeft);
    socket.on('live:battle:start', onBattleStart);
    socket.on('live:creator-started', onCreatorStarted);
    return () => {
      socket.off('live:join-request', onGuestReq);
      socket.off('live:join-accepted', onGuestAccepted);
      socket.off('live:guest-joined', onGuestJoined);
      socket.off('live:guest-left', onGuestLeft);
      socket.off('live:battle:start', onBattleStart);
      socket.off('live:creator-started', onCreatorStarted);
    };
  }, [socket, live?.id, identity?.username]);

  // Mutual follow check for co-live button
  useEffect(() => {
    if (!identity?.username || !live?.handle || isHost) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const tok = localStorage.getItem('mm_audio_session') || '';
        const res = await fetch(`${API_BASE}/api/social/mutual?target=creator:${encodeURIComponent(live.handle)}`, {
          headers: tok ? { 'x-audio-session': tok } : {},
          credentials: 'include',
        });
        const data = await res.json();
        if (!cancelled) setMutualFollow(!!data?.mutual);
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, [identity?.username, live?.handle, isHost]);

  // --- comments -------------------------------------------------------------
  const submit = useCallback(async (e) => {
    e?.preventDefault?.();
    const body = text.trim();
    if (!body) return;
    unlockSound();
    const mention = body.match(/@([\p{L}\p{N}_]{2,30})/u)?.[1] || null;
    const res = await sendComment(body, mention);
    if (res?.ok) setText('');
  }, [text, sendComment, unlockSound]);

  const mention = useCallback((username) => {
    const tag = `@${username} `;
    setText((t) => (t.startsWith(tag) ? t : `${tag}${t}`).slice(0, 200));
    inputRef.current?.focus();
  }, []);

  // --- follow / share -------------------------------------------------------
  const onFollow = useCallback(() => {
    if (following) return;
    hapticTap(12);
    void follow(live?.handle);   // optimistic inside the hook, reverted on failure
  }, [following, follow, live?.handle]);

  const onShare = useCallback(async () => {
    const url = `${window.location.origin}/live/${live.id}`;
    const payload = {
      title: `${live.displayName || live.handle} is LIVE`,
      text: `${live.displayName || live.handle} is LIVE now`,
      url,
    };
    try {
      if (navigator.share) { await navigator.share(payload); return; }
      await navigator.clipboard.writeText(`${payload.text}\n${url}`);
      toast('Live link copied');
    } catch { /* user dismissed the share sheet */ }
  }, [live, toast]);

  const commentsLocked = settings.commentsDisabled && !isModerator;
  const placeholder = muted ? 'You are muted'
    : commentsLocked ? 'Comments are off'
    : settings.slowModeMs ? `Slow mode · ${settings.slowModeMs / 1000}s`
    : 'Say something…';

  const headerCount = useMemo(() => compact(viewerCount), [viewerCount]);

  // --- terminal states ------------------------------------------------------
  if (roomState === 'ended') {
    return (
      <LiveEnded
        summary={endSummary}
        live={live}
        isHost={isHost}
        following={following}
        onFollow={onFollow}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="live-root" ref={rootRef} onPointerDown={unlockSound}>
      {/* 1 · VIDEO — mounted once, never inside a conditional branch. During an
             HP battle the same element just moves into the top half of a split
             frame, so the stream is never torn down and rebuilt. */}
      <div className={`live-video-layer${hpActive ? ' live-video-layer--hp' : ''}`}>
        <div className="live-video-pane">
          {live?.wallpaperUrl && !media.hasMedia && (
            <div className="live-wallpaper" style={{ backgroundImage: `url(${live.wallpaperUrl})` }} />
          )}
          <video
            ref={videoRef}
            className={`live-video${isHost && media.facingMode === 'user' ? ' live-video--mirror' : ''}`}
            playsInline
            webkit-playsinline="true"
            autoPlay
            muted
            disablePictureInPicture
          />
          {hpActive && <span className="live-video-pane__tag">@{meLabel}</span>}
        </div>

        {hpActive && (
          <div className="live-video-pane live-video-pane--opponent">
            <video
              ref={opponentVideoRef}
              className="live-video"
              playsInline
              webkit-playsinline="true"
              autoPlay
              muted
              disablePictureInPicture
            />
            {!opponent.hasMedia && (
              <div className="live-video-pane__waiting">
                <div className="live-state__spinner" aria-hidden />
                <p>{opponent.error ? 'Opponent unavailable' : `Connecting @${themLabel}…`}</p>
              </div>
            )}
            <span className="live-video-pane__tag">@{themLabel}</span>
            {!isHost && opponentLiveId && (
              <button
                type="button"
                className="live-video-pane__switch"
                data-interactive
                onClick={() => onSwitchBattleLive?.(opponentLiveId)}
              >
                Watch
              </button>
            )}
          </div>
        )}
      </div>

      {hpActive && (
        <div className="live-hp-hud" aria-hidden={false}>
          <span className="live-hp-hud__score">{compact(myScore || 0)}</span>
          <span className="live-hp-hud__vs">HP</span>
          <span className="live-hp-hud__score live-hp-hud__score--them">{compact(theirScore || 0)}</span>
        </div>
      )}

      <div className="live-scrim-top" />
      <div className="live-scrim-bottom" />

      <HeartLayer hearts={hearts} onDone={remove} />
      <GiftBanners banners={banners} />
      <FullscreenGift gift={fullscreenGift} />

      {/* 2 · UI GRID */}
      <div className="live-ui">
        {/* --- TOP ------------------------------------------------------- */}
        <header className="live-top">
          <div className="live-host">
            {/* Tapping the creator opens their full profile — the one place a
                viewer can check who they are about to send money to. */}
            <button
              type="button"
              className="live-host__tap"
              onClick={() => setCreatorOpen(true)}
              aria-label={`View ${live?.displayName || live?.handle}'s profile`}
            >
              <Avatar className="live-host__avatar" src={live?.avatarUrl} name={live?.handle} />
            </button>
            <button
              type="button"
              className="live-host__text live-host__text--tap"
              onClick={() => setCreatorOpen(true)}
            >
              <span className="live-host__name">
                {live?.displayName || live?.handle}
                {live?.verified && <VerifiedBadge size={13} />}
              </span>
              <span className="live-host__handle">@{live?.handle}</span>
            </button>
            {!isHost && followKnown && !following && (
              <button type="button" className="live-follow" onClick={onFollow}>
                Follow
              </button>
            )}
            {!isHost && followKnown && following && (
              <span className="live-follow live-follow--done">Following</span>
            )}
          </div>

          <div className="live-top__right">
            <span className="live-badge-live">
              <span className="live-badge-live__dot" />
              <span className="live-badge-live__label">LIVE</span>
              <span className="live-badge-live__count">{headerCount}</span>
            </span>
            <button
              type="button"
              className="live-icon-btn"
              onClick={isHost ? () => setConfirmEnd(true) : onExit}
              aria-label={isHost ? 'End live' : 'Close'}
            >
              <MmIcon name="close" size={15} />
            </button>
          </div>
        </header>

        {/* --- MID ------------------------------------------------------- */}
        <div className="live-mid">
          <div className="live-left">
            {(topGifter || isModerator || battle) && (
              <div className="live-subrow">
                {topGifter && (
                  <span className="live-chip live-chip--gold">
                    <MmIcon name="trophy" size={11} /> {topGifter.username} · {compact(topGifter.coins)}
                  </span>
                )}
                {isHost && (
                  <button type="button" className="live-chip" onClick={() => setStatsOpen(true)}>
                    <NutsSymbol size={11} /> {compact(stats?.nutsEarned ?? live?.nutsEarned ?? 0)}
                  </button>
                )}
              </div>
            )}

            {battle && (
              <div className={`live-battle${battleSpark ? ' live-battle--spark' : ''}`}>
                <div
                  className="live-battle__a"
                  style={{ flexGrow: Math.max(1, battle.scoreA) }}
                  data-interactive
                  onClick={() => onSwitchBattleLive?.(battle.liveA)}
                >
                  @{battle.handleA} · {compact(battle.scoreA)}
                </div>
                <div
                  className="live-battle__b"
                  style={{ flexGrow: Math.max(1, battle.scoreB) }}
                  data-interactive
                  onClick={() => onSwitchBattleLive?.(battle.liveB)}
                >
                  @{battle.handleB} · {compact(battle.scoreB)}
                </div>
              </div>
            )}

            <GuestJoinBar
              socket={socket}
              liveId={live?.id}
              isHost={isHost}
              mutualFollow={mutualFollow}
              guest={guestState}
              onRequestJoin={() => {
                socket?.emit('live:join-request', { liveId: live.id });
              }}
            />

            {pinnedComment && (
              <div className="live-pinned">
                <span className="live-pinned__icon"><MmIcon name="pin" size={12} /></span>
                <span className="live-pinned__text">
                  <strong style={{ color: pinnedComment.nameColor || '#ffd479' }}>
                    {pinnedComment.username}
                  </strong>{' '}
                  {pinnedComment.text}
                </span>
              </div>
            )}

            <CommentStream
              comments={comments}
              onUser={(c) => {
                // Viewers: tapping a name only inserts @mention — no kick/block/remove.
                if (!isModerator && !isHost) {
                  mention(c.username);
                  return;
                }
                setUserSheet({
                  username: c.username,
                  socketId: c.socketId,
                  commentId: c.id,
                  badges: c.badges,
                });
              }}
            />
          </div>

          {/* Right rail */}
          <div className="live-rail">
            {isHost ? (
              <>
                <span className="live-rail__item">
                  <button
                    type="button"
                    className={`live-rail__btn${beautyOn ? '' : ' live-rail__btn--off'}`}
                    onClick={() => { hapticTap(); setBeautyOn((v) => !v); }}
                    aria-label={beautyOn ? 'Beauty filter on' : 'Beauty filter off'}
                    title="Beauty"
                  >
                    <span style={{ fontSize: 14, fontWeight: 900 }}>✨</span>
                    <span className="live-rail__label">Beauty</span>
                  </button>
                </span>
                <span className="live-rail__item">
                  <button
                    type="button"
                    className={`live-rail__btn${hpActive ? ' live-rail__btn--off' : ''}`}
                    onClick={() => {
                      hapticTap();
                      if (hpActive) { leaveHp(); return; }
                      setHpOpen(true);
                    }}
                    aria-label={hpActive ? 'End HP battle' : 'Helloooo Partner'}
                  >
                    <span style={{ fontSize: 12, fontWeight: 900 }}>HP</span>
                    <span className="live-rail__label">{hpActive ? 'End HP' : 'Partner'}</span>
                  </button>
                </span>
                <span className="live-rail__item">
                  <button
                    type="button"
                    className="live-rail__btn"
                    onClick={() => { hapticTap(); media.toggleMic(); }}
                    aria-label={media.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  >
                    <MmIcon name={media.micEnabled ? 'mic' : 'micOff'} size={19} />
                  </button>
                </span>
                <span className="live-rail__item">
                  <button
                    type="button"
                    className="live-rail__btn"
                    onClick={() => { hapticTap(); media.switchCamera(); }}
                    aria-label="Switch camera"
                  >
                    <MmIcon name="cameraFlip" size={19} />
                  </button>
                </span>
                <span className="live-rail__item">
                  <button
                    type="button"
                    className="live-rail__btn"
                    onClick={() => setViewersOpen(true)}
                    aria-label="Viewers"
                  >
                    <MmIcon name="users" size={19} />
                    <span className="live-rail__label">{headerCount}</span>
                  </button>
                </span>
                <span className="live-rail__item">
                  <button
                    type="button"
                    className="live-rail__btn"
                    onClick={() => setModOpen(true)}
                    aria-label="Moderation"
                  >
                    <MmIcon name="shield" size={19} />
                  </button>
                </span>
              </>
            ) : (
              <>
                <span className="live-rail__item">
                  <button
                    type="button"
                    className={`live-rail__btn${liked ? ' live-rail__btn--liked' : ''}`}
                    onClick={onLike}
                    aria-label="Like"
                  >
                    <MmIcon name="heartSolid" size={20} className="live-rail__heart" />
                    <span className="live-rail__label">{compact(likes)}</span>
                  </button>
                </span>
                <span className="live-rail__item">
                  <button
                    type="button"
                    className="live-rail__btn"
                    onClick={() => setViewersOpen(true)}
                    aria-label="Viewers"
                  >
                    <MmIcon name="users" size={19} />
                    <span className="live-rail__label">{headerCount}</span>
                  </button>
                </span>
                <span className="live-rail__item">
                  <button type="button" className="live-rail__btn" onClick={onShare} aria-label="Share">
                    <MmIcon name="share" size={19} />
                  </button>
                </span>
                <span className="live-rail__item">
                  <button
                    type="button"
                    className="live-rail__btn"
                    onClick={() => (isModerator ? setModOpen(true) : setReportOpen(true))}
                    aria-label={isModerator ? 'Moderation' : 'More'}
                  >
                    <MmIcon name={isModerator ? 'shield' : 'more'} size={19} />
                  </button>
                </span>
              </>
            )}
          </div>
        </div>

        {/* --- BOTTOM ---------------------------------------------------- */}
        <div className="live-bottom">
          <form className="live-composer" onSubmit={submit}>
            <input
              ref={inputRef}
              className="live-composer__field"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 200))}
              placeholder={placeholder}
              disabled={muted || commentsLocked}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="on"
              inputMode="text"
              aria-label="Write a comment"
            />
            {!isHost && (
              <button
                type="button"
                className="live-action live-action--gift"
                onClick={() => { unlockSound(); hapticTap(); setGiftOpen(true); }}
                aria-label="Send a gift"
              >
                <MmIcon name="gift" size={19} />
              </button>
            )}
            {isHost ? (
              <button
                type="button"
                className="live-action live-action--end"
                onClick={() => setConfirmEnd(true)}
              >
                End
              </button>
            ) : (
              <button
                type="submit"
                className="live-action live-action--send"
                disabled={!text.trim()}
                aria-label="Send comment"
              >
                <MmIcon name="send" size={17} />
              </button>
            )}
          </form>
        </div>
      </div>

      {/* 3 · FLOATING / OVERLAY LAYERS */}
      {combo && (
        <button type="button" className="live-combo-btn" onClick={repeatCombo} aria-label="Send again">
          <svg className="live-combo-btn__ring" viewBox="0 0 80 80" key={combo.key}>
            <circle
              cx="40" cy="40" r="37"
              strokeDasharray="232"
              style={{ animation: `live-combo-ring ${COMBO_MS}ms linear forwards` }}
            />
          </svg>
          <span className="live-combo-btn__icon">
            <GiftArt id={combo.gift?.id} tier={combo.gift?.tier} size={26} />
          </span>
          <span className="live-combo-btn__count">x{combo.count}</span>
        </button>
      )}

      {!soundOn && media.hasMedia && !isHost && (
        <button type="button" className="live-unmute" onClick={unlockSound}>
          <MmIcon name="volume" size={13} /> Tap for sound
        </button>
      )}

      {roomState === 'reconnecting' && <ReconnectBanner />}

      {(media.connecting || (!media.hasMedia && !media.error)) && roomState !== 'removed' && (
        <StateOverlay state={media.connected ? 'loading' : 'connecting'} />
      )}
      {media.error && !media.hasMedia && <StateOverlay state="error" error={media.error} />}

      {roomState === 'removed' && (
        <div className="live-state">
          <p className="live-state__label">You left this live</p>
          <p className="live-state__hint">{notice?.message || 'The host removed you from this room.'}</p>
          <button type="button" className="live-btn live-btn--primary" onClick={onExit}>Back</button>
        </div>
      )}

      <LiveToast notice={notice} />

      {/* 4 · SHEETS (portalled) */}
      <LiveGiftTray
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        onSend={sendFromTray}
        balance={balance}
        battle={battle}
        onRecharge={() => { setGiftOpen(false); setShopOpen(true); }}
      />

      <LiveViewerSheet
        open={viewersOpen}
        onClose={() => setViewersOpen(false)}
        onFetch={moderation.listViewers}
        canModerate={isModerator}
        onPickUser={(u) => {
          setViewersOpen(false);
          if (!isModerator && !isHost) {
            mention(u.username);
            return;
          }
          setUserSheet(u);
        }}
      />

      <LiveUserSheet
        user={userSheet}
        isModerator={isModerator}
        isHost={isHost}
        onClose={() => setUserSheet(null)}
        onMention={mention}
        onDeleteComment={moderation.deleteComment}
        onPin={moderation.pin}
        onMute={(id, isMuted) => moderation.mute(id, isMuted)}
        onKick={moderation.kick}
        onBlock={moderation.block}
        onPromote={(id, demote) => moderation.promote(id, demote)}
        onReport={(u) => { setUserSheet(null); setReportOpen(u); }}
      />

      <LiveModerationSheet
        open={modOpen}
        onClose={() => setModOpen(false)}
        settings={settings}
        hasPinned={!!pinnedComment}
        onUnpin={() => { moderation.unpin(); setModOpen(false); }}
        onSlowMode={(s) => moderation.slowMode(s)}
        onToggleComments={(d) => moderation.toggleComments(d)}
        onOpenViewers={() => { setModOpen(false); setViewersOpen(true); }}
      />

      <LiveReportSheet
        open={!!reportOpen}
        target={typeof reportOpen === 'object' ? reportOpen : null}
        onClose={() => setReportOpen(false)}
        onSubmit={moderation.report}
      />

      <LiveStatsSheet
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        stats={stats}
        onRefresh={moderation.refreshStats}
      />

      <AudioCoinShop
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        identity={identity}
        onBalanceUpdate={() => identityHook?.refresh?.()}
      />

      <CreatorSheet
        open={creatorOpen}
        creatorKey={live?.handle}
        following={following}
        onFollow={(handle) => follow(handle)}
        onClose={() => setCreatorOpen(false)}
        onWatchLive={() => setCreatorOpen(false)}
        onMessage={(p) => {
          setCreatorOpen(false);
          setDmPeer({ key: `creator:${p.handle || p.id}`, label: `@${p.handle}` });
        }}
      />

      <HpPartnerSheet
        open={hpOpen}
        onClose={() => setHpOpen(false)}
        socket={socket}
        liveId={live?.id}
        live={live}
        battle={battle}
      />

      <UserProfileSheet
        open={!!userProfile}
        username={userProfile?.username}
        following={false}
        isCreatorViewer={isHost}
        onClose={() => setUserProfile(null)}
        onFollow={(u) => {
          socket?.emit('social:follow', { targetKey: `audio:${u}` });
        }}
        onMessage={(u) => {
          setUserProfile(null);
          setDmPeer({ key: `audio:${u}`, label: `@${u}` });
        }}
      />

      <DmChatSheet
        open={!!dmPeer}
        onClose={() => setDmPeer(null)}
        socket={socket}
        peerKey={dmPeer?.key}
        peerLabel={dmPeer?.label}
        identity={identity}
      />

      <ConfirmDialog
        open={confirmEnd}
        title="End Live?"
        message="Your viewers will be returned to the feed and this stream will close."
        confirmLabel="End Live"
        danger
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => { setConfirmEnd(false); onEndLive?.(); }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* ENDED recap                                                               */
/* ------------------------------------------------------------------------ */

function LiveEnded({ summary, live, isHost, following, onFollow, onExit }) {
  const s = summary || {};
  const mins = Math.max(1, Math.round((s.durationMs || 0) / 60000));
  return (
    <div className="live-root">
      <div className="live-ended">
        <Avatar
          className="live-ended__avatar"
          src={s.avatarUrl || live?.avatarUrl}
          name={s.handle || live?.handle}
        />
        <p className="live-ended__title">{isHost ? 'Your live has ended' : 'Live has ended'}</p>
        <p className="live-ended__handle">@{s.handle || live?.handle}</p>

        <div className="live-ended__grid">
          <div className="live-stat">
            <div className="live-stat__label">Viewers</div>
            <div className="live-stat__value">{compact(s.totalViewers || 0)}</div>
          </div>
          <div className="live-stat">
            <div className="live-stat__label">Peak</div>
            <div className="live-stat__value">{compact(s.peakViewers || 0)}</div>
          </div>
          <div className="live-stat">
            <div className="live-stat__label">Likes</div>
            <div className="live-stat__value">{compact(s.likes || 0)}</div>
          </div>
          <div className="live-stat">
            <div className="live-stat__label">Gifts</div>
            <div className="live-stat__value">{compact(s.giftCount || 0)}</div>
          </div>
          <div className="live-stat live-stat--accent">
            <div className="live-stat__label">{isHost ? 'Earned' : 'Gift value'}</div>
            <div className="live-stat__value">
              {compact(isHost ? (s.nutsEarned || 0) : (s.coinsReceived || 0))}
            </div>
          </div>
          <div className="live-stat">
            <div className="live-stat__label">Duration</div>
            <div className="live-stat__value">{mins}m</div>
          </div>
        </div>

        {s.topGifter && (
          <p className="live-ended__handle" style={{ marginTop: 2 }}>
            <MmIcon name="trophy" size={12} /> Top gifter · {s.topGifter.username} ({compact(s.topGifter.coins)})
          </p>
        )}

        <div className="live-ended__actions">
          {!isHost && (
            <button
              type="button"
              className={`live-btn${following ? '' : ' live-btn--primary'}`}
              onClick={onFollow}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
          <button type="button" className="live-btn" onClick={onExit}>
            {isHost ? 'Back to studio' : 'Back to lives'}
          </button>
        </div>
      </div>
    </div>
  );
}
