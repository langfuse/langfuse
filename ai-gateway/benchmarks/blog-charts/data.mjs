// Values from the competitor session (results/cmp-*), as tabulated by
// scripts/compare.py. All runs: one gateway alone on 2 vCPU / 4 GiB,
// 517,708-byte streaming Chat Completions requests, mock upstream.

// Added time to first token versus direct, p50 in ms, concurrency sweep.
export const ttftUnderLoad = {
  concurrency: [1, 10, 50, 100],
  series: [
    { id: "langfuse", label: "Langfuse", values: [4.7, 3.6, 3.1, 3.0] },
    { id: "node", label: "Node.js gateway", values: [12.4, 11.6, 367, 745] },
    {
      id: "python",
      label: "Python gateway",
      values: [47.0, 64.6, 1253, 1920],
    },
  ],
};

// Peak container memory.current in MiB per burst (all requests released at
// once, 5 rounds). The Python gateway runs its main config (admission control
// on); oomKills counts kernel OOM kills of its worker processes in that case.
// The Langfuse and Node.js gateways were not run at a burst of 500.
export const memoryUnderLoad = {
  limitMiB: 4096,
  series: [
    {
      id: "langfuse",
      label: "Langfuse",
      points: [
        { burst: 1000, peakMiB: 1901, oomKills: 0 },
        { burst: 2000, peakMiB: 3355, oomKills: 0 },
      ],
    },
    {
      id: "node",
      label: "Node.js gateway",
      points: [
        { burst: 1000, peakMiB: 3281, oomKills: 0 },
        { burst: 2000, peakMiB: 3125, oomKills: 0 },
      ],
    },
    {
      id: "python",
      label: "Python gateway",
      points: [
        { burst: 500, peakMiB: 4096, oomKills: 1 },
        { burst: 1000, peakMiB: 4096, oomKills: 2 },
        { burst: 2000, peakMiB: 3679, oomKills: 0 },
      ],
    },
  ],
};
