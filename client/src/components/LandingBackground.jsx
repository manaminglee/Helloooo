import { memo } from 'react';

/**
 * Near-black field with film grain. The colored mesh orb lives in the hero
 * so it can sit behind the headline rather than wash the whole page.
 */
export const LandingBackground = memo(function LandingBackground() {
  return (
    <div className="lv4-bg" aria-hidden>
      <div className="lv4-bg__base" />
      <div className="lv4-bg__grain" />
    </div>
  );
});

export default LandingBackground;
