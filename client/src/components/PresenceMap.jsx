export function PresenceMap({ onlineCount = 0 }) {
  const total = onlineCount || 0;
  const americas = Math.max(0, Math.floor(total * 0.32));
  const eurasia = Math.max(0, Math.floor(total * 0.58));
  const oceania = Math.max(0, total - americas - eurasia);

  return (
    <section className="w-full max-w-3xl mx-auto mb-12 px-4">
      <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-8 text-center">
        <h4 className="text-sm font-semibold text-white mb-1">Online users</h4>
        <p className="text-xs text-white/50 mb-6">Approximate regional activity</p>
        <div className="flex flex-wrap justify-center gap-8">
          {[
            { label: 'Americas', val: americas },
            { label: 'Europe & Asia', val: eurasia },
            { label: 'Oceania', val: oceania },
          ].map((r) => (
            <div key={r.label} className="text-center">
              <div className="text-xs text-white/50 mb-1">{r.label}</div>
              <div className="text-xl font-semibold text-white tabular-nums">{r.val.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
