import { useState, useEffect, useMemo } from 'react';
import { API_BASE } from '../config/apiBase';
import { mmDebug } from '../utils/mmDebug';

// Fix #4 + minor: Single base URL computed once — shared API base
const BASE_URL = API_BASE;

// Fix #1: NEVER hardcode TURN credentials here — only safe STUN as offline fallback
const STUN_ONLY_FALLBACK = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Fix #3: Normalize a single ICE server entry's urls field
function normalizeSingle(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const s = urlStr.trim();
  if (!s) return null;
  // Must have the scheme prefix — if not, default to TURN
  if (s.startsWith('stun:') || s.startsWith('turn:') || s.startsWith('turns:')) return s;
  // Fix #4: Require at least one colon (host:port) for TURN
  if (!s.includes(':')) return null;
  return `turn:${s}`;
}

function normalizeIceServer(server) {
  if (!server || typeof server !== 'object') return null;
  const { urls, ...rest } = server;
  if (!urls) return server;

  // Fix #3: Properly handle both single-string and array urls
  if (Array.isArray(urls)) {
    const normalized = urls.map(normalizeSingle).filter(Boolean);
    return normalized.length ? { ...rest, urls: normalized } : null;
  }
  const normalized = normalizeSingle(urls);
  return normalized ? { ...rest, urls: normalized } : null;
}

export function useIceServers() {
  const [iceServers, setIceServers] = useState(STUN_ONLY_FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchWithRetry = async (retries = 2) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // Fix #2: credentials: 'include' so session/cookie auth works
          const res = await fetch(`${BASE_URL}/api/turn`, {
            credentials: 'include',
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const data = await res.json();

          // Fix: Properly validate array
          if (Array.isArray(data.iceServers) && data.iceServers.length) {
            const normalized = data.iceServers.map(normalizeIceServer).filter(Boolean);
            if (normalized.length && !cancelled) {
              // Minor: Always merge with STUN fallback so STUN is never missing
              const merged = [
                ...normalized,
                // Deduplicate — only add STUN if not already in the fetched list
                ...STUN_ONLY_FALLBACK.filter(s =>
                  !normalized.some(n => {
                    const nu = Array.isArray(n.urls) ? n.urls[0] : n.urls;
                    const su = Array.isArray(s.urls) ? s.urls[0] : s.urls;
                    return nu === su;
                  })
                ),
              ];
              mmDebug('ice.loaded', merged.length, merged.map(s => Array.isArray(s.urls) ? s.urls[0] : s.urls));
              setIceServers(merged);
              return; // success — stop retrying
            }
          }
          // API responded but with empty/invalid servers → use fallback
          mmDebug('ice.empty', 'Backend returned no valid ICE servers — using STUN fallback');
          return;
        } catch (err) {
          // Fix #5: Retry mechanism
          if (attempt < retries) {
            mmDebug('ice.retry', attempt + 1, err.message);
            await new Promise(r => setTimeout(r, 800 * (attempt + 1))); // backoff
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
  }, []);

  return { iceServers, loading };
}
