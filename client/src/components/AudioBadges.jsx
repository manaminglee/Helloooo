import { useEffect, useRef, useState } from 'react';
import { MmIcon } from './icons/MmIcon';

export function levelTierFromLevel(level) {
  const n = Number(level) || 0;
  if (n >= 45) return 'standingo';
  if (n >= 40) return 'encore';
  if (n >= 35) return 'crescendo';
  if (n >= 30) return 'overture';
  if (n >= 25) return 'anthem';
  if (n >= 20) return 'harmony';
  if (n >= 15) return 'melody';
  if (n >= 10) return 'chorus';
  if (n >= 5) return 'hum';
  if (n >= 1) return 'whisper';
  return '';
}

export function AudioRoleBadge({ role }) {
  if (role === 'host') {
    return (
      <span className="ui-audio-badge ui-audio-badge--host" aria-label="Host">
        <MmIcon name="crown" size={11} />
        Host
      </span>
    );
  }
  if (role === 'moderator') {
    return (
      <span className="ui-audio-badge ui-audio-badge--mod" aria-label="Moderator">
        <MmIcon name="shield" size={11} />
        Mod
      </span>
    );
  }
  return null;
}

export function AudioLevelBadge({ level, label }) {
  const n = Number(level) || 0;
  if (n <= 0) return null;
  const tier = levelTierFromLevel(n);
  const name = label || 'Whisper';
  return (
    <span className={`ui-audio-level ui-audio-level--${tier}`} title={`${name} · Level ${n}`}>
      <span className="ui-audio-level__name">{name}</span>
      <span className="ui-audio-level__n">{n}</span>
    </span>
  );
}

export function useLevelUpFlash(level) {
  const prev = useRef(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const n = Number(level) || 0;
    if (prev.current == null) {
      prev.current = n;
      return undefined;
    }
    if (n > prev.current && prev.current > 0) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1600);
      prev.current = n;
      return () => clearTimeout(t);
    }
    prev.current = n;
    return undefined;
  }, [level]);
  return flash;
}

export function AudioLevelUpBurst({ active }) {
  if (!active) return null;
  return <span className="ui-levelup" aria-hidden />;
}

export default AudioRoleBadge;
