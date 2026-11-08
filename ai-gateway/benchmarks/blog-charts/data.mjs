import { readFileSync } from "node:fs";

// Values from the competitor session (results/cmp-*), as tabulated by
// scripts/compare.py. All runs: one gateway alone on 2 vCPU / 4 GiB,
// 517,708-byte streaming Chat Completions requests, mock upstream.

const LABELS = {
  langfuse: "Rust",
  node: "Node.js",
  python: "Python",
};

// Added time to first token versus direct, p50 in ms, concurrency sweep.
export const ttftUnderLoad = {
  concurrency: [1, 10, 50, 100],
  series: [
    { id: "langfuse", label: LABELS.langfuse, values: [4.7, 3.6, 3.1, 3.0] },
    { id: "node", label: LABELS.node, values: [12.4, 11.6, 367, 745] },
    { id: "python", label: LABELS.python, values: [47.0, 64.6, 1253, 1920] },
  ],
};

export const MEMORY_LIMIT_MIB = 4096;

// One rerun of the 1,000-request burst (5 rounds, ~210 ms streams) per runtime,
// with memory.current per second and per-second request outcomes. Built by
// extract-burst.mjs from results/blog-*.
export const burstTimeline = Object.entries(
  JSON.parse(
    readFileSync(new URL("./burst-timeline.json", import.meta.url), "utf8"),
  ).runtimes,
).map(([id, run]) => ({ id, label: LABELS[id], ...run }));

// Peak container memory.current in MiB per burst (all requests released at
// once, 5 rounds); `at` is the burst size. The Python gateway runs its main
// config (admission control on); oomKills counts kernel OOM kills of its
// worker processes. The other gateways were not run at a burst of 500.
export const memoryBursts = [
  {
    id: "langfuse",
    label: LABELS.langfuse,
    points: [
      { at: 1000, peakMiB: 1901 },
      { at: 2000, peakMiB: 3355 },
    ],
  },
  {
    id: "node",
    label: LABELS.node,
    points: [
      { at: 1000, peakMiB: 3281 },
      { at: 2000, peakMiB: 3125 },
    ],
  },
  {
    id: "python",
    label: LABELS.python,
    points: [
      { at: 500, peakMiB: 4096, oomKills: 1 },
      { at: 1000, peakMiB: 4096, oomKills: 2 },
      { at: 2000, peakMiB: 3679 },
    ],
  },
];
