/**
 * Monotonic unique id helper for React list keys (avoids same-ms Date.now() collisions).
 */
let counter = 0;

export function nextMsgId(prefix = 'm') {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${Date.now()}-${counter}`;
}
