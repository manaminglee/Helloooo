/**
 * Pick which server-authoritative wallet the nav should show.
 * Never invents a balance: unknown values stay unready (UI shows a loading
 * mark, not a fabricated 0).
 */
export function selectDisplayBalance({ audioUsername, audioCoins, guestBalance }) {
  if (audioUsername) {
    const n = Number(audioCoins);
    if (!Number.isFinite(n)) return { source: 'audio', ready: false, balance: null };
    return { source: 'audio', ready: true, balance: n };
  }
  const n = Number(guestBalance);
  if (!Number.isFinite(n)) return { source: 'guest', ready: false, balance: null };
  return { source: 'guest', ready: true, balance: n };
}
