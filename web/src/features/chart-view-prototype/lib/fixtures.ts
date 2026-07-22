import {
  type ObservationKind,
  type ObservationLevel,
  type PrototypeEvent,
} from "../types";

/**
 * Deterministic mock event generator for the chart prototype. Seeded so stories
 * and the aggregator tests are stable across runs (no `Math.random`, no
 * wall-clock) — the window is anchored to a fixed instant. The shapes loosely
 * imitate a real trace stream: a handful of models/operations, mostly
 * `DEFAULT`-level generations with a thin tail of warnings/errors, costs that
 * track token counts, and latency that varies by model.
 */

// mulberry32 — tiny, fast, deterministic PRNG.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ModelSpec {
  name: string;
  weight: number;
  baseLatency: number;
  latencySpread: number;
  costPerToken: number;
}

const MODELS: ModelSpec[] = [
  {
    name: "gpt-4o",
    weight: 5,
    baseLatency: 900,
    latencySpread: 1400,
    costPerToken: 7.5e-6,
  },
  {
    name: "gpt-4o-mini",
    weight: 8,
    baseLatency: 450,
    latencySpread: 700,
    costPerToken: 9e-7,
  },
  {
    name: "claude-opus-4",
    weight: 3,
    baseLatency: 1500,
    latencySpread: 2200,
    costPerToken: 1.5e-5,
  },
  {
    name: "claude-haiku-4",
    weight: 6,
    baseLatency: 350,
    latencySpread: 500,
    costPerToken: 5e-7,
  },
  {
    name: "gemini-2.5-pro",
    weight: 4,
    baseLatency: 1100,
    latencySpread: 1600,
    costPerToken: 5e-6,
  },
];

const OPERATIONS = [
  "generate-answer",
  "summarize",
  "classify-intent",
  "embed-docs",
  "rerank-results",
];

const ENVIRONMENTS: Array<{ name: string; weight: number }> = [
  { name: "production", weight: 7 },
  { name: "staging", weight: 2 },
  { name: "development", weight: 1 },
];

/** Window anchor — fixed so generation is fully deterministic. */
const WINDOW_END = Date.parse("2026-06-25T18:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function weightedPick<T extends { weight: number }>(
  rng: () => number,
  items: T[],
): T {
  const total = items.reduce((acc, i) => acc + i.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export interface GenerateOptions {
  seed?: number;
  count?: number;
  windowHours?: number;
  /** Fraction of events forced to ERROR, clustered in a recent sub-window. */
  errorSpike?: boolean;
}

export function generateEvents(
  options: GenerateOptions = {},
): PrototypeEvent[] {
  const {
    seed = 42,
    count = 640,
    windowHours = 24,
    errorSpike = false,
  } = options;
  const rng = makeRng(seed);
  const windowStart = WINDOW_END - windowHours * HOUR;
  const spikeStart = WINDOW_END - 4 * HOUR;

  const events: PrototypeEvent[] = [];
  for (let i = 0; i < count; i++) {
    const ts = windowStart + rng() * (WINDOW_END - windowStart);
    const model = weightedPick(rng, MODELS);
    const type: ObservationKind =
      rng() < 0.8 ? "GENERATION" : rng() < 0.6 ? "SPAN" : "EVENT";

    // Mostly clean, thin tail of warnings/errors; error spike concentrates
    // errors in the last few hours so "errors over time" reads as a real bump.
    let level: ObservationLevel = "DEFAULT";
    const levelRoll = rng();
    if (errorSpike && ts >= spikeStart && rng() < 0.45) {
      level = "ERROR";
    } else if (levelRoll > 0.97) {
      level = "ERROR";
    } else if (levelRoll > 0.9) {
      level = "WARNING";
    } else if (levelRoll < 0.04) {
      level = "DEBUG";
    }

    const isGeneration = type === "GENERATION";
    const totalTokens = isGeneration
      ? Math.round(120 + rng() * 3200)
      : Math.round(rng() * 40);
    const latencyMs = Math.round(
      model.baseLatency +
        rng() * model.latencySpread * (isGeneration ? 1 : 0.2),
    );
    const totalCost = isGeneration
      ? Number((totalTokens * model.costPerToken).toFixed(6))
      : 0;

    events.push({
      id: `evt_${seed}_${i}`,
      startTime: new Date(ts).toISOString(),
      type,
      name: pick(rng, OPERATIONS),
      model: isGeneration ? model.name : null,
      level,
      environment: weightedPick(rng, ENVIRONMENTS).name,
      latencyMs,
      totalCost,
      totalTokens,
    });
  }

  return events.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Named datasets the stories switch between. */
export const SCENARIOS = {
  default: generateEvents(),
  errorSpike: generateEvents({ seed: 7, errorSpike: true }),
  sparse: generateEvents({ seed: 3, count: 28, windowHours: 6 }),
  empty: [] as PrototypeEvent[],
} satisfies Record<string, PrototypeEvent[]>;

export type ScenarioKey = keyof typeof SCENARIOS;
