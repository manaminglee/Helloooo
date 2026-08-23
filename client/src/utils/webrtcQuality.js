/**
 * Adaptive capture + sender bitrate for 1:1 WebRTC.
 * Start low (fast first frame) → ramp when ICE is stable.
 */

export const QUALITY_LADDER = {
  boot: {
    width: 640,
    height: 360,
    frameRate: 24,
    maxBitrate: 450_000,
  },
  mid: {
    width: 960,
    height: 540,
    frameRate: 28,
    maxBitrate: 900_000,
  },
  high: {
    width: 1280,
    height: 720,
    frameRate: 30,
    maxBitrate: 1_800_000,
  },
  low: {
    width: 640,
    height: 360,
    frameRate: 15,
    maxBitrate: 350_000,
  },
};

export function bootVideoConstraints(facingMode = 'user', audioDeviceId = null) {
  const q = QUALITY_LADDER.boot;
  return {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: q.width, max: 1280 },
      height: { ideal: q.height, max: 720 },
      frameRate: { ideal: q.frameRate, max: 30 },
    },
    audio: audioDeviceId
      ? { deviceId: { exact: audioDeviceId }, echoCancellation: true, noiseSuppression: true }
      : { echoCancellation: true, noiseSuppression: true },
  };
}

export async function applyCaptureQuality(stream, tier = 'boot') {
  const vt = stream?.getVideoTracks?.()?.[0];
  if (!vt) return false;
  const q = QUALITY_LADDER[tier] || QUALITY_LADDER.boot;
  try {
    await vt.applyConstraints({
      width: { ideal: q.width },
      height: { ideal: q.height },
      frameRate: { ideal: q.frameRate },
    });
    return true;
  } catch {
    return false;
  }
}

/** Cap outbound RTP bitrate on all video senders (adaptive). */
export async function applySenderBitrate(pc, maxBitrate) {
  if (!pc || !maxBitrate) return;
  const senders = pc.getSenders?.() || [];
  for (const sender of senders) {
    if (sender.track?.kind !== 'video') continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) {
        params.encodings = [{}];
      }
      params.encodings.forEach((enc) => {
        enc.maxBitrate = maxBitrate;
        // Prefer temporal scalability when available — browsers ignore unknown fields
        if (enc.scaleResolutionDownBy == null) enc.scaleResolutionDownBy = 1;
      });
      await sender.setParameters(params);
    } catch {
      /* ignore unsupported */
    }
  }
}

/**
 * After ICE connects: boot → mid (brief) → high, unless forced low bandwidth.
 */
export function scheduleQualityRamp({
  stream,
  getPeerConnection,
  forceLow = false,
  onTier,
} = {}) {
  const timers = [];
  const run = async (tier) => {
    if (forceLow && tier !== 'low') tier = 'low';
    const q = QUALITY_LADDER[tier];
    await applyCaptureQuality(stream, tier);
    const pc = getPeerConnection?.();
    if (pc) await applySenderBitrate(pc, q.maxBitrate);
    onTier?.(tier);
  };

  run(forceLow ? 'low' : 'boot');
  if (!forceLow) {
    timers.push(setTimeout(() => run('mid'), 2500));
    timers.push(setTimeout(() => run('high'), 6000));
  }

  return () => timers.forEach((t) => clearTimeout(t));
}
