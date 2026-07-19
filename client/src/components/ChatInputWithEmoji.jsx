import { useRef, useState } from 'react';
import { EmojiPicker } from './EmojiPicker';

export function ChatInputWithEmoji({
  value,
  onChange,
  onSend,
  placeholder = 'Type a message...',
  disabled = false,
  multiline = false,
  className = '',
  inputClassName = '',
  showVoice = false,
  onVoiceMessage,
  enterToSend = true,
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef(null);
  const mediaRef = useRef(null);
  const recorderRef = useRef(null);
  const [recording, setRecording] = useState(false);

  const insertEmoji = (emoji) => {
    onChange((value || '') + emoji);
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline && !e.shiftKey) {
      if (!enterToSend) return; // pref off — require the send button
      e.preventDefault();
      onSend?.();
    }
  };

  const startVoice = async () => {
    if (!showVoice || !onVoiceMessage || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (ev) => chunks.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        if (blob.size > 120000) return;
        const reader = new FileReader();
        reader.onloadend = () => onVoiceMessage(reader.result);
        reader.readAsDataURL(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
        setRecording(false);
      }, 8000);
    } catch {
      setRecording(false);
    }
  };

  const InputTag = multiline ? 'textarea' : 'input';

  return (
    <div className={`relative flex items-end gap-2 w-full ${className}`}>
      <div className="relative flex-1 min-w-0">
        <InputTag
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={multiline ? 2 : undefined}
          className={`w-full min-h-[48px] rounded-xl border border-white/10 bg-[#0f1117] px-4 py-3 text-base text-white outline-none focus:border-white/25 placeholder:text-white/30 ${inputClassName}`}
        />
        {showEmoji && (
          <div className="absolute bottom-full left-0 mb-2 w-full max-w-[280px]">
            <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowEmoji((v) => !v)}
        className="shrink-0 min-h-[48px] min-w-[48px] rounded-xl border border-white/10 bg-white/5 text-xl hover:bg-white/10"
        aria-label="Insert emoji"
      >
        😊
      </button>
      {showVoice && (
        <button
          type="button"
          onClick={startVoice}
          className={`shrink-0 min-h-[48px] min-w-[48px] rounded-xl border text-lg ${recording ? 'border-rose-500/50 bg-rose-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
          aria-label="Record voice message"
        >
          🎤
        </button>
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !String(value || '').trim()}
        className="shrink-0 min-h-[48px] min-w-[48px] rounded-xl bg-white text-black font-semibold disabled:opacity-40"
        aria-label="Send message"
      >
        ➤
      </button>
      <input ref={mediaRef} type="file" className="hidden" />
    </div>
  );
}
