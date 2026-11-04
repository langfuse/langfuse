export type NamedCount = {
  name: string;
  value: number;
};

export type ScoreMeasurement = {
  name: string;
  average: number;
  count: number;
};

export type LatencyMeasurement = {
  name: string;
  p95Ms: number;
};

export type ProductionReviewMeasurements = {
  windowStart: Date;
  windowEnd: Date;
  volume: number | null;
  previousVolume: number | null;
  topTraces: NamedCount[] | null;
  previousTopTraces: NamedCount[] | null;
  slowest: LatencyMeasurement[] | null;
  errors: NamedCount[] | null;
  previousErrors: NamedCount[] | null;
  costUsd: number | null;
  previousCostUsd: number | null;
  scores: ScoreMeasurement[] | null;
  previousScores: ScoreMeasurement[] | null;
  topics: NamedCount[] | null;
  topicsUnavailable: boolean;
};

const ERROR_COUNT_FLOOR = 5;
const SCORE_COUNT_FLOOR = 20;
const VOLUME_COUNT_FLOOR = 20;
const SCORE_DROP = 0.1;

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatAverage(value: number): string {
  return value.toFixed(2);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "unknown";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function compared(
  current: number | null,
  previous: number | null,
  renderCurrent: (value: number) => string,
  renderPrevious: (value: number) => string = formatCount,
): string {
  if (current === null) return "No measurements found";
  if (previous === null) {
    return `${renderCurrent(current)} (previous day did not load)`;
  }
  if (current === previous) {
    return `${renderCurrent(current)}, unchanged from ${renderPrevious(previous)}`;
  }
  if (previous === 0) {
    return `${renderCurrent(current)} (none in the previous day)`;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct > 0 ? "+" : "";
  return `${renderCurrent(current)}, ${sign}${pct}% from ${renderPrevious(previous)}`;
}

function previousValue(
  rows: NamedCount[] | null,
  name: string,
): number | undefined {
  return rows?.find((row) => row.name === name)?.value;
}

function namedWas(
  rows: NamedCount[] | null,
  previous: NamedCount[] | null,
  empty: string,
): string {
  if (rows === null) return "No measurements found";
  if (rows.length === 0) return empty;
  return rows
    .slice(0, 3)
    .map((row) => {
      const before = previousValue(previous, row.name);
      const was = before === undefined ? "" : ` (was ${formatCount(before)})`;
      return `${cell(row.name)} ${formatCount(row.value)}${was}`;
    })
    .join(", ");
}

function collectIssues(measurements: ProductionReviewMeasurements): string[] {
  const issues: string[] = [];
  const { volume, previousVolume } = measurements;
  if (
    volume !== null &&
    previousVolume !== null &&
    previousVolume >= VOLUME_COUNT_FLOOR &&
    volume >= previousVolume * 2
  ) {
    issues.push(
      `Root traces went from ${formatCount(previousVolume)} to ${formatCount(volume)}.`,
    );
  }

  if (measurements.errors !== null) {
    for (const error of measurements.errors) {
      const before = previousValue(measurements.previousErrors, error.name);
      if (before === undefined) continue;
      if (error.value >= ERROR_COUNT_FLOOR && error.value >= before * 2) {
        issues.push(
          `Error observations named "${error.name}" went from ${formatCount(before)} to ${formatCount(error.value)}.`,
        );
      }
    }
  }

  if (measurements.scores !== null && measurements.previousScores !== null) {
    for (const score of measurements.scores) {
      const before = measurements.previousScores.find(
        (row) => row.name === score.name,
      );
      if (!before) continue;
      if (
        score.count >= SCORE_COUNT_FLOOR &&
        before.count >= SCORE_COUNT_FLOOR &&
        before.average - score.average >= SCORE_DROP
      ) {
        issues.push(
          `The ${score.name} score average fell from ${formatAverage(before.average)} to ${formatAverage(score.average)} (${formatCount(score.count)} scores, ${formatCount(before.count)} the day before).`,
        );
      }
    }
  }

  return issues;
}

function nextSteps(
  measurements: ProductionReviewMeasurements,
  issues: string[],
): string[] {
  const steps: string[] = [];
  const errorIssue = measurements.errors?.find((error) => {
    const before = previousValue(measurements.previousErrors, error.name);
    return (
      before !== undefined &&
      error.value >= ERROR_COUNT_FLOOR &&
      error.value >= before * 2
    );
  });
  if (errorIssue) {
    steps.push(
      `Open Tracing and look at error observations named "${errorIssue.name}".`,
    );
  } else if (issues.some((issue) => issue.startsWith("Root traces"))) {
    steps.push("Open Tracing and compare the busiest traces with yesterday.");
  }

  const scoreIssue = measurements.scores?.find((score) => {
    const before = measurements.previousScores?.find(
      (row) => row.name === score.name,
    );
    return (
      before !== undefined &&
      score.count >= SCORE_COUNT_FLOOR &&
      before.count >= SCORE_COUNT_FLOOR &&
      before.average - score.average >= SCORE_DROP
    );
  });
  if (scoreIssue) {
    steps.push(`Open Scores and read recent ${scoreIssue.name} values.`);
  }

  if (steps.length === 0) {
    steps.push("Run this review again tomorrow and compare it with this one.");
  }
  return steps;
}

function missingSections(measurements: ProductionReviewMeasurements): string[] {
  const missing: string[] = [];
  if (measurements.volume === null || measurements.previousVolume === null) {
    missing.push("volume");
  }
  if (measurements.topTraces === null) missing.push("trace names");
  if (measurements.slowest === null) missing.push("latency");
  if (measurements.errors === null || measurements.previousErrors === null) {
    missing.push("errors");
  }
  if (measurements.costUsd === null || measurements.previousCostUsd === null) {
    missing.push("cost");
  }
  if (measurements.scores === null || measurements.previousScores === null) {
    missing.push("scores");
  }
  if (measurements.topics === null && !measurements.topicsUnavailable) {
    missing.push("topics");
  }
  return missing;
}

function scoreCell(measurements: ProductionReviewMeasurements): string {
  if (measurements.scores === null) return "No measurements found";
  if (measurements.scores.length === 0) return "None";
  return measurements.scores
    .slice(0, 3)
    .map((score) => {
      const before = measurements.previousScores?.find(
        (row) => row.name === score.name,
      );
      const was = before ? ` (was ${formatAverage(before.average)})` : "";
      return `${cell(score.name)} ${formatAverage(score.average)} across ${formatCount(score.count)} scores${was}`;
    })
    .join(", ");
}

function topicCell(measurements: ProductionReviewMeasurements): string {
  if (measurements.topicsUnavailable) {
    return "Topics are not available in this project.";
  }
  return namedWas(measurements.topics, null, "None");
}

function latencyCell(measurements: ProductionReviewMeasurements): string {
  if (measurements.slowest === null) return "No measurements found";
  if (measurements.slowest.length === 0) return "None";
  return measurements.slowest
    .slice(0, 3)
    .map((row) => `${cell(row.name)} p95 ${formatDuration(row.p95Ms)}`)
    .join(", ");
}

export function buildProductionReviewMarkdown(
  measurements: ProductionReviewMeasurements,
): string {
  const issues = collectIssues(measurements);
  const lead =
    issues[0] ??
    "Nothing in the last 24 hours stands out against the day before.";
  const rows = [
    [
      "Volume",
      compared(
        measurements.volume,
        measurements.previousVolume,
        (value) => `${formatCount(value)} root traces`,
      ),
    ],
    [
      "Change",
      namedWas(measurements.topTraces, measurements.previousTopTraces, "None"),
    ],
    ["Latency", latencyCell(measurements)],
    [
      "Errors",
      namedWas(measurements.errors, measurements.previousErrors, "None"),
    ],
    [
      "Cost",
      compared(
        measurements.costUsd,
        measurements.previousCostUsd,
        formatUsd,
        formatUsd,
      ),
    ],
    ["Scores", scoreCell(measurements)],
    ["Topics", topicCell(measurements)],
    [
      "Evaluation load",
      measurements.scores === null
        ? "No measurements found"
        : `${formatCount(measurements.scores.reduce((sum, score) => sum + score.count, 0))} scores`,
    ],
  ];
  const table = [
    "| Pattern | This window |",
    "| --- | --- |",
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join("\n");
  const issueBody =
    issues.length === 0
      ? "Nothing in these measurements stands out."
      : issues.map((issue) => `- ${issue}`).join("\n");
  const steps = nextSteps(measurements, issues)
    .map((step) => `- ${step}`)
    .join("\n");
  const missing = missingSections(measurements);
  const footnote =
    missing.length === 0
      ? ""
      : `\n\nSome measurements did not load: ${missing.join(", ")}.`;

  return (
    [
      `Last 24 hours compared with the previous 24 hours (${measurements.windowStart.toISOString()} to ${measurements.windowEnd.toISOString()}).`,
      "",
      lead,
      "",
      table,
      "",
      "**Issues.**",
      "",
      issueBody,
      "",
      "**Next.**",
      "",
      steps,
    ].join("\n") + footnote
  );
}
