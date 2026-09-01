const PREFS_KEY = 'mm_pro_match_prefs';

export function loadProMatchPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { matchCountryOnly: false, matchRegionOnly: false };
    const data = JSON.parse(raw);
    return {
      matchCountryOnly: !!data.matchCountryOnly,
      matchRegionOnly: !!data.matchRegionOnly,
    };
  } catch {
    return { matchCountryOnly: false, matchRegionOnly: false };
  }
}

export function saveProMatchPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      matchCountryOnly: !!prefs.matchCountryOnly,
      matchRegionOnly: !!prefs.matchRegionOnly,
    }));
  } catch { /* ignore */ }
}
