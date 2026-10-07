import { memo } from 'react';
import { CountryFlag } from './CountryFlag';
import { countryName, normalizeCountryCode } from '../utils/countryFlag';

/**
 * The one line in the chat that tells you where you are in a match.
 *
 * Both 1:1 video and group video write these, so they read identically — the
 * search state and the connect state are the same two sentences everywhere,
 * and neither surface has to invent its own wording.
 *
 * The factories below are the only supported way to build one. They stamp a
 * `kind`, which is what the renderer switches on; a plain `system: true`
 * message still renders as the old grey line, so nothing else has to change.
 */

export const MATCH_SEARCHING = 'match-searching';
export const MATCH_CONNECTED = 'match-connected';
export const MATCH_LEFT = 'match-left';

let seq = 0;
const nextId = (p) => `${p}-${Date.now().toString(36)}-${(seq += 1)}`;

export function searchingMessage(text = 'Now finding a stranger…') {
  return { id: nextId('sys-find'), system: true, kind: MATCH_SEARCHING, text, ts: Date.now() };
}

export function connectedMessage(country, { group = false } = {}) {
  const code = normalizeCountryCode(country);
  return {
    id: nextId('sys-conn'),
    system: true,
    kind: MATCH_CONNECTED,
    country: code,
    group,
    text: code
      ? `Connected to a stranger from ${countryName(code)}`
      : 'Connected to a stranger',
    ts: Date.now(),
  };
}

export function leftMessage(country, text) {
  const code = normalizeCountryCode(country);
  return {
    id: nextId('sys-left'),
    system: true,
    kind: MATCH_LEFT,
    country: code,
    text: text || (code ? `The stranger from ${countryName(code)} left` : 'The stranger left'),
    ts: Date.now(),
  };
}

/** True for any message this component knows how to draw. */
export function isMatchStatus(m) {
  return m?.kind === MATCH_SEARCHING || m?.kind === MATCH_CONNECTED || m?.kind === MATCH_LEFT;
}

export const MatchStatusLine = memo(function MatchStatusLine({ m }) {
  if (m?.kind === MATCH_SEARCHING) {
    return (
      <div className="mm-matchline-row" aria-live="polite">
        <span className="mm-matchline mm-matchline--search">
          <span className="mm-matchline__pulse" aria-hidden>
            <i /><i /><i />
          </span>
          {m.text}
        </span>
      </div>
    );
  }

  if (m?.kind === MATCH_CONNECTED) {
    const name = m.country ? countryName(m.country) : '';
    return (
      <div className="mm-matchline-row" aria-live="polite">
        <span className="mm-matchline mm-matchline--live">
          {/* The dot lives INSIDE the sentence span: as a sibling it becomes
              its own flex item and orphans onto a line by itself the moment
              the line wraps in a narrow chat column. */}
          <span className="mm-matchline__text">
            <span className="mm-matchline__dot" aria-hidden />
            Connected to a stranger
            {m.country ? ' from' : ''}
          </span>
          {m.country && (
            <span className="mm-matchline__place">
              <CountryFlag country={m.country} size={16} title={name} />
              <span>{name}</span>
            </span>
          )}
        </span>
      </div>
    );
  }

  if (m?.kind === MATCH_LEFT) {
    return (
      <div className="mm-matchline-row">
        <span className="mm-matchline mm-matchline--gone">
          {m.country && <CountryFlag country={m.country} size={14} />}
          <span className="mm-matchline__text">{m.text}</span>
        </span>
      </div>
    );
  }

  return null;
});

export default MatchStatusLine;
