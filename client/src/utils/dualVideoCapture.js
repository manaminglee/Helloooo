/**
 * Composites local + remote video for 1:1 creator live/recording (main + PiP).
 */

function attachVideo(stream) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.srcObject = stream;
  v.play().catch(() => { /* ignore */ });
  return v;
}

export function createDualVideoCapture({ localStream, remoteStream, width = 1280, height = 720, fps = 24 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  let running = false;
  let rafId = 0;
  let vLocal = null;
  let vRemote = null;
  let audioCtx = null;
  let audioDest = null;

  const mixAudio = (streams) => {
    try {
      audioCtx = new AudioContext();
      audioDest = audioCtx.createMediaStreamDestination();
      streams.filter(Boolean).forEach((s) => {
        if (!s?.getAudioTracks?.().length) return;
        try {
          audioCtx.createMediaStreamSource(s).connect(audioDest);
        } catch { /* ignore */ }
      });
    } catch {
      audioCtx = null;
      audioDest = null;
    }
  };

  const tick = () => {
    if (!running) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    if (vRemote && vRemote.readyState >= 2) {
      ctx.drawImage(vRemote, 0, 0, width, height);
    } else if (vLocal && vLocal.readyState >= 2) {
      ctx.drawImage(vLocal, 0, 0, width, height);
    }

    if (vLocal && vRemote && vLocal.readyState >= 2) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 4;
      ctx.strokeRect(958, 498, 304, 204);
      ctx.drawImage(vLocal, 960, 500, 300, 200);
    }

    rafId = requestAnimationFrame(tick);
  };

  return {
    start() {
      vLocal = localStream ? attachVideo(localStream) : null;
      vRemote = remoteStream ? attachVideo(remoteStream) : null;
      mixAudio([localStream, remoteStream].filter(Boolean));
      running = true;
      tick();
    },
    getCombinedStream() {
      const out = canvas.captureStream(fps);
      audioDest?.stream.getAudioTracks().forEach((t) => out.addTrack(t));
      if (!out.getVideoTracks().length && localStream?.getVideoTracks?.()[0]) {
        out.addTrack(localStream.getVideoTracks()[0]);
      }
      if (!out.getAudioTracks().length && localStream?.getAudioTracks?.()[0]) {
        out.addTrack(localStream.getAudioTracks()[0]);
      }
      return out;
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
      [vLocal, vRemote].forEach((v) => {
        if (!v) return;
        try { v.pause(); } catch { /* ignore */ }
        v.srcObject = null;
      });
      vLocal = null;
      vRemote = null;
      if (audioCtx) audioCtx.close().catch(() => { /* ignore */ });
      audioCtx = null;
      audioDest = null;
    },
  };
}

/** Returns a MediaStream suitable for YouTube live from 1:1 or solo video. */
export function buildVideoChatLiveStream(localStream, remoteStream) {
  if (!localStream) return null;
  if (!remoteStream) return localStream;
  const capture = createDualVideoCapture({ localStream, remoteStream });
  capture.start();
  const combined = capture.getCombinedStream();
  combined._liveCapture = capture;
  return combined;
}

export function releaseLiveStream(stream) {
  if (stream?._liveCapture) {
    stream._liveCapture.stop();
    delete stream._liveCapture;
  }
}
