import { countryToFlag } from '../utils/countryFlag';

/**
 * Live online count with a blinking eye (CSS loop — gif-like, no extra asset).
 */
export function OnlineViewersBadge({
  count = 0,
  country = null,
  className = '',
  compact = false,
  showLabel = true,
}) {
  const total = typeof count === 'object' ? (count?.count ?? 0) : (count ?? 0);
  const label = total === 1 ? 'viewer online' : 'viewers online';

  return (
    <div
      className={`mm-viewers-badge${compact ? ' mm-viewers-badge--compact' : ''} ${className}`.trim()}
      title={`${total.toLocaleString()} ${label}`}
      aria-label={`${total.toLocaleString()} ${label}`}
    >
      <span className="mm-viewers-badge__eye" aria-hidden>
        <span className="mm-viewers-badge__eye-socket">
          <span className="mm-viewers-badge__eye-iris" />
        </span>
        <span className="mm-viewers-badge__eye-lid mm-viewers-badge__eye-lid--top" />
        <span className="mm-viewers-badge__eye-lid mm-viewers-badge__eye-lid--bottom" />
      </span>
      {country && !compact && (
        <span className="mm-viewers-badge__flag" title={`Your region: ${country}`}>
          {countryToFlag(country)}
        </span>
      )}
      <span className="mm-viewers-badge__count tabular-nums">{total.toLocaleString()}</span>
      {showLabel && !compact && (
        <span className="mm-viewers-badge__label">online</span>
      )}
    </div>
  );
}

export default OnlineViewersBadge;
