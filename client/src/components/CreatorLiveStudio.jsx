import { useEffect, useRef, useState } from 'react';
import { useYoutubeLive } from '../hooks/useYoutubeLive';
import { CreatorLiveModal } from './CreatorLiveModal';

/**
 * Standalone creator broadcast studio — camera preview + YouTube Live.
 */
export function CreatorLiveStudio({ socket, enabled = true, roomId = null, compact = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [startingCam, setStartingCam] = useState(false);

  const youtubeLive = useYoutubeLive({
    socket,
    enabled,
    roomId,
    onStop: () => {
      /* keep preview running after stop */
    },
  });

  const startPreview = async () => {
    if (streamRef.current || startingCam) return;
    setStartingCam(true);
    setPreviewError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => { /* ignore */ });
      }
      setPreviewReady(true);
    } catch (e) {
      setPreviewError(e?.message || 'Camera access denied. Allow camera/mic to go live.');
    } finally {
      setStartingCam(false);
    }
  };

  const stopPreview = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewReady(false);
  };

  useEffect(() => {
    if (enabled) startPreview();
    return () => {
      youtubeLive.stopLive();
      stopPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const handleGoLive = async (streamKey) => {
    if (!streamRef.current) {
      await startPreview();
    }
    if (!streamRef.current) throw new Error('Camera not available.');
    await youtubeLive.startLive(streamKey, streamRef.current);
    setShowKeyModal(false);
  };

  const handleStop = () => {
    youtubeLive.stopLive();
    setShowKeyModal(false);
  };

  return (
    <div className={`rounded-[32px] border border-rose-500/20 bg-rose-500/[0.04] ${compact ? 'p-5' : 'p-8'} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.35em] text-rose-400">YouTube Live Studio</h4>
          <p className="text-[10px] text-white/40 mt-1">Broadcast your camera from anywhere on Helloooo.</p>
        </div>
        {youtubeLive.isLive && (
          <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-[9px] font-black uppercase text-rose-300">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      <div className={`relative overflow-hidden rounded-2xl bg-black border border-white/10 ${compact ? 'aspect-video max-h-48' : 'aspect-video'}`}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="w-full h-full object-cover"
        />
        {!previewReady && !startingCam && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/30 uppercase tracking-widest">
            Camera off
          </div>
        )}
        {startingCam && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/40 animate-pulse uppercase tracking-widest">
            Starting camera…
          </div>
        )}
      </div>

      {previewError && (
        <p className="text-[10px] text-rose-300/90 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2">{previewError}</p>
      )}
      {youtubeLive.error && !showKeyModal && (
        <p className="text-[10px] text-rose-300/90 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2">{youtubeLive.error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!previewReady ? (
          <button
            type="button"
            disabled={startingCam}
            onClick={startPreview}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:bg-white/10"
          >
            Enable camera
          </button>
        ) : youtubeLive.isLive ? (
          <button
            type="button"
            onClick={handleStop}
            className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-[9px] font-black uppercase tracking-widest text-white"
          >
            Stop broadcast
          </button>
        ) : (
          <button
            type="button"
            disabled={youtubeLive.busy || !previewReady}
            onClick={() => { youtubeLive.setError(''); setShowKeyModal(true); }}
            className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-[9px] font-black uppercase tracking-widest text-white"
          >
            {youtubeLive.busy ? 'Connecting…' : 'Go live on YouTube'}
          </button>
        )}
        {previewReady && !youtubeLive.isLive && (
          <button
            type="button"
            onClick={stopPreview}
            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white"
          >
            Camera off
          </button>
        )}
      </div>

      <CreatorLiveModal
        open={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        isLive={youtubeLive.isLive}
        onStart={handleGoLive}
        onStop={handleStop}
      />
    </div>
  );
}
