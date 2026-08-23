/**
 * Build ICE server list: STUN → regional UDP TURN → global UDP → TCP → TLS.
 * Region from country code (geo) or explicit ?region= query.
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

const REGION_HOSTS = {
  // Prefer env overrides; Metered-style regional hostnames as defaults
  in: process.env.TURN_HOST_IN || 'in.relay.metered.ca',
  uk: process.env.TURN_HOST_UK || 'uk.relay.metered.ca',
  eu: process.env.TURN_HOST_EU || 'eu.relay.metered.ca', // Frankfurt / EU
  us: process.env.TURN_HOST_US || 'us.relay.metered.ca', // Virginia-ish US
  global: process.env.TURN_HOST_GLOBAL || 'a.relay.metered.ca',
};

function resolveRegion(country, explicit) {
  const e = String(explicit || '').toLowerCase().trim();
  if (['in', 'uk', 'eu', 'us', 'global'].includes(e)) return e;
  const cc = String(country || '').toUpperCase().trim();
  return REGION_BY_COUNTRY[cc] || 'global';
}

function turnCreds() {
  if (process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    return {
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    };
  }
  // Public Metered demo credentials (same as previous fallback)
  return {
    username: 'e8dd65b92f3c0ab9bda3c714',
    credential: '2xMGSyyWIYfJTh3m',
  };
}

function pushTurnUdpTcpTls(list, host, creds) {
  // UDP first (best real-time), then TCP, then TLS
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

/**
 * @param {{ country?: string, region?: string }} opts
 * @returns {{ iceServers: object[], region: string }}
 */
function buildIceServers(opts = {}) {
  const region = resolveRegion(opts.country, opts.region);
  const creds = turnCreds();
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Custom single TURN_URL (operator-owned) — still append UDP/TCP variants when possible
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    const raw = process.env.TURN_URL.trim();
    const customCreds = {
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    };
    if (/^turns?:/i.test(raw)) {
      iceServers.push({ urls: raw, ...customCreds });
    } else {
      pushTurnUdpTcpTls(iceServers, raw.replace(/^turns?:/i, '').split('?')[0], customCreds);
    }
  }

  const regionalHost = REGION_HOSTS[region] || REGION_HOSTS.global;
  pushTurnUdpTcpTls(iceServers, regionalHost, creds);

  // Global backup if regional ≠ global
  if (region !== 'global') {
    pushTurnUdpTcpTls(iceServers, REGION_HOSTS.global, creds);
  }

  return { iceServers, region };
}

module.exports = {
  buildIceServers,
  resolveRegion,
  REGION_BY_COUNTRY,
};
