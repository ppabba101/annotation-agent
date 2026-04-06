/**
 * Simple 1D value noise for highlight edges.
 */

function hash(n: number, seed: number): number {
  // Simple integer hash
  let x = ((n + seed) * 374761393) | 0;
  x = ((x >> 13) ^ x) | 0;
  x = (x * 1103515245 + 12345) | 0;
  return ((x >> 16) & 0x7fff) / 0x7fff; // [0, 1]
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Returns a value in [-1, 1] for a given position and seed.
 * Uses linear interpolation between hashed lattice points.
 */
export function valueNoise1D(x: number, seed: number): number {
  const xi = Math.floor(x);
  const frac = x - xi;
  const t = smoothstep(frac);

  const a = hash(xi, seed) * 2 - 1;
  const b = hash(xi + 1, seed) * 2 - 1;

  return a + t * (b - a);
}
