/** Helpers for reliable WebRTC media attachment in React. */
const attachments = new WeakMap();

export function mergeTrackIntoStream(prevStream, track) {
  if (!track) return prevStream || null;
  const tracks = prevStream ? [...prevStream.getTracks()] : [];
  if (!tracks.some((t) => t.id === track.id)) tracks.push(track);
  return new MediaStream(tracks);
}

export function attachStreamToVideo(el, stream) {
  if (!el) return () => {};
  attachments.get(el)?.();
  if (!stream) {
    el.srcObject = null;
    return () => {};
  }
  el.playsInline = true;
  if (el.srcObject !== stream) el.srcObject = stream;

  // play() can reject for reasons that resolve on their own a moment later —
  // the element not laid out yet, metadata not parsed, the tab in the
  // background, an autoplay gate that lifts on the next user gesture. Each of
  // those fires an event, so instead of one hopeful call we retry on all of
  // them. This is the difference between a working stream and a black pane.
  let disposed = false;
  const play = () => {
    if (disposed || !stream.active || el.srcObject !== stream) return;
    const p = el.play?.();
    if (p?.catch) p.catch(() => {});
  };
  play();

  const onAddTrack = () => {
    // Re-assigning is deliberate: some engines do not pick up a track added to
    // a stream that is already the srcObject.
    el.srcObject = stream;
    play();
  };
  stream.addEventListener('addtrack', onAddTrack);

  const elEvents = ['loadedmetadata', 'canplay', 'stalled', 'suspend', 'emptied'];
  for (const ev of elEvents) el.addEventListener(ev, play);

  // Coming back from the background is the single most common way a video ends
  // up paused with a live track behind it.
  const onVisible = () => { if (!document.hidden) play(); };
  document.addEventListener('visibilitychange', onVisible);
  // Retry audio autoplay inside a real user gesture (required on mobile Safari).
  document.addEventListener('pointerdown', play);
  document.addEventListener('keydown', play);

  const trackCleanups = stream.getTracks().map((t) => {
    const onChange = () => play();
    t.addEventListener('unmute', onChange);
    t.addEventListener('mute', onChange);
    t.addEventListener('ended', onChange);
    return () => {
      t.removeEventListener('unmute', onChange);
      t.removeEventListener('mute', onChange);
      t.removeEventListener('ended', onChange);
    };
  });

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    stream.removeEventListener('addtrack', onAddTrack);
    for (const ev of elEvents) el.removeEventListener(ev, play);
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('pointerdown', play);
    document.removeEventListener('keydown', play);
    trackCleanups.forEach((fn) => fn());
    if (attachments.get(el) === cleanup) attachments.delete(el);
  };
  attachments.set(el, cleanup);
  return cleanup;
}

export function hasLiveRemoteVideo(stream) {
  return !!stream?.getVideoTracks?.().some((t) => t.readyState === 'live');
}

/** True when a video track exists and is not ended — muted / disabled still counts. */
export function hasPlayableVideo(stream) {
  return !!stream?.getVideoTracks?.().some((t) => t.readyState !== 'ended');
}

/** Stop camera/mic immediately — call when leaving any room. */
export function releaseMediaStream(stream, videoEl) {
  if (videoEl) attachments.get(videoEl)?.();
  if (!stream) return;
  stream.getTracks().forEach((t) => {
    try {
      t.enabled = false;
      t.stop();
    } catch {
      /* ignore */
    }
  });
  if (videoEl) {
    try {
      videoEl.srcObject = null;
    } catch {
      /* ignore */
    }
  }
}

export function releaseMediaStreams(streams = [], videoEls = []) {
  streams.forEach((s) => releaseMediaStream(s));
  videoEls.forEach((el) => {
    if (el) {
      attachments.get(el)?.();
      try {
        el.srcObject = null;
      } catch {
        /* ignore */
      }
    }
  });
}
