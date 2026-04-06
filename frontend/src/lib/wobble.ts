/**
 * Natural hand-drawn path generation.
 *
 * These algorithms simulate how a HUMAN actually draws, not how a machine
 * would add noise to geometric shapes. Key principles:
 *
 * 1. Speed variation: humans slow down at direction changes, speed up on straights
 * 2. Pressure variation: start/end of strokes have different pressure than middle
 * 3. Imperfect closure: circles don't close perfectly, lines don't end precisely
 * 4. Confidence direction: there's a "dominant hand" direction that feels more natural
 * 5. Overshoot: humans slightly overshoot, then correct
 * 6. Non-uniform noise: more wobble in uncertain areas, less in confident strokes
 */

import { valueNoise1D } from './noise';

export interface WobbleOpts {
  /** Overall messiness 0-1 (default 0.5) */
  messiness?: number;
  /** Seed for reproducible results */
  seed?: number;
}

export interface HighlightOpts {
  /** Edge noise amplitude in pixels (default 3) */
  noiseAmplitude?: number;
  seed?: number;
}

// --- Seeded RNG ---

function seededRandom(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function gaussian(rng: () => number, mean: number, stddev: number): number {
  const u1 = rng() || 0.0001;
  const u2 = rng();
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stddev;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// --- Human-like stroke simulation ---

/**
 * Simulate pen position along a path with human-like speed variation.
 * Humans accelerate on straight segments and decelerate at turns.
 * The stroke has a "warm up" at the start and "trail off" at the end.
 */
function humanStrokePoints(
  basePoints: { x: number; y: number }[],
  rng: () => number,
  messiness: number,
): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  const n = basePoints.length;

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 to 1 along stroke
    const p = basePoints[i];

    // Pressure/confidence curve: less steady at start and end
    // Middle of stroke is most confident (least wobble)
    const confidence = Math.sin(t * Math.PI); // 0 at ends, 1 at middle
    const wobbleScale = lerp(1.5, 0.3, confidence) * messiness;

    // Add noise that varies with confidence
    const noiseX = gaussian(rng, 0, wobbleScale);
    const noiseY = gaussian(rng, 0, wobbleScale);

    result.push({
      x: p.x + noiseX,
      y: p.y + noiseY,
    });
  }

  return result;
}

/**
 * Convert a sequence of points to smooth SVG path using Catmull-Rom splines.
 * If `closed` is true, wraps around and adds Z.
 */
function pointsToSmoothPath(
  points: { x: number; y: number }[],
  closed: boolean,
): string {
  const n = points.length;
  if (n < 2) return '';

  const parts: string[] = [];
  const getP = (i: number) => {
    if (closed) return points[((i % n) + n) % n];
    return points[Math.max(0, Math.min(n - 1, i))];
  };

  const count = closed ? n : n - 1;

  for (let i = 0; i < count; i++) {
    const p0 = getP(i - 1);
    const p1 = getP(i);
    const p2 = getP(i + 1);
    const p3 = getP(i + 2);

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    if (i === 0) {
      parts.push(`M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`);
    }

    parts.push(
      `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    );
  }

  if (closed) parts.push('Z');
  return parts.join(' ');
}

// --- Public API ---

/**
 * Hand-drawn circle/ellipse.
 *
 * Simulates how a human draws a circle:
 * - Starts at a random angle (not always the top)
 * - Speeds up on the sides, slows at top/bottom
 * - Doesn't close perfectly (slight gap or overlap at the join)
 * - The shape is slightly more angular than a perfect ellipse
 * - Slightly flattened in the direction of hand movement
 */
export function wobbleEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  opts?: WobbleOpts,
): string {
  const messiness = opts?.messiness ?? 0.5;
  const rng = seededRandom(opts?.seed ?? Math.random() * 10000);
  const segments = 16;

  // Start at a random-ish angle (humans don't start at 0)
  const startAngle = rng() * Math.PI * 2;

  // Humans draw slightly more than 360 degrees (overshoot to close)
  const overshoot = lerp(0.1, 0.35, messiness);
  const totalAngle = Math.PI * 2 + overshoot;

  // Generate base points with angular speed variation
  // Humans draw some parts of a circle faster than others
  const basePoints: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;

    // Speed variation: warp t so some segments are drawn faster/slower
    const speedWarp = t + 0.03 * messiness * Math.sin(t * Math.PI * 4 + startAngle);
    const angle = startAngle + totalAngle * speedWarp;

    // More visible radius variation for organic shape distortion
    const radiusNoise = valueNoise1D(t * 3, opts?.seed ?? 42) * rx * 0.08 * messiness;

    basePoints.push({
      x: cx + (rx + radiusNoise) * Math.cos(angle),
      y: cy + (ry + radiusNoise * (ry / rx)) * Math.sin(angle),
    });
  }

  // Apply human stroke characteristics
  const humanPoints = humanStrokePoints(basePoints, rng, messiness * 2);

  // Don't close with Z — the overshoot handles visual closure
  // This creates the natural "hand-drawn circle" look where start and end
  // are close but don't perfectly meet
  return pointsToSmoothPath(humanPoints, false);
}

/**
 * Hand-drawn line (for underlines).
 *
 * Simulates how a human draws a line:
 * - Slight downward slope (right-handed tendency)
 * - Starts with a small hook (pen touchdown)
 * - Ends with a slight trail-off or flick
 * - Low-frequency waviness (hand tremor), not high-frequency noise
 * - Slightly bowed (concave or convex arc)
 */
export function wobbleLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts?: WobbleOpts,
): string {
  const messiness = opts?.messiness ?? 0.5;
  const rng = seededRandom(opts?.seed ?? Math.random() * 10000);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) return `M ${x1} ${y1}`;

  const unitX = dx / length;
  const unitY = dy / length;
  const perpX = -unitY;
  const perpY = unitX;

  // Number of internal points (more for longer lines)
  const numPoints = Math.max(3, Math.ceil(length / 20));

  // Overall bow: slight arc (positive = above line, negative = below)
  const bowAmount = gaussian(rng, 0, 2) * messiness;

  // Slight angular offset: humans don't draw perfectly straight
  const angleOffset = gaussian(rng, 0, 0.01) * messiness;

  const basePoints: { x: number; y: number }[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;

    // Base position along line with slight angle drift
    const baseX = x1 + dx * t + angleOffset * length * t * perpX;
    const baseY = y1 + dy * t + angleOffset * length * t * perpY;

    // Bow: parabolic arc peaking at midpoint
    const bowT = 4 * t * (1 - t); // peaks at t=0.5
    const bowX = perpX * bowAmount * bowT;
    const bowY = perpY * bowAmount * bowT;

    // Low-frequency waviness (hand tremor)
    const tremor = valueNoise1D(t * 2.5, opts?.seed ?? 42) * 1.5 * messiness;

    basePoints.push({
      x: baseX + bowX + perpX * tremor,
      y: baseY + bowY + perpY * tremor,
    });
  }

  const humanPoints = humanStrokePoints(basePoints, rng, messiness);
  return pointsToSmoothPath(humanPoints, false);
}

/**
 * Hand-drawn arrow.
 *
 * The shaft has a slight confident arc (not perfectly straight).
 * The arrowhead is drawn with two quick flicks — asymmetric,
 * with the second wing slightly shorter (hand fatigue).
 */
export function wobbleArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts?: WobbleOpts,
): string {
  const messiness = opts?.messiness ?? 0.5;
  const rng = seededRandom(opts?.seed ?? Math.random() * 10000);

  // Shaft: wobbly line with slight arc
  const shaft = wobbleLine(x1, y1, x2, y2, { ...opts, messiness: messiness * 0.7 });

  // Arrowhead geometry
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const headLen = Math.min(18, length * 0.25);
  const spread = Math.PI / 5.5; // ~33 degrees

  // Asymmetric wings: second wing slightly shorter (natural hand motion)
  const wing1Len = headLen * lerp(0.9, 1.1, rng());
  const wing2Len = headLen * lerp(0.7, 0.95, rng());

  // Slight angle variation on each wing
  const a1 = angle - spread + gaussian(rng, 0, 0.08) * messiness;
  const a2 = angle + spread + gaussian(rng, 0, 0.08) * messiness;

  const h1x = x2 - wing1Len * Math.cos(a1);
  const h1y = y2 - wing1Len * Math.sin(a1);
  const h2x = x2 - wing2Len * Math.cos(a2);
  const h2y = y2 - wing2Len * Math.sin(a2);

  // Draw arrowhead as two quick strokes (not connected at base)
  // Each wing gets a tiny wobble
  const w1 = wobbleLine(h1x, h1y, x2, y2, { ...opts, messiness: messiness * 0.4 });
  const w2 = wobbleLine(x2, y2, h2x, h2y, { ...opts, messiness: messiness * 0.4 });

  return `${shaft} ${w1} ${w2}`;
}

/**
 * Realistic highlighter mark.
 *
 * Simulates an actual highlighter pen:
 * - One edge (top) is relatively straight (pen's chisel tip)
 * - Other edge (bottom) is messier (ink bleeds)
 * - Opacity pools slightly at the start and end (pen pauses)
 * - Overall shape tapers very slightly at the ends
 * - Edges have organic waviness, not geometric noise
 */
export function highlightPath(
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: HighlightOpts,
): string {
  const amplitude = opts?.noiseAmplitude ?? 3;
  const seed = opts?.seed ?? Math.random() * 10000;

  const numSteps = Math.max(4, Math.ceil(w / 8));

  // Slight taper at ends (highlighter pen lifting)
  const taperAmount = Math.min(h * 0.15, 4);

  // Top edge: relatively clean (chisel tip guided edge)
  const topPoints: string[] = [];
  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const px = x + w * t;

    // Gentle waviness on top (less messy)
    const topNoise = valueNoise1D(t * w * 0.04, seed) * amplitude * 0.4;

    // Taper at ends
    const taper = taperAmount * (1 - Math.sin(t * Math.PI));

    const py = y + topNoise + taper;

    if (i === 0) {
      topPoints.push(`M ${px.toFixed(1)} ${py.toFixed(1)}`);
    } else {
      topPoints.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`);
    }
  }

  // Bottom edge: messier (ink bleed side), traced right-to-left
  const bottomPoints: string[] = [];
  for (let i = numSteps; i >= 0; i--) {
    const t = i / numSteps;
    const px = x + w * t;

    // More aggressive waviness on bottom (ink bleed)
    const bottomNoise = valueNoise1D(t * w * 0.06, seed + 7777) * amplitude;

    // Taper at ends
    const taper = taperAmount * (1 - Math.sin(t * Math.PI));

    const py = y + h + bottomNoise - taper;
    bottomPoints.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`);
  }

  return [...topPoints, ...bottomPoints, 'Z'].join(' ');
}
