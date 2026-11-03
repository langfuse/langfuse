import {
  AnnotationQueueDisplayColumn,
  type AnnotationQueueDisplayColumn as DisplayColumn,
} from "@langfuse/shared";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  buildLocalIsoDatePresentation,
  formatIntervalSeconds,
} from "@/src/utils/dates";
import { numberFormatter } from "@/src/utils/numbers";
import { getValueBadgeColor } from "@/src/features/annotation-queues/lib/queueItemScores";

/**
 * A queue's extra trace column (see `AnnotationQueueDisplayColumn`), with the
 * stable id the table and the filters use for it.
 */
export type QueueTraceColumn = DisplayColumn & { id: string };

/**
 * Column id for a source and key. Characters other than letters, digits and
 * `_` are escaped as `-<hex code>-`, so different keys (`a.b`, `a_b`) never
 * share an id.
 */
export const getQueueTraceColumnId = (
  column: Pick<DisplayColumn, "source" | "key">,
) =>
  `traceField-${column.source}-${column.key.replace(
    /[^a-zA-Z0-9_]/g,
    (char) => `-${char.codePointAt(0)!.toString(16)}-`,
  )}`;

/**
 * The queue's stored columns. Entries that no longer validate are skipped
 * rather than breaking the table. A repeated source and key gets a `~2`, `~3`…
 * suffix so every column keeps its own id.
 */
export function parseQueueTraceColumns(stored: unknown): QueueTraceColumn[] {
  if (!Array.isArray(stored)) return [];
  const seen = new Map<string, number>();
  return stored.flatMap((entry) => {
    const parsed = AnnotationQueueDisplayColumn.safeParse(
      entry && typeof entry === "object" ? { format: "text", ...entry } : entry,
    );
    if (!parsed.success) return [];
    const baseId = getQueueTraceColumnId(parsed.data);
    const count = (seen.get(baseId) ?? 0) + 1;
    seen.set(baseId, count);
    return [
      { ...parsed.data, id: count === 1 ? baseId : `${baseId}~${count}` },
    ];
  });
}

/** Top-level metadata keys the columns read, to fetch only those. */
export function getQueueTraceColumnMetadataKeys(
  columns: Pick<DisplayColumn, "source" | "key">[],
): string[] {
  return [
    ...new Set(
      columns
        .filter((column) => column.source === "metadata")
        .map((column) => column.key.split(".")[0]),
    ),
  ];
}

export type QueueTraceFieldSource = {
  userId?: string | null;
  sessionId?: string | null;
  name?: string | null;
  environment?: string | null;
  release?: string | null;
  version?: string | null;
  tags?: string[];
  metadata?: Record<string, string | null>;
};

const stringify = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value : JSON.stringify(value);
};

const readMetadataPath = (
  metadata: Record<string, string | null> | undefined,
  path: string,
): string | null => {
  const [key, ...rest] = path.split(".");
  const value = metadata?.[key] ?? null;
  if (rest.length === 0 || value === null) return stringify(value);
  try {
    let current: unknown = JSON.parse(value);
    for (const segment of rest) {
      if (current === null || typeof current !== "object") return null;
      current = (current as Record<string, unknown>)[segment];
    }
    return stringify(current);
  } catch {
    return null;
  }
};

/** The raw value a column shows for a trace. */
export function readQueueTraceField(
  trace: QueueTraceFieldSource,
  column: Pick<DisplayColumn, "source" | "key">,
): string | null {
  switch (column.source) {
    case "trace":
      return stringify(trace[column.key as keyof QueueTraceFieldSource]);
    case "metadata":
      return readMetadataPath(trace.metadata, column.key);
    case "tag": {
      const values = (trace.tags ?? [])
        .filter((tag) => tag.startsWith(column.key))
        .map((tag) => tag.slice(column.key.length))
        .filter(Boolean);
      return values.length > 0 ? values.join(", ") : null;
    }
  }
}

/** A numeric value: a plain number, as stored by most SDKs. */
export function parseQueueTraceFieldNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * A date: an ISO string, or a Unix timestamp in seconds or milliseconds
 * (values below 10^11 are read as seconds).
 */
export function parseQueueTraceFieldDate(value: string): Date | null {
  const number = parseQueueTraceFieldNumber(value);
  const date =
    number !== null
      ? new Date(Math.abs(number) < 1e11 ? number * 1000 : number)
      : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a phone number in its country's format: national format for the
 * North American Numbering Plan (`+12025550123` becomes `(202) 555-0123`),
 * international format otherwise (`+442079460123` becomes `+44 20 7946 0123`).
 * Values that are not a valid number with a country code are kept as is.
 */
export function formatPhoneNumber(value: string): string {
  const phone = parsePhoneNumberFromString(value);
  if (!phone?.isValid()) return value;
  return phone.countryCallingCode === "1"
    ? phone.formatNational()
    : phone.formatInternational();
}

const toHttpUrl = (value: string): string | null => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

export type FormattedQueueTraceField =
  | { kind: "text"; text: string; title?: string }
  | { kind: "link"; text: string; href: string }
  | {
      kind: "badge";
      text: string;
      color: ReturnType<typeof getValueBadgeColor>;
    };

/**
 * How a column shows a raw value. Values that do not fit the format (a URL
 * that is not http(s), text in a number column, …) fall back to plain text.
 */
export function formatQueueTraceField(
  value: string,
  format: DisplayColumn["format"],
): FormattedQueueTraceField {
  const asText = (text: string): FormattedQueueTraceField => ({
    kind: "text",
    text,
    title:
      text === value
        ? value
        : `${text}
${value}`,
  });
  switch (format) {
    case "phone":
      return asText(formatPhoneNumber(value));
    case "link": {
      const href = toHttpUrl(value);
      return href ? { kind: "link", text: value, href } : asText(value);
    }
    case "datetime": {
      const date = buildLocalIsoDatePresentation({
        date: parseQueueTraceFieldDate(value),
      });
      return date
        ? { kind: "text", text: date.display, title: date.title }
        : asText(value);
    }
    case "number": {
      const number = parseQueueTraceFieldNumber(value);
      return number !== null
        ? asText(numberFormatter(number, 0, 4))
        : asText(value);
    }
    case "duration": {
      const seconds = parseQueueTraceFieldNumber(value);
      return seconds !== null
        ? asText(
            formatIntervalSeconds(seconds, Number.isInteger(seconds) ? 0 : 1),
          )
        : asText(value);
    }
    case "badge":
      return { kind: "badge", text: value, color: getValueBadgeColor(value) };
    case "text":
      return { kind: "text", text: value, title: value };
  }
}

/** The text a column shows, for matching text filters. */
export function formatQueueTraceFieldText(
  value: string,
  format: DisplayColumn["format"],
): string {
  return formatQueueTraceField(value, format).text;
}
