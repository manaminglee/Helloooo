/**
 * Composites up to 4 video streams into a fixed 2×2 grid (no extra padding beyond letterboxing).
 * Used for creator-only recording and YouTube live ingest.
 */

function drawVideoContain(ctx, video, dx, dy, dw, dh) {
  ctx.fillStyle = '#0c0e1a';
  ctx.fillRect(dx, dy, dw, dh);
  if (!video || video.readyState < 2) return;
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  if (!vw || !vh) return;
  const scale = Math.min(dw / vw, dh / vh);
  const sw = vw * scale;
  const sh = vh * scale;
  const ox = dx + (dw - sw) / 2;
  const oy = dy + (dh - sh) / 2;
  ctx.drawImage(video, ox, oy, sw, sh);
}

export function createGroupGridCapture({ width = 1280, height = 720, fps = 24 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const slots = [null, null, null, null];
  let rafId = 0;
  let running = false;
  let audioCtx = null;
  let audioDest = null;

  const clearSlot = (i) => {
    const v = slots[i];
    if (v) {
      try { v.pause(); } catch { /* ignore */ }
      v.srcObject = null;
    }
    slots[i] = null;
  };

  const setSlot = (i, stream) => {
    clearSlot(i);
    if (!stream) return;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.srcObject = stream;
    v.play().catch(() => { /* ignore */ });
    slots[i] = v;
  };

  const tick = () => {
    if (!running) return;
    ctx.fillStyle = '#0c0e1a';
    ctx.fillRect(0, 0, width, height);
    const hw = width / 2;
    const hh = height / 2;
    drawVideoContain(ctx, slots[0], 0, 0, hw, hh);
    drawVideoContain(ctx, slots[1], hw, 0, hw, hh);
    drawVideoContain(ctx, slots[2], 0, hh, hw, hh);
    drawVideoContain(ctx, slots[3], hw, hh, hw, hh);
    rafId = requestAnimationFrame(tick);
  };

  const mixAudio = (streams) => {
    try {
      audioCtx = new AudioContext();
      audioDest = audioCtx.createMediaStreamDestination();
      streams.forEach((s) => {
        if (!s?.getAudioTracks?.().length) return;
        try {
          const src = audioCtx.createMediaStreamSource(s);
          src.connect(audioDest);
        } catch { /* ignore duplicate / invalid */ }
      });
    } catch {
      audioCtx = null;
      audioDest = null;
    }
  };

  return {
    canvas,
    start(streams = []) {
      streams.slice(0, 4).forEach((s, i) => setSlot(i, s || null));
      mixAudio(streams.filter(Boolean));
      running = true;
      tick();
    },
    updateStreams(streams = []) {
      streams.slice(0, 4).forEach((s, i) => setSlot(i, s || null));
    },
    getCombinedStream() {
      const out = canvas.captureStream(fps);
      audioDest?.stream.getAudioTracks().forEach((t) => out.addTrack(t));
      return out;
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
      slots.forEach((_, i) => clearSlot(i));
      if (audioCtx) {
        audioCtx.close().catch(() => { /* ignore */ });
      }
      audioCtx = null;
      audioDest = null;
    },
  };
}

export function pickRecorderMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
}
