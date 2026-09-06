import { useEffect, useMemo, useState } from 'react';

function hueFromName(name) {
  const s = String(name || 'creator');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function initialsFromName(name) {
  const parts = String(name || '')
    .replace(/^@/, '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function CreatorAvatar({
  src,
  name = '',
  size = 88,
  className = '',
  live = false,
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);

  const label = String(name || 'creator').replace(/^@/, '');
  const initials = useMemo(() => initialsFromName(label), [label]);
  const hue = useMemo(() => hueFromName(label), [label]);
  const url = src && !broken ? String(src).trim() : '';

  return (
    <span
      className={`mm-cavatar ${live ? 'mm-cavatar--live' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: size, '--cavatar-hue': hue }}
      aria-hidden
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="mm-cavatar__img"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="mm-cavatar__fallback">{initials}</span>
      )}
    </span>
  );
}
