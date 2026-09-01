import { useCallback, useEffect, useRef, useState } from 'react';
import { drawFaceBlurFrame, loadFaceLandmarker } from '../utils/faceBlurEngine';

/**
 * AI face blur — MediaPipe Face Landmarker tracks the face mesh each frame
 * and blurs only the oval face region. Returns a publish/display stream for WebRTC.
 */
export function useFaceBlurStream(rawStream, { enabled = false, mirror = false } = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const blurCanvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const outputStreamRef = useRef(null);
  const rafRef = useRef(0);
  const tsRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [processedStream, setProcessedStream] = useState(null);

  const ensureVideo = useCallback(() => {
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      video.setAttribute('playsinline', '');
      video.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;left:-9999px;top:-9999px';
      document.body.appendChild(video);
      videoRef.current = video;
    }
    return videoRef.current;
  }, []);

  useEffect(() => {
    const video = ensureVideo();
    if (!rawStream) {
      video.srcObject = null;
      return undefined;
    }
    video.srcObject = rawStream;
    video.play().catch(() => {});
    return undefined;
  }, [rawStream, ensureVideo]);

  useEffect(() => {
    if (!enabled || !rawStream?.getVideoTracks?.().length) {
      setReady(false);
      setLoading(false);
      setProcessedStream(null);
      outputStreamRef.current = null;
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    loadFaceLandmarker()
      .then((lm) => {
        if (cancelled) return;
        landmarkerRef.current = lm;
        setReady(true);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Face blur model failed to load');
        setLoading(false);
        setReady(false);
      });

    return () => { cancelled = true; };
  }, [enabled, rawStream]);

  useEffect(() => {
    if (!enabled || !ready || !rawStream) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setProcessedStream(null);
      outputStreamRef.current = null;
      return undefined;
    }

    const video = ensureVideo();
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    if (!blurCanvasRef.current) blurCanvasRef.current = document.createElement('canvas');

    const canvas = canvasRef.current;
    const blurCanvas = blurCanvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    const blurCtx = blurCanvas.getContext('2d', { alpha: false });

    if (!outputStreamRef.current) {
      outputStreamRef.current = canvas.captureStream(24);
      const audioTracks = rawStream.getAudioTracks();
      const videoTrack = outputStreamRef.current.getVideoTracks()[0];
      setProcessedStream(new MediaStream([...audioTracks, videoTrack].filter(Boolean)));
    }

    const loop = () => {
      if (video.readyState >= 2 && landmarkerRef.current) {
        tsRef.current = performance.now();
        drawFaceBlurFrame(ctx, blurCtx, video, landmarkerRef.current, mirror, tsRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, ready, rawStream, mirror, ensureVideo]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
      video.remove();
      videoRef.current = null;
    }
    outputStreamRef.current = null;
    canvasRef.current = null;
    blurCanvasRef.current = null;
  }, []);

  const publishStream = enabled && ready && processedStream ? processedStream : rawStream;

  return {
    publishStream,
    displayStream: publishStream,
    ready: enabled ? ready : true,
    loading,
    error,
  };
}
