/** Helpers for reliable WebRTC media attachment in React. */

export function mergeTrackIntoStream(prevStream, track) {
  if (!track) return prevStream || null;
  const tracks = prevStream ? [...prevStream.getTracks()] : [];
  if (!tracks.some((t) => t.id === track.id)) tracks.push(track);
  return new MediaStream(tracks);
}

export function attachStreamToVideo(el, stream) {
  if (!el || !stream) return () => {};
  if (el.srcObject !== stream) el.srcObject = stream;
  const play = () => {
    if (stream.active) el.play?.().catch(() => {});
  };
  play();
  const onAddTrack = () => {
    el.srcObject = stream;
    play();
  };
  stream.addEventListener('addtrack', onAddTrack);
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
  return () => {
    stream.removeEventListener('addtrack', onAddTrack);
    trackCleanups.forEach((fn) => fn());
  };
}

export function hasLiveRemoteVideo(stream) {
  return !!stream?.getVideoTracks?.().some((t) => t.readyState === 'live');
}

/** Stop camera/mic immediately — call when leaving any room. */
export function releaseMediaStream(stream, videoEl) {
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
      try {
        el.srcObject = null;
      } catch {
        /* ignore */
      }
    }
  });
}
