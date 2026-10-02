import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";

// Guards to keep decoding bounded on very large payloads. Exceeding either
// limit returns the remainder undecoded (preserving browser responsiveness
// over decoding completeness).
export const DECODE_UNICODE_MAX_NODES = 50_000;
export const DECODE_UNICODE_MAX_DEPTH = 200;

// Mirrors the anti-prototype-pollution guard in deepParseJson (see
// packages/shared/src/utils/json.ts). deepParseJson strips these keys before
// we run, but an escaped wire key like "\\u005f\\u005fproto\\u005f\\u005f"
// survives its literal-string filter and only becomes "__proto__" after we
// decode it here — so we must re-apply the same guard on the decoded key to
// avoid assigning to Object.prototype accessors (e.g. the __proto__ setter).
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Iteratively decode \uXXXX escape sequences in all string values of a parsed JSON
 * structure. Used so that traces ingested via Python SDK's json.dumps(ensure_ascii=True)
 * display non-ASCII characters (e.g. Japanese, Chinese) correctly in the trace detail
 * view. Mirrors the approach used in IOTableCell and batch export (see PR #12882).
 *
 * Uses greedy mode to handle both \uXXXX (single-escaped) and \\uXXXX (double-escaped)
 * forms that can appear depending on the ingest path.
 *
 * Implemented iteratively (explicit stack) with node-count and depth caps so that
 * very large or deeply nested payloads cannot blow the call stack or freeze the tab.
 */
export function decodeUnicodeInJson(value: unknown): unknown {
  if (typeof value === "string") {
    return decodeUnicodeEscapesOnly(value, true);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const root: unknown[] | Record<string, unknown> = Array.isArray(value)
    ? []
    : {};

  type Frame = {
    source: unknown[] | Record<string, unknown>;
    target: unknown[] | Record<string, unknown>;
    depth: number;
  };
  const stack: Frame[] = [
    {
      source: value as unknown[] | Record<string, unknown>,
      target: root,
      depth: 0,
    },
  ];

  let nodeCount = 0;
  let budgetExceeded = false;

  while (stack.length > 0) {
    const { source, target, depth } = stack.pop()!;

    if (Array.isArray(source)) {
      const arr = target as unknown[];
      for (let i = 0; i < source.length; i++) {
        const v = source[i];
        if (budgetExceeded || ++nodeCount > DECODE_UNICODE_MAX_NODES) {
          budgetExceeded = true;
          arr[i] = v;
          continue;
        }
        arr[i] = assignDecodedOrDescend(v, depth, stack);
      }
    } else {
      const obj = target as Record<string, unknown>;
      for (const k of Object.keys(source as Record<string, unknown>)) {
        const v = (source as Record<string, unknown>)[k];
        // Keys can also contain \uXXXX escapes when the ingest path double-
        // encodes the payload, so decode them alongside the values.
        const decodedKey = decodeUnicodeEscapesOnly(k, true);
        // Drop keys that decode to a prototype-pollution vector (e.g. an
        // escaped "__proto__"), matching deepParseJson's DANGEROUS_KEYS filter.
        if (DANGEROUS_KEYS.has(decodedKey)) {
          continue;
        }
        if (budgetExceeded || ++nodeCount > DECODE_UNICODE_MAX_NODES) {
          budgetExceeded = true;
          obj[decodedKey] = v;
          continue;
        }
        obj[decodedKey] = assignDecodedOrDescend(v, depth, stack);
      }
    }
  }

  return root;
}

function assignDecodedOrDescend(
  v: unknown,
  depth: number,
  stack: Array<{
    source: unknown[] | Record<string, unknown>;
    target: unknown[] | Record<string, unknown>;
    depth: number;
  }>,
): unknown {
  if (typeof v === "string") {
    return decodeUnicodeEscapesOnly(v, true);
  }
  if (v === null || typeof v !== "object") {
    return v;
  }
  if (depth + 1 > DECODE_UNICODE_MAX_DEPTH) {
    return v; // bail on deeper subtrees to avoid runaway work
  }
  const child: unknown[] | Record<string, unknown> = Array.isArray(v) ? [] : {};
  stack.push({
    source: v as unknown[] | Record<string, unknown>,
    target: child,
    depth: depth + 1,
  });
  return child;
}
