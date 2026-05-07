/**
 * Admin-controlled ad regions. When ads are enabled and no HTML is set, shows a dashed placeholder.
 * Paste safe snippet/HTML in Admin → Ads Manager (trusted admin only).
 */
export function AdSlot({ slotKey, script, adsEnabled, className = '', compact = false }) {
  if (!adsEnabled) return null;
  const s = typeof script === 'string' ? script.trim() : '';
  if (s) {
    return (
      <div
        className={`w-full overflow-hidden rounded-2xl border border-white/10 bg-black/25 text-center ${compact ? 'my-2' : 'my-4'} ${className || ''}`}
        dangerouslySetInnerHTML={{ __html: s }}
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
