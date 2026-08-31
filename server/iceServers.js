/**
 * Build the ICE server list handed to browsers: STUN → operator TURN →
 * regional relay fallback (UDP, then TCP, then TLS).
 *
 * CRITICAL INVARIANT: credentials are per-host. A TURN host only ever appears
 * with the credentials that belong to it. Pairing (say) an ExpressTURN username
 * with a Metered relay host produces a 401 on every allocation, and the browser
 * still spends ICE time on that pair — which is exactly how users end up stuck
 * on "connecting" with a black remote video.
 */

const REGION_BY_COUNTRY = {
  // India / South Asia
  IN: 'in', PK: 'in', BD: 'in', LK: 'in', NP: 'in',
  // UK / Ireland
  GB: 'uk', UK: 'uk', IE: 'uk',
  // EU / Germany-centric
  DE: 'eu', FR: 'eu', NL: 'eu', BE: 'eu', AT: 'eu', CH: 'eu', IT: 'eu', ES: 'eu',
  PL: 'eu', SE: 'eu', NO: 'eu', DK: 'eu', FI: 'eu', PT: 'eu', CZ: 'eu', RO: 'eu',
  // US / Americas
  US: 'us', CA: 'us', MX: 'us', BR: 'us', AR: 'us', CL: 'us', CO: 'us',
};

/** Metered-style regional relay hostnames used for the shared fallback tier. */
const REGION_HOSTS = {
  in: process.env.TURN_HOST_IN || 'in.relay.metered.ca',
  uk: process.env.TURN_HOST_UK || 'uk.relay.metered.ca',
  eu: process.env.TURN_HOST_EU || 'eu.relay.metered.ca',
  us: process.env.TURN_HOST_US || 'us.relay.metered.ca',
  global: process.env.TURN_HOST_GLOBAL || 'a.relay.metered.ca',
};

/** Public demo credentials that belong to the Metered relay hosts above. */
const FALLBACK_RELAY_CREDS = {
  username: process.env.TURN_FALLBACK_USERNAME || 'e8dd65b92f3c0ab9bda3c714',
  credential: process.env.TURN_FALLBACK_PASSWORD || '2xMGSyyWIYfJTh3m',
};

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function resolveRegion(country, explicit) {
  const e = String(explicit || '').toLowerCase().trim();
  if (['in', 'uk', 'eu', 'us', 'global'].includes(e)) return e;
  const cc = String(country || '').toUpperCase().trim();
  return REGION_BY_COUNTRY[cc] || 'global';
}

/** Operator-owned TURN, if TURN_URL + TURN_USERNAME + TURN_PASSWORD are all set. */
function operatorTurn() {
  const url = env('TURN_URL');
  const username = env('TURN_USERNAME');
  const credential = env('TURN_PASSWORD');
  if (!url || !username || !credential) return null;
  return { url, username, credential };
}

/**
 * Parse TURN_URL values:
 *   free.expressturn.com
 *   free.expressturn.com:3478
 *   turn:free.expressturn.com:3478
 *   turn:host:3478?transport=udp
 */
function parseTurnTarget(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (/^turns?:/i.test(s)) s = s.replace(/^turns?:/i, '');
  const qIdx = s.indexOf('?');
  const hostPort = qIdx >= 0 ? s.slice(0, qIdx) : s;
  const query = qIdx >= 0 ? s.slice(qIdx + 1) : '';
  const transport = /transport=([^&]+)/i.exec(query)?.[1]?.toLowerCase() || null;

  let hostname = hostPort;
  let port = null;
  if (hostPort.includes(':') && !hostPort.startsWith('[')) {
    const lastColon = hostPort.lastIndexOf(':');
    const maybePort = hostPort.slice(lastColon + 1);
    if (/^\d+$/.test(maybePort)) {
      port = parseInt(maybePort, 10);
      hostname = hostPort.slice(0, lastColon);
    }
  }
  if (!hostname) return null;
  return { hostname, port, transport, raw: String(raw || '').trim() };
}

/**
 * Metered-style hosts — UDP/TCP/TLS on ports 80 and 443.
 */
function pushTurnUdpTcpTls(list, host, creds) {
  list.push({
    urls: [
      `turn:${host}:80?transport=udp`,
      `turn:${host}:443?transport=udp`,
    ],
    ...creds,
  });
  list.push({
    urls: [
      `turn:${host}:80?transport=tcp`,
      `turn:${host}:443?transport=tcp`,
    ],
    ...creds,
  });
  list.push({
    urls: `turns:${host}:443?transport=tcp`,
    ...creds,
  });
}

/** Coturn / ExpressTURN-style — standard port 3478 (or custom) + TLS on 443. */
function pushTurnStandardPort(list, hostname, port, creds) {
  const p = port || 3478;
  list.push({
    urls: [
      `turn:${hostname}:${p}?transport=udp`,
      `turn:${hostname}:${p}?transport=tcp`,
    ],
    ...creds,
  });
  if (p !== 443) {
    list.push({
      urls: `turns:${hostname}:443?transport=tcp`,
      ...creds,
    });
  }
}

function pushOperatorTurn(list, operator) {
  const creds = { username: operator.username, credential: operator.credential };
  const raw = operator.url;
  const target = parseTurnTarget(raw);
  if (!target) return;

  // Fully pinned URL (includes ?transport=) — use exactly as configured.
  if (/^turns?:/i.test(raw) && target.transport) {
    list.push({ urls: raw, ...creds });
    return;
  }

  if (target.port) {
    pushTurnStandardPort(list, target.hostname, target.port, creds);
    return;
  }

  pushTurnUdpTcpTls(list, target.hostname, creds);
}

/**
 * @param {{ country?: string, region?: string }} opts
 * @returns {{ iceServers: object[], region: string, relay: string }}
 */
function buildIceServers(opts = {}) {
  const region = resolveRegion(opts.country, opts.region);
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const operator = operatorTurn();
  if (operator) {
    pushOperatorTurn(iceServers, operator);
  }

  // Shared relay fallback. Skipped when the operator has their own TURN and has
  // opted out — every extra host is ICE time spent before media can flow.
  const wantFallback = !operator || env('TURN_DISABLE_FALLBACK') !== '1';
  if (wantFallback) {
    const regionalHost = REGION_HOSTS[region] || REGION_HOSTS.global;
    pushTurnUdpTcpTls(iceServers, regionalHost, FALLBACK_RELAY_CREDS);
    if (region !== 'global') {
      pushTurnUdpTcpTls(iceServers, REGION_HOSTS.global, FALLBACK_RELAY_CREDS);
    }
  }

  return {
    iceServers,
    region,
    relay: operator ? 'operator' : 'shared',
  };
}

module.exports = {
  buildIceServers,
  resolveRegion,
  operatorTurn,
  parseTurnTarget,
  pushOperatorTurn,
  REGION_BY_COUNTRY,
  REGION_HOSTS,
};
