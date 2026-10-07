import { useEffect, useRef, useState } from 'react';

let loader;
let publisher;
function loadAdSense(client) {
  if (publisher && publisher !== client) return Promise.reject(new Error('Reload to change AdSense publisher'));
  if (loader) return loader;
  publisher = client;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
    script.onload = resolve;
    script.onerror = () => { script.remove(); loader = null; publisher = null; reject(new Error('AdSense unavailable')); };
    document.head.appendChild(script);
  });
  return loader;
}

export function AdSenseUnit({ client, slot, compact = false, className = '' }) {
  const ref = useRef(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const el = ref.current;
    let disposed = false;
    let requested = false;
    const observer = new ResizeObserver(async () => {
      if (disposed || requested || !el || el.getBoundingClientRect().width < 1) return;
      requested = true;
      try {
        await loadAdSense(client);
        if (!disposed && !el.hasAttribute('data-adsbygoogle-status')) {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        }
      } catch { if (!disposed) setUnavailable(true); }
    });
    observer.observe(el);
    return () => { disposed = true; observer.disconnect(); };
  }, [client, slot]);
  return (
    <aside aria-label="Advertisement" className={`w-full min-w-0 overflow-hidden ${compact ? 'my-2' : 'my-4'} ${className}`}>
      <div className="text-center text-[10px] text-white/40">Advertisement</div>
      {unavailable && <p className="text-center text-xs text-white/40">Advertisement unavailable</p>}
      <ins ref={ref} className="adsbygoogle" style={{ display: 'block', minHeight: compact ? 90 : 180 }} data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
