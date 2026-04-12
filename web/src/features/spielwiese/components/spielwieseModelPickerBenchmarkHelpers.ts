export type SpielwieseBenchmarkMetricTone =
  | "danger"
  | "good"
  | "muted"
  | "warning";

export type SpielwieseBenchmarkRowValue = {
  kind: "metric";
  text: string;
  tone: SpielwieseBenchmarkMetricTone;
};

export type SpielwieseBenchmarkTableRow = {
  info?: {
    description: string;
    href?: string;
    label: string;
  };
  label: string;
  value: SpielwieseBenchmarkRowValue;
};

export function getBenchmarkTone({
  direction,
  value,
}: {
  direction: "higher" | "lower" | "rank";
  value: number | null;
}): SpielwieseBenchmarkMetricTone {
  if (value === null) {
    return "muted";
  }

  if (direction === "rank") {
    if (value <= 8) {
      return "good";
    }

    if (value <= 16) {
      return "warning";
    }

    return "danger";
  }

  if (direction === "lower") {
    if (value <= 55) {
      return "good";
    }

    if (value <= 75) {
      return "warning";
    }

    return "danger";
  }

  if (value >= 82) {
    return "good";
  }

  if (value >= 65) {
    return "warning";
  }

  return "danger";
}

function formatLeaderboardValue(rank: number | null) {
  if (rank === null) {
    return {
      text: "n/a",
      tone: "muted" as const,
    };
  }

  return {
    text: `#${rank}`,
    tone: getBenchmarkTone({ direction: "rank", value: rank }),
  };
}

export function createMetricRow({
  direction,
  info,
  label,
  text,
  value,
}: {
  direction: "higher" | "lower";
  info?: SpielwieseBenchmarkTableRow["info"];
  label: string;
  text: string;
  value: number;
}): SpielwieseBenchmarkTableRow {
  return {
    info,
    label,
    value: {
      kind: "metric",
      text,
      tone: getBenchmarkTone({ direction, value }),
    },
  };
}

export function createRankRow({
  info,
  label,
  rank,
}: {
  info?: SpielwieseBenchmarkTableRow["info"];
  label: string;
  rank: number | null;
}): SpielwieseBenchmarkTableRow {
  const value = formatLeaderboardValue(rank);

  return {
    info,
    label,
    value: {
      kind: "metric",
      text: value.text,
      tone: value.tone,
    },
  };
}
