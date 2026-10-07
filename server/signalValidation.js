/** Bound and normalize untrusted signaling before forwarding to another browser. */
function validSignal(type, signal) {
  if (type === 'ice-candidate' && signal === null) return true;
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return false;
  if (type === 'offer' || type === 'answer') {
    return signal.type === type && typeof signal.sdp === 'string'
      && signal.sdp.startsWith('v=0') && signal.sdp.length <= 131072;
  }
  if (type !== 'ice-candidate') return false;
  return typeof signal.candidate === 'string' && signal.candidate.length <= 8192
    && (signal.sdpMid == null || (typeof signal.sdpMid === 'string' && signal.sdpMid.length <= 256))
    && (signal.sdpMLineIndex == null || (Number.isInteger(signal.sdpMLineIndex) && signal.sdpMLineIndex >= 0 && signal.sdpMLineIndex <= 65535))
    && (signal.usernameFragment == null || (typeof signal.usernameFragment === 'string' && signal.usernameFragment.length <= 256));
}
module.exports = { validSignal };
