import { useState, useEffect } from 'react';
import { API_BASE } from '../config/apiBase';
import { mmDebug } from '../utils/mmDebug';

const BASE_URL = API_BASE;

const STUN_ONLY_FALLBACK = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function normalizeSingle(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const s = urlStr.trim();
  if (!s) return null;
  if (s.startsWith('stun:') || s.startsWith('turn:') || s.startsWith('turns:')) return s;
  if (!s.includes(':')) return null;
  return `turn:${s}`;
}

function normalizeIceServer(server) {
  if (!server || typeof server !== 'object') return null;
  const { urls, ...rest } = server;
  if (!urls) return server;
  if (Array.isArray(urls)) {
    const normalized = urls.map(normalizeSingle).filter(Boolean);
    return normalized.length ? { ...rest, urls: normalized } : null;
  }
  const normalized = normalizeSingle(urls);
  return normalized ? { ...rest, urls: normalized } : null;
}

/**
 * Prefer UDP TURN URLs before TCP/TLS when the API returns mixed lists.
 * (Server already orders this way; this is a client-side safety net.)
 */
function preferUdpFirst(servers) {
  const score = (s) => {
    const u = Array.isArray(s.urls) ? s.urls.join(' ') : String(s.urls || '');
    if (u.startsWith('stun:')) return 0;
    if (u.includes('transport=udp') || (u.startsWith('turn:') && !u.includes('transport=tcp') && !u.startsWith('turns:'))) return 1;
    if (u.includes('transport=tcp') && !u.startsWith('turns:')) return 2;
    if (u.startsWith('turns:')) return 3;
    return 4;
  };
  return [...servers].sort((a, b) => score(a) - score(b));
}

export function useIceServers(country = '') {
  const [iceServers, setIceServers] = useState(STUN_ONLY_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState('global');

  useEffect(() => {
    let cancelled = false;

    const fetchWithRetry = async (retries = 2) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const qs = country ? `?country=${encodeURIComponent(country)}` : '';
          const res = await fetch(`${BASE_URL}/api/turn${qs}`, {
            credentials: 'include',
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (Array.isArray(data.iceServers) && data.iceServers.length) {
            const normalized = data.iceServers.map(normalizeIceServer).filter(Boolean);
            if (normalized.length && !cancelled) {
              const merged = preferUdpFirst([
                ...normalized,
                ...STUN_ONLY_FALLBACK.filter((s) =>
                  !normalized.some((n) => {
                    const nu = Array.isArray(n.urls) ? n.urls[0] : n.urls;
                    const su = Array.isArray(s.urls) ? s.urls[0] : s.urls;
                    return nu === su;
                  })
                ),
              ]);
              mmDebug('ice.loaded', merged.length, data.region, merged.map((s) => (Array.isArray(s.urls) ? s.urls[0] : s.urls)));
              setIceServers(merged);
              if (data.region) setRegion(data.region);
              return;
            }
          }
          mmDebug('ice.empty', 'Backend returned no valid ICE servers — using STUN fallback');
          return;
        } catch (err) {
          if (attempt < retries) {
            mmDebug('ice.retry', attempt + 1, err.message);
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          } else {
            mmDebug('ice.failed', 'All retries failed — using STUN-only fallback:', err.message);
          }
        }
      }
    };

    fetchWithRetry().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [country]);

  return { iceServers, loading, region };
}
