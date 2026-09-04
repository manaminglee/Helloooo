/**
 * Client IP derivation.
 *
 * X-Forwarded-For is attacker-controlled. A client may send its own value and
 * the proxy appends the real peer, so the LEFTMOST entry is whatever the client
 * claimed and the trustworthy one sits TRUST_PROXY_HOPS from the right. Reading
 * the leftmost entry lets anyone forge their IP and evade IP bans, rate limits
 * and IP-keyed sessions.
 *
 * Express already resolves this correctly from its `trust proxy` setting, so
 * HTTP paths defer to req.ip. Socket.IO handshakes have no equivalent and are
 * computed here from the same hop count.
 */

const TRUST_PROXY_HOPS = Math.max(1, Number(process.env.TRUST_PROXY_HOPS || 1) || 1);

function normalizeIp(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return '';
  const bare = raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw;
  return bare === '::1' ? '127.0.0.1' : bare;
}

/** Real client IP for an Express request. */
function httpClientIp(req) {
  return normalizeIp(req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || '');
}

/** Real client IP for a Socket.IO handshake. */
function socketClientIp(socket) {
  const chain = String(socket?.handshake?.headers?.['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (chain.length) {
    // Count in from the right so appended-by-proxy entries win over claimed ones.
    return normalizeIp(chain[Math.max(0, chain.length - TRUST_PROXY_HOPS)]);
  }
  return normalizeIp(socket?.handshake?.address || '');
}

module.exports = { TRUST_PROXY_HOPS, normalizeIp, httpClientIp, socketClientIp };
