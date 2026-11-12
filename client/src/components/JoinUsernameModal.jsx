import { useEffect, useRef, useState } from 'react';
import { HellooooLogo } from './HellooooBrand';
import { MotionDialog } from '../motion/MotionDialog';
import { sanitizeDisplayName } from '../utils/displayName';

const MODE_COPY = {
  video: {
    title: 'Join video chat',
    hint: 'Your name is only shown in this session. Stay anonymous if you prefer.',
    cta: 'Start matching',
    icon: '📹',
  },
  text: {
    title: 'Join text chat',
    hint: 'Pick a display name for this chat. Nothing is saved after you leave.',
    cta: 'Find a match',
    icon: '💬',
  },
  group_video: {
    title: 'Join group video',
    hint: 'Free rooms fit 4 people on camera. Creators can open larger rooms. Your name stays in the room only.',
    cta: 'Enter room',
    icon: '🎥',
  },
  group_text: {
    title: 'Enter voice rooms',
    hint: 'Use a display name for the lobby. Voice rooms also ask for a PIN identity next.',
    cta: 'Continue to voice',
    icon: '🎙️',
  },
  lives: {
    title: 'Enter Lives',
    hint: 'Watch creators, send gifts, and chat. Your name shows in comments.',
    cta: 'Browse lives',
    icon: '🔴',
  },
};

/**
 * Professional join gate — collects display name before entering a mode.
 */
export function JoinUsernameModal({
  open,
  mode = 'video',
  initialName = '',
  language = '',
  languages = [],
  onLanguageChange,
  onCancel,
  onConfirm,
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const copy = MODE_COPY[mode] || MODE_COPY.video;

  useEffect(() => {
    if (!open) return undefined;
    setName((initialName || '').slice(0, 30));
    setError('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open, initialName, mode]);

  const trimmed = name.trim();
  const submit = (e) => {
    e?.preventDefault?.();
    const result = sanitizeDisplayName(name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
    onConfirm?.(result.name);
  };

  return (
    <MotionDialog
      open={open}
      onClose={onCancel}
      sheet
      overlayClassName="z-[6200]"
      className="mm-join-modal"
      titleId="mm-join-title"
      as="form"
      panelProps={{ onSubmit: submit }}
    >
        <div className="mm-join-modal__glow" aria-hidden />
        <header className="mm-join-modal__head">
          <HellooooLogo size={36} />
          <span className="mm-join-modal__mode" aria-hidden>{copy.icon}</span>
        </header>
        <h2 id="mm-join-title" className="mm-join-modal__title">{copy.title}</h2>
        <p className="mm-join-modal__hint">{copy.hint}</p>

        <label className="mm-join-modal__label" htmlFor="mm-join-name">
          Display name
        </label>
        <input
          id="mm-join-name"
          ref={inputRef}
          className="mm-join-modal__input"
          value={name}
          onChange={(e) => {
            setName(e.target.value.slice(0, 30));
            if (error) setError('');
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'mm-join-error' : undefined}
          data-autofocus=""
          placeholder="Anonymous"
          maxLength={30}
          autoComplete="nickname"
          enterKeyHint="go"
        />
        {error && (
          <p id="mm-join-error" className="mm-join-modal__error" role="alert">{error}</p>
        )}
        <div className="mm-join-modal__meta">
          <span>{trimmed.length}/30</span>
          <button
            type="button"
            className="mm-join-modal__anon"
            onClick={() => setName('')}
          >
            Stay anonymous
          </button>
        </div>

        {Array.isArray(languages) && languages.length > 0 && (
          <label className="mm-join-modal__label" htmlFor="mm-join-lang">
            Preferred language
            <select
              id="mm-join-lang"
              className="mm-join-modal__select"
              value={language || ''}
              onChange={(e) => onLanguageChange?.(e.target.value)}
            >
              {languages.map((opt) => (
                <option key={opt.value || 'any'} value={opt.value}>
                  {opt.flag ? `${opt.flag} ` : ''}{opt.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mm-join-modal__actions">
          <button type="button" className="mm-join-modal__btn mm-join-modal__btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="mm-join-modal__btn mm-join-modal__btn--primary">
            {copy.cta}
          </button>
        </div>
    </MotionDialog>
  );
}
