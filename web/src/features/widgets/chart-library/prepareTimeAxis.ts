/**
 * PREPARER LAYER — time axis.
 *
 * One source of truth for the time x-axis: from the raw bucket values it decides
 * the *scale-appropriate* label format AND the tick placement, and hands the
 * visualiser ready-to-use formatters + a tick interval. The visualiser renders
 * them and decides nothing. Data → preparer → visualiser, one way. (LFE-10549)
 *
 * Scale rule (one unit per scale — never "date, time" on every tick):
 * - intraday span  → show TIME only            ("2 PM", "2:30 PM")
 * - multi-day span → show DATES, day-aligned    ("Jun 28", "Jul 2", …) at an
 *                    even number-of-days step so the gaps are identical
 * - very long span → show MONTHS                ("Jun 2026")
 * The exact date+time always lives in the tooltip, so nothing is lost.
 */

import { getEvenTickInterval } from "@/src/features/widgets/chart-library/utils";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/**
 * At/below this span we're "zoomed into a day" → time-only ticks. Capped at a
 * single day so a wider span never shows hour-only labels that silently repeat
 * across a midnight boundary (e.g. "12 AM" at both ends of a 36h range).
 */
const TIME_SCALE_MAX = DAY;
/** Above this total span we switch from day labels to month labels. */
const MONTH_SCALE_MIN = 180 * DAY;

type AxisMode = "time" | "date" | "month" | "category";

/**
 * Max characters shown for a categorical (non-time) x-axis tick. Entity names
 * (experiment / dataset-run names) are frequently long and recharts neither
 * wraps nor truncates a tick. The width-aware thinning (see `prepareTimeAxis`)
 * is what keeps ticks from colliding; this cap just bounds the *shown* width so
 * a single very long outlier can't force the step so wide that almost nothing
 * shows (nor run off-canvas). The full value always stays in the tooltip; short
 * labels are untouched.
 */
const MAX_CATEGORY_LABEL_CHARS = 24;

/**
 * Minimum whitespace (px) recharts must leave between two shown categorical
 * ticks. `equidistantPreserveStart` (see `prepareTimeAxis`) already drops ticks
 * until their *labels* don't overlap; this adds a deliberate gap on top so the
 * kept ticks read as a handful of clearly-separated labels, not a dense strip.
 */
const CATEGORY_MIN_TICK_GAP_PX = 16;

/** End-truncate a long categorical label ("foo-bar-…"). Entity names carry
 * their distinguishing token early (e.g. "…-run-2-…"), so keeping the head and
 * dropping the tail preserves what tells ticks apart; the tooltip has the full
 * name. Short labels pass through untouched. */
function truncateCategoryLabel(label: string): string {
  if (label.length <= MAX_CATEGORY_LABEL_CHARS) return label;
  return `${label.slice(0, MAX_CATEGORY_LABEL_CHARS - 1)}…`;
}

/**
 * Parse a raw bucket value into a Date, but ONLY when it actually looks like a
 * timestamp: an epoch-ms number, an ISO string, or a "YYYY-MM-DD[ T]HH:MM:SS"
 * ClickHouse datetime (optionally a bare "YYYY-MM-DD"). Values without an
 * explicit timezone are treated as UTC, because the buckets come back
 * UTC-aligned — parsing them as local is what produced wrong dates.
 *
 * Deliberately conservative for strings: a categorical x-axis (e.g. the
 * dataset-compare view) feeds arbitrary labels through `time_dimension` —
 * including bare integers like "1", "47", or "20241230" (run names). Those must
 * render as-is, so we never coerce a bare number into an epoch date, and never
 * fall back to `new Date(<arbitrary string>)`. Mirrors the historical
 * `looksLikeIso` guard. (LFE-10549)
 */
export function parseChartTimestamp(raw: unknown): Date | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "") return null;

  const match = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (match) {
    const [, y, mo, d, h, mi, se, tz] = match;
    if (tz) {
      const parsed = new Date(s.replace(" ", "T"));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    // No timezone → interpret as UTC (the buckets are UTC-aligned).
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, se ? +se : 0));
  }

  // Bare calendar date (no time component) → UTC midnight.
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return new Date(Date.UTC(+y, +mo - 1, +d));
  }

  // Anything else is not a timestamp (a categorical label) — leave it to the
  // caller to render verbatim.
  return null;
}

/** Median spacing between sorted buckets — the inferred bucket size in ms. */
function inferBucketMs(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const sorted = [...timestamps].sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (diff > 0) diffs.push(diff);
  }
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

export type TimeAxis = {
  /**
   * recharts x-axis `interval`. Two shapes, by axis kind:
   * - time / date / month → a NUMERIC index-step (evenly spaced, width-blind).
   *   Labels are short single units ("2 PM" / "Jun 28"), so an index step gives
   *   uniform gaps that don't depend on chart width — the dashboard behaviour.
   * - categorical entity names → `"equidistantPreserveStart"`. These labels are
   *   long and variable-width; a numeric step skips recharts' collision test and
   *   overlaps them into a smear. This string interval instead picks the largest
   *   even step whose *rendered* labels don't collide. (LFE-10583)
   */
  interval: number | "equidistantPreserveStart";
  /** Scale-appropriate label for a shown tick. */
  formatTick: (raw: unknown) => string;
  /** Fuller label for the tooltip (always date + year, time when intraday). */
  formatTooltip: (raw: unknown) => string;
  mode: AxisMode;
  /**
   * Tick-label props the visualiser spreads onto the recharts `XAxis`.
   * Time / date / month ticks are short single-units rendered flat (`{}` → the
   * spread is a no-op, so dashboards are unchanged). Categorical entity names
   * are long, so we render them angled + end-anchored — the standard way to fit
   * long category labels — and set a `minTickGap` so the (width-aware thinned)
   * ticks keep a real gap between them. (LFE-10583)
   */
  tickProps: {
    angle?: number;
    textAnchor?: "start" | "middle" | "end";
    /** Extra x-axis height (px) an angled label needs so it isn't clipped. */
    height?: number;
    /** Minimum px gap recharts leaves between two shown ticks. */
    minTickGap?: number;
  };
};

/**
 * Decide the time-axis format + tick spacing for a set of raw bucket values.
 * `maxTicks` is how many labels fit the chart's measured width.
 */
export function prepareTimeAxis(rawValues: unknown[], maxTicks = 6): TimeAxis {
  const timestamps: number[] = [];
  for (const value of rawValues) {
    const date = parseChartTimestamp(value);
    if (date) timestamps.push(date.getTime());
  }

  const target = Math.max(2, maxTicks);

  // Non-temporal x-axis (e.g. the experiments / dataset-compare charts, whose
  // ticks are entity names like "demo-dataset-run-2-…-transcription-dataset"):
  // the labels aren't timestamps, so we don't invent dates. We treat the axis as
  // time only when most values actually parse.
  const temporal =
    timestamps.length > 0 && timestamps.length >= rawValues.length / 2;
  if (!temporal) {
    const full = (raw: unknown): string =>
      raw == null ? "" : typeof raw === "string" ? raw : String(raw);
    return {
      // The fix for the categorical smear (LFE-10583). A numeric interval makes
      // recharts show every Nth tick BY INDEX and skip its label-collision test,
      // so a handful of long entity names (~50 chars each) still overlap into an
      // illegible black strip — no matter how few we target, index-thinning is
      // blind to how wide each label actually is. `equidistantPreserveStart`
      // instead picks the largest even step at which every Nth *rendered* label
      // fits without colliding (recharts measures the formatted, angled label +
      // minTickGap), so long names collapse to a few evenly-spaced ticks with a
      // real gap, robust to hundreds of points. This is the "measure labels,
      // don't guess" principle (ARCHITECTURE.md #4) — the numeric time/date
      // budget guesses ~64px/label, which is 5× too small for entity names.
      interval: "equidistantPreserveStart",
      // Angle + end-anchor the (now few) long labels — the standard long-category
      // treatment, and it lets recharts fit a couple more without overlap. Also
      // end-truncate the shown label so a single outlier name can't run
      // off-canvas; the full name always stays in the tooltip.
      formatTick: (raw: unknown) => truncateCategoryLabel(full(raw)),
      formatTooltip: full,
      mode: "category",
      tickProps: {
        angle: -30,
        textAnchor: "end",
        height: 60,
        minTickGap: CATEGORY_MIN_TICK_GAP_PX,
      },
    };
  }

  const count = timestamps.length;
  const bucketMs = inferBucketMs(timestamps);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const span = count >= 2 ? maxTs - minTs : 0;
  // Date ticks normally omit the year (one unit per scale), but show it when the
  // range straddles a year boundary so "Dec 29 → Jan 5" stays unambiguous.
  // Use LOCAL year to match the tick formatter (toLocaleDateString renders in
  // local time), so a range that crosses Jan 1 locally still shows the year.
  const crossesYear =
    new Date(minTs).getFullYear() !== new Date(maxTs).getFullYear();

  const mode: AxisMode =
    span > 0 && span <= TIME_SCALE_MAX
      ? "time"
      : span >= MONTH_SCALE_MIN
        ? "month"
        : "date";

  let interval: number;
  if (mode === "time" || mode === "month") {
    // Evenly spaced by bucket index.
    interval = getEvenTickInterval(count, target);
  } else {
    // Date mode: align ticks to a whole number of days so each shown tick is a
    // distinct day at the same time-of-day — identical gaps, no repeated dates.
    const bucketsPerDay =
      bucketMs > 0 ? Math.max(1, Math.round(DAY / bucketMs)) : 1;
    const dayCount = Math.max(1, Math.round(count / bucketsPerDay));
    const dayStep = Math.max(1, Math.ceil(dayCount / target));
    interval = bucketsPerDay * dayStep - 1;
  }

  const subHour = bucketMs > 0 && bucketMs < HOUR;
  const subDay = bucketMs > 0 && bucketMs < DAY;

  const formatTick = (raw: unknown): string => {
    const date = parseChartTimestamp(raw);
    if (!date) return typeof raw === "string" ? raw : "";
    if (mode === "time") {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        ...(subHour ? { minute: "2-digit" } : {}),
      });
    }
    if (mode === "month") {
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(crossesYear ? { year: "numeric" } : {}),
    });
  };

  // The tooltip identifies one exact bucket, so it always carries the date +
  // year and adds the time whenever buckets are sub-day — otherwise every
  // hourly bucket within a day (e.g. a 7-day range trunc'd to the hour) would
  // show an identical "Jun 28, 2026" and you couldn't tell 1 AM from 11 PM.
  const formatTooltip = (raw: unknown): string => {
    const date = parseChartTimestamp(raw);
    if (!date) return typeof raw === "string" ? raw : "";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(subDay ? { hour: "numeric", minute: "2-digit" } : {}),
    });
  };

  // Time / date / month ticks are short single-units — rendered flat, exactly
  // as the dashboards do today (no orientation change → pixel-identical).
  return { interval, formatTick, formatTooltip, mode, tickProps: {} };
}
