const NEWTON_ITERATIONS = 6;
const BISECTION_ITERATIONS = 24;
const EPSILON = 1e-6;

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as a function of linear progress, so a
 * rAF-driven animation can follow the same curve the stylesheet would.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number) => {
    let t = x;
    for (let i = 0; i < NEWTON_ITERATIONS; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < EPSILON) {
        return t;
      }
      const derivative = sampleDerivativeX(t);
      if (Math.abs(derivative) < EPSILON) {
        break;
      }
      t -= error / derivative;
    }

    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < BISECTION_ITERATIONS; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < EPSILON) {
        return t;
      }
      if (value < x) {
        low = t;
      } else {
        high = t;
      }
      t = (low + high) / 2;
    }
    return t;
  };

  return (progress: number) => {
    if (progress <= 0) {
      return 0;
    }
    if (progress >= 1) {
      return 1;
    }
    return sampleY(solveT(progress));
  };
}

/** Fast lift-off, long gentle landing. */
export const easeStageOpen = cubicBezier(0.22, 1, 0.36, 1);
/** Gathers speed, then settles exactly onto the page. */
export const easeStageClose = cubicBezier(0.5, 0, 0.1, 1);
