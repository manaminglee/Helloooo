import { useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';

/** Mirrors server defaults so a failed fetch never invents a paywall. */
export const VIDEO_PRICING_FALLBACK = {
  ok: true,
  enabled: false,
  currency: 'coins',
  video: {
    freeSessionSeconds: 300,
    extendSessionSeconds: 600,
    extendSessionCoins: 15,
    unlimitedSessionCoins: 50,
    genderFilterCoins: 10,
    countryFilterCoins: 8,
    regionFilterCoins: 12,
    reconnectCoins: 20,
  },
  groupVideo: {
    freeMaxSize: 4,
    creatorFreeMaxSize: 8,
    largeMaxSize: 8,
    largeRoomCoins: 25,
    extraLargeMaxSize: 12,
    extraLargeRoomCoins: 50,
    privateRoomCoins: 30,
    brandedRoomCoins: 0,
    allowedEntryFees: [0, 5, 10, 25, 50],
  },
};

export function useVideoPricing() {
  const [pricing, setPricing] = useState(VIDEO_PRICING_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/pricing/video`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok && data.video && data.groupVideo) {
          setPricing({ ...VIDEO_PRICING_FALLBACK, ...data, enabled: !!data.enabled });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return pricing;
}

export function priceLabel(pricing, coins) {
  if (!pricing?.enabled) return 'Free';
  const n = Number(coins) || 0;
  return n > 0 ? `${n} coins` : 'Free';
}
