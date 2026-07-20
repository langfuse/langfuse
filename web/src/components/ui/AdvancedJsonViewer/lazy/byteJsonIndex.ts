/**
 * Lazy UTF-8 JSON byte indexer (LFE-11082, spike LFE-11079).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * `JSON.parse` on a large document blows the V8 heap 5-8.5x the byte size and
 * hard-walls at the ~512MB JS-string cap, so a 200MB trace payload simply
 * cannot be viewed. The spike validated the "index the bytes, materialize on
 * demand" architecture using `big-json-viewer`, but that library is the wrong
 * dependency for two reasons:
 *   1. it is UTF-16 only (it inflates the doc into a `Uint16Array`, doubling
 *      memory and misreading multi-byte UTF-8), and
 *   2. it keeps NO cached child index, so every page re-walks the whole
 *      container (~470ms per page on a 200MB doc).
 *
 * This module is our own engine that fixes exactly those two problems:
 *   - it operates on the raw UTF-8 `Uint8Array` (never inflates to a JS string,
 *     never `JSON.parse`s the whole doc), keeping RSS ~1-1.5x the file, and
 *   - it scans each container exactly ONCE, caching a compact child-offset
 *     table in typed arrays, so pages after the first are O(page), not
 *     O(container).
 *
 * ---------------------------------------------------------------------------
 * WORKER <-> MAIN CONTRACT
 * ---------------------------------------------------------------------------
 * This is the worker-side engine. No actual Worker is wired up here; the three
 * public methods map 1:1 to the messages a wrapping Worker would handle:
 *   - `load(bytes)`                         -> root descriptor
 *   - `childrenPage(nodeId, offset, limit)` -> { children, total, hasMore }
 *   - `getValue(nodeId, maxBytes?)`         -> decoded value (+ lossyNumber)
 * `nodeId`s are stable numeric handles assigned by the engine (not paths), so
 * the main thread can address any previously-seen node by a plain number.
 *
 * ---------------------------------------------------------------------------
 * WASM SEAM
 * ---------------------------------------------------------------------------
 * The hot byte loops (skip whitespace / string / container, scan a token,
 * build a child-offset table) live behind the {@link ByteScanner} interface and
 * are implemented in pure TS by {@link JsByteScanner}. A future WASM module can
 * implement the same interface and be swapped in without touching the engine,
 * pagination, previews, or precision logic above it.
 *
 * Reference: the byte state machine is a UTF-8, cached-offset rewrite of
 * big-json-viewer's `buffer-json-parser` scanner (see NOTES at bottom for what
 * was reusable).
 */

// ============================================================================
// Public types
// ============================================================================

export type JsonNodeType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null";

export interface NodeDescriptor {
  /** Stable numeric handle assigned by the engine. */
  nodeId: number;
  /** Object member key (present only for object children). */
  key?: string;
  /** Array element index (present only for array children). */
  index?: number;
  type: JsonNodeType;
  /** Number of immediate children. Present once the node has been scanned. */
  childCount?: number;
  /** True for objects/arrays (i.e. has a `childrenPage`). */
  expandable: boolean;
  /** Short (~200 char) preview of the value. */
  preview: string;
  /** True if `preview` was cut short of the full value. */
  truncatedPreview: boolean;
}

export interface ChildrenPage {
  children: NodeDescriptor[];
  /** Total number of immediate children in the container. */
  total: number;
  /** True if `offset + limit < total`. */
  hasMore: boolean;
}

export interface GetValueResult {
  nodeId: number;
  type: JsonNodeType;
  /**
   * The decoded value. For containers this is the parsed subtree; for leaves
   * the parsed primitive. Out-of-double-range integers come back as `bigint`,
   * long-fraction numbers as their raw `string` (see `lossyNumber`). When
   * `truncated` is true this is the raw (unparsed) decoded text prefix.
   */
  value: unknown;
  /** True if the number could not be represented exactly as a JS `number`. */
  lossyNumber: boolean;
  /** True if `maxBytes` forced a partial slice (value not fully parsed). */
  truncated: boolean;
  /** Full byte length of the value (independent of `maxBytes`). */
  byteLength: number;
}

// ============================================================================
// Byte constants (JSON structural bytes are all ASCII => single UTF-8 bytes;
// UTF-8 continuation/lead bytes are all >= 0x80 and can never collide with
// these, so byte-wise scanning inside strings is safe).
// ============================================================================

const BRACE_OPEN = 0x7b; // {
const BRACE_CLOSE = 0x7d; // }
const BRACKET_OPEN = 0x5b; // [
const BRACKET_CLOSE = 0x5d; // ]
const COMMA = 0x2c; // ,
const DQUOTE = 0x22; // "
const BACKSLASH = 0x5c; // \
const SPACE = 0x20;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const MINUS = 0x2d; // -
const PLUS = 0x2b; // +
const DOT = 0x2e; // .
const CHAR_e = 0x65;
const CHAR_E = 0x45;
const CHAR_t = 0x74; // true
const CHAR_f = 0x66; // false
const CHAR_n = 0x6e; // null
const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;

// Compact numeric type tags stored in the columnar child tables.
const T_OBJECT = 0;
const T_ARRAY = 1;
const T_STRING = 2;
const T_NUMBER = 3;
const T_BOOLEAN = 4;
const T_NULL = 5;

const TYPE_NAMES: JsonNodeType[] = [
  "object",
  "array",
  "string",
  "number",
  "boolean",
  "null",
];

// Preview / value caps.
const PREVIEW_BYTE_CAP = 320; // bytes decoded to build a preview
const PREVIEW_CHAR_CAP = 200; // final preview character budget
const DEFAULT_MAX_VALUE_BYTES = 25 * 1024 * 1024; // getValue safety cap

// Significant decimal digits a double reliably round-trips. Numbers with more
// than this are treated as potentially lossy (conservative: we may preserve an
// exactly-representable 16-digit value as a raw string, which is still exact
// for display).
const DOUBLE_SAFE_SIG_DIGITS = 15;

// ============================================================================
// WASM seam: low-level byte scanner
// ============================================================================

export interface ScanResult {
  /** Exclusive end byte offset of the scanned value. */
  end: number;
  /** Compact type tag (T_*). */
  type: number;
}

export interface ScannedContainer {
  isObject: boolean;
  /** Start byte offset of each child value (Uint32 => docs up to 4GB). */
  starts: Uint32Array;
  /** Exclusive end byte offset of each child value. */
  ends: Uint32Array;
  /** Compact type tag (T_*) of each child. */
  types: Uint8Array;
  /** Decoded keys, parallel to the arrays above (objects only; null for arrays). */
  keys: string[] | null;
}

/**
 * The hot loop, isolated so a WASM implementation can replace it wholesale.
 * All methods take/return absolute byte offsets into the same backing buffer.
 */
export interface ByteScanner {
  readonly bytes: Uint8Array;
  /** First non-whitespace offset at or after `pos`. */
  skipWhitespace(pos: number): number;
  /**
   * Scan the single value beginning at `pos` (first non-ws byte). Returns its
   * exclusive end and type WITHOUT descending into / allocating children.
   */
  scanValue(pos: number): ScanResult;
  /**
   * Scan a container (`pos` at `{` or `[`) in one pass, producing the columnar
   * offset table of its immediate children.
   */
  scanContainer(pos: number): ScannedContainer;
}

/** Growable Uint32Array (avoids boxing 2M+ offsets through a JS number[]). */
class U32Builder {
  private buf: Uint32Array;
  private len = 0;
  constructor(initialCapacity = 16) {
    this.buf = new Uint32Array(initialCapacity);
  }
  push(v: number): void {
    if (this.len === this.buf.length) {
      const next = new Uint32Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.len++] = v;
  }
  finish(): Uint32Array {
    // slice to the exact length so the steady-state footprint is tight.
    return this.buf.slice(0, this.len);
  }
}

/** Growable Uint8Array. */
class U8Builder {
  private buf: Uint8Array;
  private len = 0;
  constructor(initialCapacity = 16) {
    this.buf = new Uint8Array(initialCapacity);
  }
  push(v: number): void {
    if (this.len === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.len++] = v;
  }
  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/**
 * Pure-TS UTF-8 byte scanner. This is the piece a WASM module would replace.
 */
export class JsByteScanner implements ByteScanner {
  readonly bytes: Uint8Array;
  private readonly decoder = new TextDecoder();

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  skipWhitespace(pos: number): number {
    const b = this.bytes;
    const n = b.length;
    let i = pos;
    while (i < n) {
      const c = b[i];
      if (c === SPACE || c === TAB || c === LF || c === CR) {
        i++;
        continue;
      }
      break;
    }
    return i;
  }

  /** `pos` at opening quote; returns offset just past the closing quote. */
  private skipString(pos: number): number {
    const b = this.bytes;
    const n = b.length;
    let i = pos + 1;
    while (i < n) {
      const c = b[i];
      if (c === BACKSLASH) {
        // Skip the backslash and the escaped byte. For \uXXXX the four hex
        // digits are ordinary bytes (never `"`/`\`), so this is correct.
        i += 2;
        continue;
      }
      if (c === DQUOTE) return i + 1;
      i++;
    }
    return n; // unterminated (malformed / truncated input)
  }

  /**
   * `pos` at `{` or `[`; depth-tracks to the matching close, skipping strings
   * so brackets inside string literals are ignored. Single forward pass.
   */
  private skipContainer(pos: number): number {
    const b = this.bytes;
    const n = b.length;
    let depth = 0;
    let i = pos;
    while (i < n) {
      const c = b[i];
      if (c === DQUOTE) {
        i = this.skipString(i);
        continue;
      }
      if (c === BRACE_OPEN || c === BRACKET_OPEN) {
        depth++;
        i++;
        continue;
      }
      if (c === BRACE_CLOSE || c === BRACKET_CLOSE) {
        depth--;
        i++;
        if (depth === 0) return i;
        continue;
      }
      i++;
    }
    return n; // malformed / truncated
  }

  /** Scan number / true / false / null token to its end. Lenient by design. */
  private skipNumber(pos: number): number {
    const b = this.bytes;
    const n = b.length;
    let i = pos;
    while (i < n) {
      const c = b[i];
      if (
        (c >= DIGIT_0 && c <= DIGIT_9) ||
        c === MINUS ||
        c === PLUS ||
        c === DOT ||
        c === CHAR_e ||
        c === CHAR_E
      ) {
        i++;
        continue;
      }
      break;
    }
    return i;
  }

  scanValue(pos: number): ScanResult {
    const c = this.bytes[pos];
    switch (c) {
      case DQUOTE:
        return { end: this.skipString(pos), type: T_STRING };
      case BRACE_OPEN:
        return { end: this.skipContainer(pos), type: T_OBJECT };
      case BRACKET_OPEN:
        return { end: this.skipContainer(pos), type: T_ARRAY };
      case CHAR_t:
        return { end: pos + 4, type: T_BOOLEAN }; // true
      case CHAR_f:
        return { end: pos + 5, type: T_BOOLEAN }; // false
      case CHAR_n:
        return { end: pos + 4, type: T_NULL }; // null
      default:
        return { end: this.skipNumber(pos), type: T_NUMBER };
    }
  }

  scanContainer(openPos: number): ScannedContainer {
    const b = this.bytes;
    const isObject = b[openPos] === BRACE_OPEN;
    const closeByte = isObject ? BRACE_CLOSE : BRACKET_CLOSE;
    const starts = new U32Builder();
    const ends = new U32Builder();
    const types = new U8Builder();
    const keys: string[] | null = isObject ? [] : null;

    let pos = this.skipWhitespace(openPos + 1);
    if (b[pos] === closeByte) {
      // Empty container.
      return {
        isObject,
        starts: starts.finish(),
        ends: ends.finish(),
        types: types.finish(),
        keys,
      };
    }

    for (;;) {
      if (isObject) {
        // key: b[pos] is the opening quote of the key string.
        const keyStart = pos;
        const keyEnd = this.skipString(pos);
        (keys as string[]).push(this.decodeStringSlice(keyStart, keyEnd));
        pos = this.skipWhitespace(keyEnd); // -> ':'
        pos = this.skipWhitespace(pos + 1); // past ':' -> value
      }

      const valStart = pos;
      const sr = this.scanValue(pos);
      starts.push(valStart);
      ends.push(sr.end);
      types.push(sr.type);

      pos = this.skipWhitespace(sr.end);
      const c = b[pos];
      if (c === COMMA) {
        pos = this.skipWhitespace(pos + 1);
        continue;
      }
      break; // c === closeByte (or EOF on malformed input)
    }

    return {
      isObject,
      starts: starts.finish(),
      ends: ends.finish(),
      types: types.finish(),
      keys,
    };
  }

  /** Decode a `"..."` slice (quotes included) and unescape via JSON.parse. */
  private decodeStringSlice(start: number, end: number): string {
    const text = this.decoder.decode(this.bytes.subarray(start, end));
    try {
      return JSON.parse(text) as string;
    } catch {
      return text;
    }
  }
}

// ============================================================================
// Internal node model
// ============================================================================

interface ChildTable {
  isObject: boolean;
  starts: Uint32Array;
  ends: Uint32Array;
  types: Uint8Array;
  keys: string[] | null;
  count: number;
  /** Lazily-assigned child index -> nodeId (only for children ever addressed). */
  ids: Map<number, number>;
}

interface NodeRecord {
  id: number;
  parentId: number | null;
  key: string | null;
  index: number | null;
  type: number; // T_*
  valueStart: number;
  valueEnd: number;
  /** Cached immediate-child offset table, built on first `childrenPage`. */
  childTable: ChildTable | null;
}

// ============================================================================
// Precision-preserving number parsing
// ============================================================================

function significantDigitCount(text: string): number {
  let s = text.replace(/^[+-]/, "");
  const eIdx = s.search(/[eE]/);
  if (eIdx >= 0) s = s.slice(0, eIdx);
  s = s.replace(".", "");
  s = s.replace(/^0+/, ""); // leading zeros are not significant
  s = s.replace(/0+$/, ""); // trailing zeros do not add precision pressure
  return s.length;
}

/**
 * Parse a JSON number literal without silently losing precision:
 *   - safe integers  -> `number`
 *   - big integers    -> `bigint`   (lossy=true: JSON.parse would round it)
 *   - long fractions  -> raw string (lossy=true)
 *   - everything else -> `number`
 */
export function parseNumberPreservePrecision(text: string): {
  value: number | bigint | string;
  lossy: boolean;
} {
  const t = text.trim();
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n)) return { value: n, lossy: false };
    return { value: BigInt(t), lossy: true };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) {
    // Overflows double range (e.g. 1e400) -> keep exact text.
    return { value: t, lossy: true };
  }
  const lossy = significantDigitCount(t) > DOUBLE_SAFE_SIG_DIGITS;
  return { value: lossy ? t : n, lossy };
}

// ============================================================================
// Engine
// ============================================================================

export class ByteJsonIndexEngine {
  private bytes: Uint8Array = new Uint8Array(0);
  private scanner: ByteScanner | null = null;
  private nodes: NodeRecord[] = [];
  private rootId = -1;
  private readonly decoder = new TextDecoder();

  /**
   * Point the engine at a UTF-8 byte buffer and index the root value only.
   * Cheap: it locates the root's bounds/type, it does NOT scan children.
   */
  load(bytes: Uint8Array): NodeDescriptor {
    this.bytes = bytes;
    this.scanner = new JsByteScanner(bytes);
    this.nodes = [];
    const start = this.scanner.skipWhitespace(0);
    const first = bytes[start];
    let type: number;
    let valueEnd: number;
    if (first === BRACE_OPEN || first === BRACKET_OPEN) {
      // Root container: its end is the last non-whitespace byte of the doc, so
      // we can find it without a full O(doc) scan. The real child scan is
      // deferred to the first childrenPage. This keeps `load` cheap.
      type = first === BRACE_OPEN ? T_OBJECT : T_ARRAY;
      let e = bytes.length;
      while (e > start) {
        const c = bytes[e - 1];
        if (c === SPACE || c === TAB || c === LF || c === CR) e--;
        else break;
      }
      valueEnd = e;
    } else {
      const sr = this.scanner.scanValue(start);
      type = sr.type;
      valueEnd = sr.end;
    }
    this.rootId = this.pushNode({
      parentId: null,
      key: null,
      index: null,
      type,
      valueStart: start,
      valueEnd,
    });
    return this.describe(this.rootId);
  }

  /**
   * Page through a container's immediate children. The FIRST call on a given
   * node scans the container once and caches its offset table; subsequent calls
   * (any offset) slice that cached table in O(limit).
   */
  childrenPage(nodeId: number, offset: number, limit: number): ChildrenPage {
    const node = this.mustNode(nodeId);
    if (node.type !== T_OBJECT && node.type !== T_ARRAY) {
      return { children: [], total: 0, hasMore: false };
    }
    const table = this.ensureChildTable(node);
    const total = table.count;
    const startIdx = Math.min(Math.max(0, offset), total);
    const endIdx = Math.min(total, startIdx + Math.max(0, limit));
    const children: NodeDescriptor[] = [];
    for (let i = startIdx; i < endIdx; i++) {
      children.push(this.describe(this.childNodeId(node, table, i)));
    }
    return { children, total, hasMore: endIdx < total };
  }

  /**
   * Materialize a single node's value on demand by slicing its bytes and
   * decoding just that slice with TextDecoder (never `String.fromCharCode`,
   * which throws on large slices).
   */
  getValue(
    nodeId: number,
    maxBytes: number = DEFAULT_MAX_VALUE_BYTES,
  ): GetValueResult {
    const node = this.mustNode(nodeId);
    const type = TYPE_NAMES[node.type];
    const byteLength = node.valueEnd - node.valueStart;
    const cap = maxBytes ?? Number.POSITIVE_INFINITY;
    const truncated = byteLength > cap;
    const sliceEnd = truncated ? node.valueStart + cap : node.valueEnd;
    const text = this.decoder.decode(
      this.bytes.subarray(node.valueStart, sliceEnd),
    );

    if (truncated) {
      // Cannot parse a partial slice; hand back the raw decoded prefix.
      return {
        nodeId,
        type,
        value: text,
        lossyNumber: false,
        truncated,
        byteLength,
      };
    }

    if (node.type === T_NUMBER) {
      const parsed = parseNumberPreservePrecision(text);
      return {
        nodeId,
        type,
        value: parsed.value,
        lossyNumber: parsed.lossy,
        truncated: false,
        byteLength,
      };
    }

    // string / boolean / null / object / array: parse the (bounded) slice.
    // NOTE: JSON.parse on a container subtree does not preserve big-number
    // precision for numbers nested inside it (see NOTES/gaps).
    const value = JSON.parse(text) as unknown;
    return {
      nodeId,
      type,
      value,
      lossyNumber: false,
      truncated: false,
      byteLength,
    };
  }

  /** Re-describe a known node (e.g. root after its children were scanned). */
  describeNode(nodeId: number): NodeDescriptor {
    return this.describe(nodeId);
  }

  // -- internals -----------------------------------------------------------

  private ensureChildTable(node: NodeRecord): ChildTable {
    if (node.childTable) return node.childTable;
    const scanned = this.scanner!.scanContainer(node.valueStart);
    node.childTable = {
      isObject: scanned.isObject,
      starts: scanned.starts,
      ends: scanned.ends,
      types: scanned.types,
      keys: scanned.keys,
      count: scanned.types.length,
      ids: new Map(),
    };
    return node.childTable;
  }

  private childNodeId(
    parent: NodeRecord,
    table: ChildTable,
    i: number,
  ): number {
    const existing = table.ids.get(i);
    if (existing !== undefined) return existing;
    const id = this.pushNode({
      parentId: parent.id,
      key: table.keys ? table.keys[i] : null,
      index: table.keys ? null : i,
      type: table.types[i],
      valueStart: table.starts[i],
      valueEnd: table.ends[i],
    });
    table.ids.set(i, id);
    return id;
  }

  private pushNode(rec: Omit<NodeRecord, "id" | "childTable">): number {
    const id = this.nodes.length;
    this.nodes.push({ ...rec, id, childTable: null });
    return id;
  }

  private mustNode(nodeId: number): NodeRecord {
    const node = this.nodes[nodeId];
    if (!node) throw new Error(`Unknown nodeId: ${nodeId}`);
    return node;
  }

  private describe(id: number): NodeDescriptor {
    const node = this.mustNode(id);
    const typeName = TYPE_NAMES[node.type];
    const expandable = node.type === T_OBJECT || node.type === T_ARRAY;
    const { preview, truncated } = this.makePreview(node);
    const d: NodeDescriptor = {
      nodeId: id,
      type: typeName,
      expandable,
      preview,
      truncatedPreview: truncated,
    };
    if (node.key !== null) d.key = node.key;
    if (node.index !== null) d.index = node.index;
    if (node.childTable) d.childCount = node.childTable.count;
    return d;
  }

  private makePreview(node: NodeRecord): {
    preview: string;
    truncated: boolean;
  } {
    // For an already-scanned container show a compact structural summary.
    if (node.childTable) {
      const label = node.type === T_ARRAY ? "Array" : "Object";
      return {
        preview: `${label}(${node.childTable.count})`,
        truncated: false,
      };
    }
    const total = node.valueEnd - node.valueStart;
    const sliceEnd = Math.min(
      node.valueEnd,
      node.valueStart + PREVIEW_BYTE_CAP,
    );
    let text = this.decoder.decode(
      this.bytes.subarray(node.valueStart, sliceEnd),
    );
    text = text.replace(/\s+/g, " ").trim();
    const bytesTruncated = total > sliceEnd - node.valueStart;
    const truncated = bytesTruncated || text.length > PREVIEW_CHAR_CAP;
    if (text.length > PREVIEW_CHAR_CAP) text = text.slice(0, PREVIEW_CHAR_CAP);
    return { preview: text, truncated };
  }
}

/** Convenience factory mirroring the worker `load(bytes)` entry point. */
export function loadByteJsonIndex(bytes: Uint8Array): {
  engine: ByteJsonIndexEngine;
  root: NodeDescriptor;
} {
  const engine = new ByteJsonIndexEngine();
  const root = engine.load(bytes);
  return { engine, root };
}

/*
 * ---------------------------------------------------------------------------
 * NOTES
 * ---------------------------------------------------------------------------
 * What was reusable from big-json-viewer's `buffer-json-parser` (~200 lines):
 *   - The state-machine SHAPE only: the set of primitives (skipWhitespace,
 *     skipString-with-escape-flag, per-value dispatch, number/token scan) and
 *     the structural byte constants. That is the ~30% that transferred.
 *   - Everything else was rewritten:
 *       * UTF-8 Uint8Array bytes instead of a UTF-16 Uint16Array (their design
 *         inflates the whole doc; we never do),
 *       * container skipping via a single depth-tracking `skipContainer` pass
 *         (bracket matching) rather than recursive descent,
 *       * a CACHED columnar child-offset table (their scanner re-walks the
 *         container to locate the Nth child on every access; that is the
 *         ~470ms/page regression we exist to remove),
 *       * lazy numeric nodeIds + precision-preserving number handling, neither
 *         of which their scanner has.
 *
 * Gaps / not yet validated (spike-grade):
 *   - Browser Worker wiring + transferable ArrayBuffer hand-off is unproven
 *     (this module is only the engine; the bench drives it in-process).
 *   - Browser ArrayBuffer / typed-array size caps are not probed here.
 *   - `getValue` on a container uses JSON.parse on the slice, so big numbers
 *     NESTED inside a returned subtree are not precision-preserved (only leaf
 *     number nodes accessed directly are).
 *   - Malformed / truncated input is handled leniently (best-effort bounds),
 *     not validated; a production build should surface parse errors.
 *   - The float lossiness rule is conservative (>15 significant digits), so a
 *     few exactly-representable 16-digit values are preserved as raw strings.
 */
