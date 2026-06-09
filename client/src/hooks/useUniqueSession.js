import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCopilot, fetchModePrompt, fetchTrustScore, polishCaption } from '../services/nvidiaAiClient';

/**
 * Mutual consent, structured modes, NVIDIA copilot, live captions, data saver.
 */
export function useUniqueSession({
  socket,
  roomId,
  status,
  messages = [],
  interest = 'general',
  conversationMode = 'free',
  topicContract = 'chill',
  calmMode = false,
  autoConsent = false,
}) {
  const [consentComplete, setConsentComplete] = useState(false);
  const [partnerReady, setPartnerReady] = useState(0);
  const [totalPartners, setTotalPartners] = useState(2);
  const [audioIntroComplete, setAudioIntroComplete] = useState(false);
  const [modePrompt, setModePrompt] = useState('');
  const [copilotPrompt, setCopilotPrompt] = useState(null);
  const [trust, setTrust] = useState({ score: 50, level: 'neutral', badges: [] });
  const [aiOnline, setAiOnline] = useState(false);
  const [caption, setCaption] = useState('');
  const [captionsOn, setCaptionsOn] = useState(false);
  const [bytesEstimate, setBytesEstimate] = useState(0);
  const [coOpMinutes, setCoOpMinutes] = useState(0);
  const lastMsgRef = useRef(Date.now());
  const coOpTimerRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    fetchTrustScore().then(setTrust);
  }, []);

  useEffect(() => {
    if (!socket || !roomId) return;

    const onConsent = ({ readyCount, total, allReady }) => {
      setPartnerReady(readyCount || 0);
      setTotalPartners(total || 2);
      if (allReady) setConsentComplete(true);
    };
    const onComplete = () => setConsentComplete(true);
    const onAudio = ({ complete }) => { if (complete) setAudioIntroComplete(true); };
    const onCoOp = ({ minutes, coins }) => {
      setCoOpMinutes(minutes || 0);
      if (coins) window.dispatchEvent(new CustomEvent('mm-co-op-coins', { detail: { coins } }));
    };

    socket.on('consent-status', onConsent);
    socket.on('consent-complete', onComplete);
    socket.on('audio-intro-status', onAudio);
    socket.on('co-op-reward', onCoOp);

    return () => {
      socket.off('consent-status', onConsent);
      socket.off('consent-complete', onComplete);
      socket.off('audio-intro-status', onAudio);
      socket.off('co-op-reward', onCoOp);
    };
  }, [socket, roomId]);

  useEffect(() => {
    if (messages.length) lastMsgRef.current = Date.now();
  }, [messages.length]);

  useEffect(() => {
    if (autoConsent && status === 'connected') setConsentComplete(true);
  }, [autoConsent, status]);

  useEffect(() => {
    if (status !== 'connected') return;
    fetchModePrompt(conversationMode, interest).then((r) => {
      setModePrompt(r.prompt || '');
      setAiOnline(!r.offline);
    });
  }, [status, conversationMode, interest]);

  useEffect(() => {
    if (status !== 'connected' || !consentComplete || calmMode) return;
    const t = setInterval(async () => {
      const silent = (Date.now() - lastMsgRef.current) / 1000;
      if (silent > 25 && silent < 200) {
        const r = await fetchCopilot({
          silenceSeconds: Math.floor(silent),
          mode: conversationMode,
          interest,
          lastMessages: messages.filter((m) => !m.system).slice(-4),
        });
        if (r.prompt) setCopilotPrompt(r.prompt);
      }
    }, 15000);
    return () => clearInterval(t);
  }, [status, consentComplete, conversationMode, interest, messages, calmMode]);

  useEffect(() => {
    if (status !== 'connected' || !roomId || !socket) return;
    coOpTimerRef.current = setInterval(() => {
      socket.emit('co-op-streak-minute', { roomId });
    }, 60000);
    return () => clearInterval(coOpTimerRef.current);
  }, [status, roomId, socket]);

  useEffect(() => {
    if (!captionsOn || calmMode) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = async (ev) => {
      const text = ev.results[ev.results.length - 1][0].transcript;
      if (ev.results[ev.results.length - 1].isFinal && text.trim()) {
        const r = await polishCaption(text.trim());
        setCaption(r.polished || text);
      }
    };
    rec.start();
    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch { /* ignore */ } };
  }, [captionsOn, calmMode]);

  useEffect(() => {
    if (status !== 'connected') return;
    const iv = setInterval(() => setBytesEstimate((b) => b + 45000), 1000);
    return () => clearInterval(iv);
  }, [status]);

  const markReady = useCallback(() => {
    if (socket && roomId) {
      socket.emit('session-consent-ready', { roomId });
      socket.emit('session-set-contract', { roomId, contract: topicContract, mode: conversationMode });
    }
  }, [socket, roomId, topicContract, conversationMode]);

  const markAudioIntroReady = useCallback(() => {
    if (socket && roomId) socket.emit('session-audio-intro-ready', { roomId });
  }, [socket, roomId]);

  const dismissCopilot = () => setCopilotPrompt(null);

  const applyCopilotToInput = (setter) => {
    if (copilotPrompt && setter) setter(copilotPrompt);
    setCopilotPrompt(null);
  };

  return {
    consentComplete,
    partnerReady,
    totalPartners,
    audioIntroComplete,
    modePrompt,
    copilotPrompt,
    trust,
    aiOnline,
    caption,
    captionsOn,
    setCaptionsOn,
    bytesEstimate,
    coOpMinutes,
    markReady,
    markAudioIntroReady,
    dismissCopilot,
    applyCopilotToInput,
  };
}
