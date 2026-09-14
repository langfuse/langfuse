import { useSyncExternalStore } from "react";

/**
 * Style directions for the PrettyJsonView table view, compared live behind a
 * debug toggle. Tables are classed as facts (metadata, attributes, model
 * parameters) or IO (input, output, messages, tool calls) and each class
 * stores its own pick (localStorage `lf-json-style-facts` / `lf-json-style-io`;
 * the legacy `lf-json-style` still applies to both). The class is normally
 * the caller's (by field); `lf-json-style-class-mode` = "shape" derives it
 * from the data instead (see `classifyJsonShape`). Once directions are
 * picked the others are a deletion here: PrettyJsonView only reads
 * `JSON_TABLE_STYLES[variant]`.
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
  "sectioned",
  "inline-ruled",
] as const;

export type JsonTableStyleVariant = (typeof JSON_TABLE_STYLE_VARIANTS)[number];

export const DEFAULT_JSON_TABLE_STYLE_VARIANT: JsonTableStyleVariant =
  "current";

/** Which kind of data a table shows; facts and IO tables can pick
    different style directions. */
export const JSON_TABLE_DATA_CLASSES = ["facts", "io"] as const;

export type JsonTableDataClass = (typeof JSON_TABLE_DATA_CLASSES)[number];

export const DEFAULT_JSON_TABLE_DATA_CLASS: JsonTableDataClass = "facts";

export const JSON_TABLE_DATA_CLASS_LABELS: Record<JsonTableDataClass, string> =
  {
    facts: "Facts tables",
    io: "IO tables",
  };

/** How a table's data class is decided: by the field it shows (the caller's
    `dataClass`) or by the shape of the data (`classifyJsonShape`). */
export const JSON_TABLE_CLASS_MODES = ["field", "shape"] as const;

export type JsonTableClassMode = (typeof JSON_TABLE_CLASS_MODES)[number];

const DEFAULT_JSON_TABLE_CLASS_MODE: JsonTableClassMode = "field";

export const JSON_TABLE_CLASS_MODE_LABELS: Record<
  JsonTableClassMode,
  { label: string; reference: string }
> = {
  field: {
    label: "Field",
    reference:
      "metadata, attributes, parameters are facts; input, output are IO",
  },
  shape: {
    label: "Shape",
    reference:
      "arrays, long strings, deep or wide objects are IO; flat is facts",
  },
};

/** Longest top-level string a facts table still shows as a value column. */
const SHAPE_LONG_STRING_CHARS = 80;
/** Container levels (root counts as one) from which a table reads as IO. */
const SHAPE_DEEP_LEVELS = 3;
/** Top-level keys above which a table reads as IO. */
const SHAPE_WIDE_KEYS = 20;

function isLongOrMultiline(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (value.length > SHAPE_LONG_STRING_CHARS || value.includes("\n"))
  );
}

/** True when `value` nests `levels` or more container levels (itself
    included). Stops walking as soon as the bound is reached. */
function nestsAtLeast(value: unknown, levels: number): boolean {
  if (value === null || typeof value !== "object") return false;
  if (levels <= 1) return true;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.some((child) => nestsAtLeast(child, levels - 1));
}

/**
 * Data class by shape, not by field. A flat object with short values is a
 * fact sheet and wants a key / value column layout, whatever field it sits in
 * (the production p50 output is one). Anything that reads as content wants
 * the IO layout: a root array (chat messages, documents), a top-level string
 * over 80 chars or with a line break, three or more container levels, or
 * more than 20 top-level keys. Only the top level is inspected.
 */
export function classifyJsonShape(value: unknown): JsonTableDataClass {
  if (Array.isArray(value)) return "io";
  if (value === null || typeof value !== "object") {
    return isLongOrMultiline(value) ? "io" : "facts";
  }
  const entries = Object.values(value);
  if (entries.length > SHAPE_WIDE_KEYS) return "io";
  if (entries.some(isLongOrMultiline)) return "io";
  if (nestsAtLeast(value, SHAPE_DEEP_LEVELS)) return "io";
  return "facts";
}

/** Pre-split key; a value here applies to both classes. */
const LEGACY_JSON_TABLE_STYLE_STORAGE_KEY = "lf-json-style";

const JSON_TABLE_CLASS_MODE_STORAGE_KEY = "lf-json-style-class-mode";

const JSON_TABLE_STYLE_STORAGE_KEYS: Record<JsonTableDataClass, string> = {
  facts: "lf-json-style-facts",
  io: "lf-json-style-io",
};

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
  /** The section title carries a muted "N keys" / "N items" count of the
      top-level rows (title-owned tables only). */
  titleCount: boolean;
  /** Row classes (dividers drawn on the row instead of the cells). */
  row: string;
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
  titleCount: false,
  row: "",
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
    sectioned: {
      ...BASE_FLAGS,
      label: "Sectioned",
      reference: "one card per panel: title + key count, inset hairlines",
      layout: "columns",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: QUIET_KEY,
      cell: "border-b-0 px-2 py-1 align-top whitespace-normal",
      // Hairlines stop at the cell padding instead of running edge to edge,
      // and the last row of a section has none.
      row: "relative after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border last:after:hidden",
      keyColumn: "content",
      expandedParentSummary: true,
      titleCount: true,
    },
    "inline-ruled": {
      ...BASE_FLAGS,
      label: "Inline, ruled",
      reference: "tree inline with hairlines, every row key then value",
      layout: "inline",
      headerUnderTitle: false,
      boxUnderTitle: false,
      indentBase: 16,
      key: QUIET_KEY,
      cell: "px-2 py-1 align-top whitespace-normal",
      inlineSeparator: false,
      expandedParentSummary: true,
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

function readStoredVariant(storageKey: string): JsonTableStyleVariant | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(storageKey);
    return isJsonTableStyleVariant(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredVariant(
  storageKey: string,
  variant: JsonTableStyleVariant | null,
) {
  try {
    if (variant) {
      window.localStorage.setItem(storageKey, variant);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Storage unavailable: the in-memory event below still updates this tab.
  }
}

function isJsonTableClassMode(value: unknown): value is JsonTableClassMode {
  return (
    typeof value === "string" &&
    (JSON_TABLE_CLASS_MODES as readonly string[]).includes(value)
  );
}

function readStoredClassMode(): JsonTableClassMode | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(
      JSON_TABLE_CLASS_MODE_STORAGE_KEY,
    );
    return isJsonTableClassMode(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredClassMode(mode: JsonTableClassMode | null) {
  try {
    if (mode) {
      window.localStorage.setItem(JSON_TABLE_CLASS_MODE_STORAGE_KEY, mode);
    } else {
      window.localStorage.removeItem(JSON_TABLE_CLASS_MODE_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable: the in-memory event below still updates this tab.
  }
}

function notifyChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Store how tables decide their data class (field or shape). */
export function writeStoredJsonTableClassMode(mode: JsonTableClassMode) {
  writeStoredClassMode(mode);
  notifyChange();
}

/** Store the debug pick for one data class. */
export function writeStoredJsonTableStyleVariant(
  dataClass: JsonTableDataClass,
  variant: JsonTableStyleVariant | null,
) {
  writeStoredVariant(JSON_TABLE_STYLE_STORAGE_KEYS[dataClass], variant);
  notifyChange();
}

/** Clear every stored pick (both classes, the legacy shared key, the class
    mode). */
export function clearStoredJsonTableStyleVariants() {
  for (const dataClass of JSON_TABLE_DATA_CLASSES) {
    writeStoredVariant(JSON_TABLE_STYLE_STORAGE_KEYS[dataClass], null);
  }
  writeStoredVariant(LEGACY_JSON_TABLE_STYLE_STORAGE_KEY, null);
  writeStoredClassMode(null);
  notifyChange();
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getServerSnapshot(): null {
  return null;
}

/** The class mode stored via the debug picker, or null when unset. */
export function useStoredJsonTableClassMode(): JsonTableClassMode | null {
  return useSyncExternalStore(
    subscribe,
    readStoredClassMode,
    getServerSnapshot,
  );
}

/** Stored class mode > default (field). */
export function useJsonTableClassMode(): JsonTableClassMode {
  return useStoredJsonTableClassMode() ?? DEFAULT_JSON_TABLE_CLASS_MODE;
}

function useStoredVariantForKey(
  storageKey: string,
): JsonTableStyleVariant | null {
  return useSyncExternalStore(
    subscribe,
    () => readStoredVariant(storageKey),
    getServerSnapshot,
  );
}

/** The variant stored via the debug picker for `dataClass` (falling back to
    the legacy shared key), or null when unset. */
export function useStoredJsonTableStyleVariant(
  dataClass: JsonTableDataClass,
): JsonTableStyleVariant | null {
  const stored = useStoredVariantForKey(
    JSON_TABLE_STYLE_STORAGE_KEYS[dataClass],
  );
  const legacy = useStoredVariantForKey(LEGACY_JSON_TABLE_STYLE_STORAGE_KEY);
  return stored ?? legacy;
}

/** Stored pick for the class > legacy shared pick > caller prop > default. */
export function useJsonTableStyleVariant(
  dataClass: JsonTableDataClass,
  variant?: JsonTableStyleVariant,
): JsonTableStyleVariant {
  const stored = useStoredJsonTableStyleVariant(dataClass);
  return stored ?? variant ?? DEFAULT_JSON_TABLE_STYLE_VARIANT;
}

/** Dev builds always show the picker; production only once a pick is stored
    for either class (or the legacy key). */
export function useShowJsonTableStylePicker(): boolean {
  const facts = useStoredJsonTableStyleVariant("facts");
  const io = useStoredJsonTableStyleVariant("io");
  return facts !== null || io !== null || process.env.NODE_ENV !== "production";
}
