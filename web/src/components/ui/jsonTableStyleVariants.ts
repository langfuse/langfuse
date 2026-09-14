import { useSyncExternalStore } from "react";

/**
 * Style directions for the PrettyJsonView table view, compared live behind a
 * debug toggle (localStorage `lf-json-style`). Once one is picked the others
 * are a deletion here: PrettyJsonView only reads `JSON_TABLE_STYLES[variant]`.
 */
export const JSON_TABLE_STYLE_VARIANTS = [
  "quiet",
  "quiet-dense",
  "dense-dotbreak",
  "tree",
  "tree-inline",
  "adaptive",
  "stacked",
  "zebra",
  "current",
  "current-noheader",
] as const;

export type JsonTableStyleVariant = (typeof JSON_TABLE_STYLE_VARIANTS)[number];

export const DEFAULT_JSON_TABLE_STYLE_VARIANT: JsonTableStyleVariant =
  "current";

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
  /** Alternate row backgrounds (bg-muted/40 on every second rendered row). */
  zebra: boolean;
  /** Leaf rows carry a small muted dot in the chevron column. */
  leafDot: boolean;
  /** Nested keys are prefixed with a "└" connector glyph. */
  connector: boolean;
  /** Collapsed object / array preview format. */
  collapsedPreview: "default" | "braces";
  /** `columns` layout only: fixed 35 % key column, or sized to the longest
      key with a 40 % cap. */
  keyColumn: "fixed" | "content";
  /** Expanded parent rows show a muted "N keys" / "N items" in the value cell
      instead of an empty cell. */
  expandedParentSummary: boolean;
  /** `inline` layout only: render a ":" between key and value. */
  inlineSeparator: boolean;
  /** `inline` layout only: vertical guide lines through the indentation of
      nested rows (cell padding moves onto the content so the lines join). */
  indentGuides: boolean;
  /** `inline` layout only: strings over 80 chars or with line breaks drop
      below the key at full width; everything else stays inline. */
  longValuesBelowKey: boolean;
  /** Keys get a soft break opportunity after every "." so dotted OTel keys
      wrap at segment boundaries instead of mid-word. */
  breakKeysAtDots: boolean;
};

const MONO_KEY = "font-mono text-xs wrap-break-word";
const QUIET_KEY = "text-muted-foreground text-xs wrap-break-word";

const BASE_FLAGS = {
  zebra: false,
  leafDot: false,
  connector: false,
  collapsedPreview: "default",
  keyColumn: "fixed",
  expandedParentSummary: false,
  inlineSeparator: true,
  indentGuides: false,
  longValuesBelowKey: false,
  breakKeysAtDots: false,
} satisfies Partial<JsonTableStyle>;

export const JSON_TABLE_STYLES: Record<JsonTableStyleVariant, JsonTableStyle> =
  {
    quiet: {
      ...BASE_FLAGS,
      label: "Quiet",
      reference: "LangSmith attributes",
      layout: "columns",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: QUIET_KEY,
      cell: "border-border/60 px-2 py-2.5 align-top whitespace-normal",
    },
    "quiet-dense": {
      ...BASE_FLAGS,
      label: "Quiet dense",
      reference: "quiet at today's row height, key column fits content",
      layout: "columns",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: QUIET_KEY,
      cell: "border-border/60 px-2 py-1 align-top whitespace-normal",
      keyColumn: "content",
      expandedParentSummary: true,
    },
    "dense-dotbreak": {
      ...BASE_FLAGS,
      label: "Dense, dot-break keys",
      reference: "quiet dense, dotted keys wrap at segments",
      layout: "columns",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: QUIET_KEY,
      cell: "border-border/60 px-2 py-1 align-top whitespace-normal",
      keyColumn: "content",
      expandedParentSummary: true,
      breakKeysAtDots: true,
    },
    tree: {
      ...BASE_FLAGS,
      label: "Tree",
      reference: "LangSmith fields",
      layout: "inline",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: "text-foreground text-xs wrap-break-word",
      cell: "border-b-0 px-2 py-1.5 align-top whitespace-normal",
      leafDot: true,
      collapsedPreview: "braces",
    },
    "tree-inline": {
      ...BASE_FLAGS,
      label: "Tree inline",
      reference: "muted key label, value inline, indent guides (IO)",
      layout: "inline",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: QUIET_KEY,
      cell: "border-b-0 px-2 py-0 align-top whitespace-normal",
      inlineSeparator: false,
      indentGuides: true,
    },
    adaptive: {
      ...BASE_FLAGS,
      label: "Adaptive",
      reference: "inline; long strings drop below the key at full width",
      layout: "inline",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: QUIET_KEY,
      cell: "border-border/60 px-2 py-1 align-top whitespace-normal",
      inlineSeparator: false,
      longValuesBelowKey: true,
    },
    stacked: {
      ...BASE_FLAGS,
      label: "Stacked",
      reference: "Braintrust",
      layout: "stacked",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: `text-primary-accent ${MONO_KEY}`,
      cell: "border-b-0 px-2 py-3 align-top whitespace-normal",
    },
    zebra: {
      ...BASE_FLAGS,
      label: "Zebra",
      reference: "Sentry tags",
      layout: "columns",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: MONO_KEY,
      cell: "border-b-0 px-2 py-2 align-top whitespace-normal",
      zebra: true,
      connector: true,
    },
    current: {
      ...BASE_FLAGS,
      label: "Current",
      reference: "today's rendering",
      layout: "columns",
      headerUnderTitle: true,
      boxUnderTitle: true,
      indentBase: 8,
      key: MONO_KEY,
      cell: "px-2 py-1 align-top whitespace-normal",
    },
    "current-noheader": {
      ...BASE_FLAGS,
      label: "Current, no header",
      reference: "today's rows without the Path / Value header and inner box",
      layout: "columns",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 8,
      key: MONO_KEY,
      cell: "px-2 py-1 align-top whitespace-normal",
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
