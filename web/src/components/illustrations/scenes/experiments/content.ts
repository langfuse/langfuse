/** A value from 0 (the baseline) to 1 (the top guide), evenly spaced; or [x, y] with x from 0 to 1 across the chart. */
export type ExperimentsPoint = number | readonly [x: number, y: number];

type ExperimentsSeries = {
  /** The chip at the series' start, shown as written ("set A", "baseline-gpt-4o"). */
  label: string;
  points: ExperimentsPoint[];
};

export type ExperimentsContent = {
  /** One or two series; the first is the hero: dark, hatched, and the one the crosshair follows. */
  series: ExperimentsSeries[];
  /** The run id along the bottom, shown as written and cut in the middle when long. */
  run: string;
};

/** Characters per slot before an ellipsis, and how many series and points are drawn. */
export const EXPERIMENTS_LIMITS = {
  series: 2,
  label: 10,
  points: 16,
  run: 28,
} as const;

export const EXPERIMENTS_DEFAULTS: ExperimentsContent = {
  series: [
    {
      label: "set A",
      points: [
        [0, 0.615],
        [0.054, 0.599],
        [0.122, 0.445],
        [0.216, 0.595],
        [0.257, 0.567],
        [0.338, 0.234],
        [0.365, 0.269],
        [0.392, 0.432],
        [0.443, 0.576],
        [0.595, 0.753],
        [0.686, 0.581],
        [0.733, 0.605],
        [0.865, 0.391],
        [0.919, 0.495],
        [1, 0.445],
      ],
    },
    {
      label: "set B",
      points: [
        [0, 0.91],
        [0.037, 0.828],
        [0.115, 0.76],
        [0.203, 0.742],
        [0.378, 0.944],
        [0.585, 0.867],
        [0.706, 0.745],
        [0.784, 0.339],
        [0.838, 0.297],
        [0.919, 0.177],
      ],
    },
  ],
  run: "run-2026-11-17T14:34:24.799Z",
};
