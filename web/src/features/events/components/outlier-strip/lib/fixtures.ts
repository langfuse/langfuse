import {
  prepareOutlierSeries,
  type OutlierStripBin,
  type OutlierStripMetricKey,
} from "./binning";

/**
 * Deterministic fake data for the outlier-strip design stories. Seeded PRNG so
 * every Storybook render (and screenshot) is identical.
 */

const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type FixtureProfile =
  /** Base load with occasional 10–40x outliers — the target hunting ground. */
  | "spiky"
  /** Quiet nights, dense bursts — tests band scanability. */
  | "bursty"
  /** Many empty buckets — tests gap semantics. */
  | "sparse"
  /** Events exist but carry no metric data (root-only cost shape). */
  | "noMetricData";

export const FIXTURE_BASE_MS = Date.UTC(2026, 6, 26, 0, 0, 0); // fixed: 2026-07-26

export function makeFixtureBins(params: {
  rangeMs: number;
  stepSeconds: number;
  profile: FixtureProfile;
  seed?: number;
}): { bins: OutlierStripBin[]; fromMs: number; toMs: number } {
  const rand = mulberry32(params.seed ?? 42);
  const stepMs = params.stepSeconds * 1000;
  const fromMs = FIXTURE_BASE_MS;
  const toMs = fromMs + params.rangeMs;

  const bins: OutlierStripBin[] = [];
  for (let t = fromMs; t < toMs; t += stepMs) {
    const hourOfDay = new Date(t).getUTCHours();
    const daytime = hourOfDay >= 7 && hourOfDay <= 22;

    let present = true;
    if (params.profile === "sparse") present = rand() < 0.3;
    if (params.profile === "bursty")
      present = daytime ? rand() < 0.9 : rand() < 0.15;
    if (!present) continue;

    const outlier =
      params.profile === "spiky" || params.profile === "bursty"
        ? rand() < 0.04
          ? 10 + rand() * 30
          : 1
        : 1;
    const base = 0.5 + rand() * 0.8;
    const count = Math.max(1, Math.round(rand() * 40 * (daytime ? 1 : 0.3)));

    bins.push({
      bucketStart: new Date(t),
      count,
      maxTotalCost:
        params.profile === "noMetricData" ? null : 0.02 * base * outlier,
      sumTotalCost:
        params.profile === "noMetricData" ? null : 0.02 * base * outlier * 5,
      maxLatencySeconds:
        params.profile === "noMetricData" ? null : 2 * base * outlier,
      p95LatencySeconds:
        params.profile === "noMetricData" ? null : 2 * base * outlier * 0.6,
      avgLatencySeconds:
        params.profile === "noMetricData" ? null : 2 * base * outlier * 0.35,
      maxTotalTokens:
        params.profile === "noMetricData"
          ? null
          : Math.round(1500 * base * outlier),
    });
  }

  return { bins, fromMs, toMs };
}

export function makeFixtureSeries(params: {
  rangeMs: number;
  stepSeconds: number;
  profile: FixtureProfile;
  metric: OutlierStripMetricKey;
  seed?: number;
}) {
  const { bins, fromMs, toMs } = makeFixtureBins(params);
  return {
    ...prepareOutlierSeries({
      bins,
      metric: params.metric,
      fromMs,
      toMs,
      stepSeconds: params.stepSeconds,
    }),
    stepMs: params.stepSeconds * 1000,
  };
}
