import { randomInt } from 'node:crypto';

/**
 * Uniform random delay in [minMs, maxMs] inclusive.
 * @param {number} minMs
 * @param {number} maxMs
 */
export function randomDelayMs(minMs, maxMs) {
  const lo = Math.ceil(Math.min(minMs, maxMs));
  const hi = Math.floor(Math.max(minMs, maxMs));
  if (hi < lo) {
    return lo;
  }

  return randomInt(lo, hi + 1);
}
