/**
 * Admin-controlled ad regions. When ads are enabled and no HTML is set, shows a dashed placeholder.
 * Admin HTML is isolated from application storage, camera permissions and DOM.
 */
import { AdSenseUnit } from './AdSenseUnit';

export function AdSlot({ slotKey, script, adsEnabled, className = '', compact = false }) {
  if (!adsEnabled) return null;
  if (script?.provider === 'adsense' && /^ca-pub-\d{16}$/.test(script.client) && /^\d{10}$/.test(script.slot)) {
    return <AdSenseUnit key={`${script.client}:${script.slot}`} client={script.client} slot={script.slot} compact={compact} className={className} />;
  }
  const s = typeof script === 'string' ? script.trim() : '';
  if (s) {
    return (
      <iframe
        title={`Advertisement: ${String(slotKey || 'sponsored').replace(/_/g, ' ')}`}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        loading="lazy"
        srcDoc={`<!doctype html><html><head><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'"><style>body{margin:0;color:#fff;font:14px system-ui;text-align:center}img{max-width:100%;height:auto}a{color:inherit}</style></head><body>${s}</body></html>`}
        className={`w-full overflow-hidden rounded-2xl border border-white/10 bg-black/25 text-center ${compact ? 'my-2' : 'my-4'} ${className || ''}`}
        style={{ height: compact ? 100 : 180, border: 0 }}
      />
    );
  }
  const label = String(slotKey || 'slot').replace(/_/g, ' ');
  return (
    <div
      className={`w-full rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-3 sm:p-4 text-center ${compact ? 'my-2' : 'my-4'} ${className || ''}`}
      role="complementary"
      aria-label={`Advertisement placeholder ${label}`}
    >
      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/15 italic">
        Sponsored · {label}
      </span>
    </div>
  );
}
