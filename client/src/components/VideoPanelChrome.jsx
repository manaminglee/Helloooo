/** Shared logo placeholder + watermark for all video panels */
import { HellooooBrand, HellooooLogo } from './HellooooBrand';

export function VideoLogoPlaceholder({ label = 'Waiting for participant', compact = false }) {
  return (
    <div className={`mm-video-logo-placeholder ${compact ? 'mm-video-logo-placeholder--compact' : ''}`}>
      <HellooooLogo size={compact ? 36 : 52} className="mm-video-logo-placeholder__img" />
      {label && <span className="mm-video-logo-placeholder__text">{label}</span>}
    </div>
  );
}

export function VideoWatermark() {
  return (
    <div className="mm-video-watermark" aria-hidden="true">
      <HellooooBrand size="sm" />
    </div>
  );
}
