// Values from the competitor session (results/cmp-*), as tabulated by
// scripts/compare.py. All runs: one gateway alone on 2 vCPU / 4 GiB,
// 517,708-byte streaming Chat Completions requests, mock upstream.

const LABELS = {
  langfuse: "Langfuse (Rust)",
  node: "Node.js gateway",
  python: "Python gateway",
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

// Peak container memory.current in MiB with ~5 s streams (200 chunks, 25 ms
// apart) held open concurrently. `at` is the number of concurrent streams.
export const memoryLongStreams = [
  {
    id: "langfuse",
    label: LABELS.langfuse,
    points: [
      { at: 100, peakMiB: 127 },
      { at: 1000, peakMiB: 800 },
      { at: 1500, peakMiB: 1393 },
    ],
  },
  {
    id: "node",
    label: LABELS.node,
    points: [
      { at: 100, peakMiB: 618 },
      { at: 1000, peakMiB: 1351 },
      { at: 1500, peakMiB: 1328 },
    ],
  },
  {
    id: "python",
    label: LABELS.python,
    points: [
      { at: 100, peakMiB: 2842 },
      { at: 1000, peakMiB: 3456 },
      { at: 1500, peakMiB: 3472 },
    ],
  },
];

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
