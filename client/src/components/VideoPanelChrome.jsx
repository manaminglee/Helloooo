/** Shared logo placeholder + watermark for all video panels */

export function VideoLogoPlaceholder({ label = 'Waiting for participant', compact = false }) {
  return (
    <div className={`mm-video-logo-placeholder ${compact ? 'mm-video-logo-placeholder--compact' : ''}`}>
      <img src="/apple-touch-icon.png" alt="Mana Mingle" className="mm-video-logo-placeholder__img" />
      {label && <span className="mm-video-logo-placeholder__text">{label}</span>}
    </div>
  );
}

export function VideoWatermark() {
  return (
    <div className="mm-video-watermark" aria-hidden="true">
      ManaMingle
    </div>
  );
}
