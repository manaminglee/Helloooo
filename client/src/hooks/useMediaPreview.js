import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Camera + microphone preview for the go-live screen.
 *
 * A creator should never discover a dead mic or a back-facing camera in front
 * of an audience, so the pre-live screen runs a real getUserMedia preview with
 * a live input level. The stream is fully released before LiveKit publishes —
 * Android in particular will not hand the camera to a second consumer.
 */
export function useMediaPreview({ enabled = true, videoRef }) {
  const [facing, setFacing] = useState('user');
  const [micOn, setMicOn] = useState(true);
  const [level, setLevel] = useState(0);          // 0..1 smoothed input level
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(0);
  const facingRef = useRef('user');

  const teardownMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
  }, []);

  /** Releases camera and mic. Must run before LiveKit takes over. */
  const stop = useCallback(() => {
    teardownMeter();
    streamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* */ } });
    streamRef.current = null;
    setReady(false);
    setLevel(0);
  }, [teardownMeter]);

  const startMeter = useCallback((stream) => {
    teardownMeter();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      let smoothed = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // RMS around the 128 midpoint → a level that tracks speech, not noise.
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const scaled = Math.min(1, rms * 3.2);
        smoothed = scaled > smoothed ? scaled : smoothed * 0.86 + scaled * 0.14;
        setLevel(smoothed);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* meter is a nicety, never a blocker */ }
  }, [teardownMeter]);

  const open = useCallback(async (nextFacing) => {
    stop();
    const want = nextFacing || facingRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: want, width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      facingRef.current = want;
      setFacing(want);
      setError('');
      setReady(true);
      if (videoRef?.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play?.().catch(() => {});
      }
      stream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
      startMeter(stream);
      return true;
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      const missing = e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError';
      setError(
        denied ? 'Camera and microphone are blocked. Allow access in your browser settings to go live.'
          : missing ? 'No camera found on this device.'
          : 'Could not start the camera. Close other apps using it and try again.',
      );
      setReady(false);
      return false;
    }
  // micOn is applied to the tracks directly; re-opening on every toggle would
  // restart the camera for no reason.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop, startMeter, videoRef]);

  const flip = useCallback(() => {
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    return open(next);
  }, [open]);

  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      const next = !on;
      streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
      if (!next) setLevel(0);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) { stop(); return undefined; }
    void open();
    return stop;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Phones suspend the camera when the app is backgrounded; reacquire on return.
  useEffect(() => {
    if (!enabled) return undefined;
    const onVis = () => {
      if (!document.hidden && !streamRef.current) void open();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled, open]);

  return { facing, micOn, level, error, ready, flip, toggleMic, retry: () => open(), stop };
}
