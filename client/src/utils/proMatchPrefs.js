const PREFS_KEY = 'mm_pro_match_prefs';

const EMPTY = {
  matchCountryOnly: false,
  matchRegionOnly: false,
  matchGender: '',
  gender: '',
};

export function loadProMatchPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...EMPTY };
    const data = JSON.parse(raw);
    return {
      matchCountryOnly: !!data.matchCountryOnly,
      matchRegionOnly: !!data.matchRegionOnly,
      matchGender: typeof data.matchGender === 'string' ? data.matchGender : '',
      gender: typeof data.gender === 'string' ? data.gender : '',
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveProMatchPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      matchCountryOnly: !!prefs.matchCountryOnly,
      matchRegionOnly: !!prefs.matchRegionOnly,
      matchGender: prefs.matchGender || '',
      gender: prefs.gender || '',
    }));
  } catch { /* ignore */ }
}
