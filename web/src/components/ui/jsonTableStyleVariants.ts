import { useSyncExternalStore } from "react";

/**
 * Style directions for the PrettyJsonView table view, compared live behind a
 * debug toggle (localStorage `lf-json-style`). Once one is picked the others
 * are a deletion here: PrettyJsonView only reads `JSON_TABLE_STYLES[variant]`.
 */
export const JSON_TABLE_STYLE_VARIANTS = [
  "quiet",
  "tree",
  "stacked",
  "zebra",
  "current",
] as const;

export type JsonTableStyleVariant = (typeof JSON_TABLE_STYLE_VARIANTS)[number];

const DEFAULT_JSON_TABLE_STYLE_VARIANT: JsonTableStyleVariant = "quiet";

const JSON_TABLE_STYLE_STORAGE_KEY = "lf-json-style";

export type JsonTableStyle = {
  label: string;
  reference: string;
  /** columns = Path / Value; inline = key: value on one line; stacked = key above value. */
  layout: "columns" | "inline" | "stacked";
  /** Keep the Path / Value header row when a title frames the table. */
  headerUnderTitle: boolean;
  /** Keep the outer rounded box when a title frames the table. */
  boxUnderTitle: boolean;
  /** Width in px reserved for the chevron column at level 0. */
  indentBase: number;
  /** Key text classes. Value text is owned by ValueCell and never changes. */
  key: string;
  /** Cell padding + divider classes. */
  cell: string;
  /** Alternate row backgrounds (bg-muted/40 on even rows). */
  zebra: boolean;
  /** Leaf rows carry a small muted dot in the chevron column. */
  leafDot: boolean;
  /** Nested keys are prefixed with a "└" connector glyph. */
  connector: boolean;
  /** Collapsed object / array preview format. */
  collapsedPreview: "default" | "braces";
};

const MONO_KEY = "font-mono text-xs wrap-break-word";

export const JSON_TABLE_STYLES: Record<JsonTableStyleVariant, JsonTableStyle> =
  {
    quiet: {
      label: "Quiet",
      reference: "LangSmith attributes",
      layout: "columns",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: "text-muted-foreground text-xs wrap-break-word",
      cell: "border-border/60 px-2 py-2.5 align-top whitespace-normal",
      zebra: false,
      leafDot: false,
      connector: false,
      collapsedPreview: "default",
    },
    tree: {
      label: "Tree",
      reference: "LangSmith fields",
      layout: "inline",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: "text-foreground text-xs wrap-break-word",
      cell: "border-b-0 px-2 py-1.5 align-top whitespace-normal",
      zebra: false,
      leafDot: true,
      connector: false,
      collapsedPreview: "braces",
    },
    stacked: {
      label: "Stacked",
      reference: "Braintrust",
      layout: "stacked",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: `text-primary-accent ${MONO_KEY}`,
      cell: "border-b-0 px-2 py-3 align-top whitespace-normal",
      zebra: false,
      leafDot: false,
      connector: false,
      collapsedPreview: "default",
    },
    zebra: {
      label: "Zebra",
      reference: "Sentry tags",
      layout: "columns",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: MONO_KEY,
      cell: "border-b-0 px-2 py-2 align-top whitespace-normal",
      zebra: true,
      leafDot: false,
      connector: true,
      collapsedPreview: "default",
    },
    current: {
      label: "Current",
      reference: "today's rendering",
      layout: "columns",
      headerUnderTitle: true,
      boxUnderTitle: true,
      indentBase: 8,
      key: MONO_KEY,
      cell: "px-2 py-1 align-top whitespace-normal",
      zebra: false,
      leafDot: false,
      connector: false,
      collapsedPreview: "default",
    },
  };

const CHANGE_EVENT = "lf-json-style-change";

function isJsonTableStyleVariant(
  value: unknown,
): value is JsonTableStyleVariant {
  return (
    typeof value === "string" &&
    (JSON_TABLE_STYLE_VARIANTS as readonly string[]).includes(value)
  );
}

function readStoredVariant(): JsonTableStyleVariant | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(JSON_TABLE_STYLE_STORAGE_KEY);
    return isJsonTableStyleVariant(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredJsonTableStyleVariant(
  variant: JsonTableStyleVariant | null,
) {
  try {
    if (variant) {
      window.localStorage.setItem(JSON_TABLE_STYLE_STORAGE_KEY, variant);
    } else {
      window.localStorage.removeItem(JSON_TABLE_STYLE_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable: the in-memory event below still updates this tab.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getServerSnapshot(): JsonTableStyleVariant | null {
  return null;
}

/** The variant stored via the debug picker, or null when unset. */
export function useStoredJsonTableStyleVariant(): JsonTableStyleVariant | null {
  return useSyncExternalStore(subscribe, readStoredVariant, getServerSnapshot);
}

/** Stored override > caller prop > default. */
export function useJsonTableStyleVariant(
  variant?: JsonTableStyleVariant,
): JsonTableStyleVariant {
  const stored = useStoredJsonTableStyleVariant();
  return stored ?? variant ?? DEFAULT_JSON_TABLE_STYLE_VARIANT;
}

/** Dev builds always show the picker; production only once a variant is stored. */
export function useShowJsonTableStylePicker(): boolean {
  const stored = useStoredJsonTableStyleVariant();
  return stored !== null || process.env.NODE_ENV !== "production";
}
