import { useState, useRef, useCallback, useEffect } from 'react';
import { pickRecorderMimeType } from '../utils/groupGridCapture';

/**
 * Shared YouTube Live pipeline — socket signaling + MediaRecorder chunk upload.
 */
export function useYoutubeLive({ socket, enabled = true, roomId = null, onStop } = {}) {
  const [isLive, setIsLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const roomIdRef = useRef(roomId);
  const onStopRef = useRef(onStop);

  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);

  const stopLive = useCallback(() => {
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      } catch { /* ignore */ }
      recorderRef.current = null;
    } else if (socket && enabled) {
      socket.emit('youtube-live-stop', { roomId: roomIdRef.current || undefined });
      setIsLive(false);
      onStopRef.current?.();
    }
  }, [socket, enabled]);

  const startLive = useCallback(async (streamKey, mediaStream) => {
    if (!enabled || !socket) throw new Error('Live streaming unavailable.');
    if (!mediaStream?.getTracks?.().length) throw new Error('No media stream to broadcast.');

    setBusy(true);
    setError('');

    const mimeType = pickRecorderMimeType();
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      setBusy(false);
      const msg = 'WebM recording not supported on this browser.';
      setError(msg);
      throw new Error(msg);
    }

    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Live connect timeout — try again.')), 15000);
        const cleanup = () => {
          clearTimeout(t);
          socket.off('youtube-live-started', onStarted);
          socket.off('youtube-live-error', onErr);
          socket.off('error', onErr);
        };
        const onStarted = () => { cleanup(); resolve(); };
        const onErr = (payload) => {
          cleanup();
          reject(new Error(payload?.message || 'Live failed'));
        };
        socket.once('youtube-live-started', onStarted);
        socket.once('youtube-live-error', onErr);
        socket.once('error', onErr);
        socket.emit('youtube-live-start', {
          roomId: roomIdRef.current || undefined,
          streamKey,
        });
      });
    } catch (err) {
      setBusy(false);
      setError(err.message || 'Could not go live');
      throw err;
    }

    const recorder = new MediaRecorder(mediaStream, { mimeType, videoBitsPerSecond: 2_500_000 });
    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0) socket.emit('youtube-live-chunk', await e.data.arrayBuffer());
    };
    recorder.onstop = () => {
      socket.emit('youtube-live-stop', { roomId: roomIdRef.current || undefined });
      recorderRef.current = null;
      setIsLive(false);
      onStopRef.current?.();
    };
    recorder.start(500);
    recorderRef.current = recorder;
    setIsLive(true);
    setBusy(false);
    return true;
  }, [socket, enabled]);

  useEffect(() => () => {
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      } catch { /* ignore */ }
      recorderRef.current = null;
    }
  }, []);

  return { isLive, busy, error, setError, startLive, stopLive };
}
