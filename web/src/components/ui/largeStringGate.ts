/**
 * Size gate for very large *plain string* values in the IO render path
 * (LFE-10991, part of the LFE-10152 large-traces work).
 *
 * The parse guards that protect structured JSON only fire for object payloads:
 * `deepParseJson`'s `maxSize` check is `if (typeof json === "object")` (see
 * packages/shared/src/utils/json.ts), and the Pretty view's 500K / 300K limits
 * feed into it. A top-level *string* skips the size check entirely, so a
 * multi-megabyte single string flows unbounded into the Pretty view's render
 * machinery: several full-length O(n) main-thread passes (deepParseJson, the
 * markdown probe's `JSON.stringify`, and `decodeUnicodeInJson` — each run more
 * than once, including inside the always-mounted hidden JSON viewer) plus an
 * unvirtualized react18-json-view that holds the whole string. On a multi-MB
 * string this blocks the tab and inflates memory.
 *
 * This gate lets `PrettyJsonView` short-circuit such strings to a bounded
 * preview + download, matching the JSON-tab field size gate (LFE-10989).
 */

import { LARGE_STRING_RENDER_CHAR_LIMIT } from "./constants";

/**
 * Whether `value` is a plain string large enough to bypass the Pretty / JSON
 * render machinery in favour of a bounded preview + download. Non-strings and
 * strings at or below the limit return `false` and render normally.
 */
export function isLargeRenderString(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > LARGE_STRING_RENDER_CHAR_LIMIT
  );
}
