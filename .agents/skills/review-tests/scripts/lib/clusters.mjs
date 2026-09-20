// Builds the hypothesis clusters `gather` emits: for each production symbol a
// changed test calls, the test blocks across the suite that statically
// reference it. This is the static index that scopes `measure`, which then
// stubs each symbol and returns the confirmed cluster in the same shape. No
// ranking lives here — `measure` gives ground truth, so gather only decides
// which symbols are worth stubbing and which files reference each.

/**
 * Parses `git diff -U0` output into each file's added line ranges. A pure
 * deletion (`+n,0`) contributes no range.
 *
 * @param {string} diffText
 * @returns {Map<string, Array<[number, number]>>}
 */
export function parseHunks(diffText) {
  const hunks = new Map();
  let current = null;
  for (const line of diffText.split("\n")) {
    const file = /^\+\+\+ b\/(.+)$/.exec(line);
    if (file) {
      current = file[1];
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))?/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count === 0) continue;
      if (!hunks.has(current)) hunks.set(current, []);
      hunks.get(current).push([start, start + count - 1]);
    }
  }
  return hunks;
}

/** Whether a test block overlaps any changed range; no ranges means all count. */
export function inHunks(test, ranges) {
  return (
    !ranges || ranges.some(([lo, hi]) => test.endLine >= lo && test.line <= hi)
  );
}

/** The union of the symbols the in-scope tests call, deduped and sorted. */
export function seedSymbols(entries) {
  const set = new Set();
  for (const { symbols } of entries) for (const s of symbols ?? []) set.add(s);
  return [...set].sort();
}

/**
 * Inverts per-test symbol lists into symbol → the test blocks that reference
 * it, each `{file, line}`, sorted by file then line.
 *
 * @param {Map<string, {file: string, test: {line: number}, symbols: string[]}>} byTestId
 * @returns {Map<string, Array<{file: string, line: number}>>}
 */
export function buildReferenceBlocks(byTestId) {
  const blocks = new Map();
  for (const { file, test, symbols } of byTestId.values()) {
    for (const sym of symbols) {
      if (!blocks.has(sym)) blocks.set(sym, []);
      blocks.get(sym).push({ file, line: test.line });
    }
  }
  for (const arr of blocks.values()) {
    arr.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }
  return blocks;
}

/**
 * Turns seed symbols into hypothesis clusters. A symbol called from more than
 * `threshold` test files is not discriminating and is dropped. A symbol whose
 * definition cannot be located — a member or method symbol, an unlocatable
 * export, or a module that cannot be read — is emitted as `{ok: false}` and
 * never handed to `measure` as runnable. The rest carry the export's line and
 * the test blocks that reference it.
 *
 * @param {object} args
 * @param {string[]} args.seeds sorted seed symbols
 * @param {Map<string, Set<string>>} args.index symbol → referencing test files (breadth)
 * @param {Map<string, Array<{file: string, line: number}>>} args.blocks symbol → referencing blocks
 * @param {number} args.threshold max breadth kept
 * @param {(modulePath: string) => (string|null)} args.readSource module source, or null when absent
 * @param {(symbol: string, source: string) => ({line: number}|null)} args.locate export locator
 * @returns {Array<object>} the shared cluster shape
 */
export function buildClusters({
  seeds,
  index,
  blocks,
  threshold,
  readSource,
  locate,
}) {
  const clusters = [];
  for (const symbol of seeds) {
    const breadth = index.get(symbol)?.size ?? 0;
    if (breadth > threshold) continue;
    const modulePath = symbol.slice(0, symbol.indexOf("#"));
    const source = readSource(modulePath);
    const span = source == null ? null : locate(symbol, source);
    if (!span) {
      clusters.push({
        ok: false,
        error:
          source == null
            ? "could not read module source"
            : "could not locate export definition to stub",
        code: { symbol },
      });
      continue;
    }
    clusters.push({
      ok: true,
      code: { symbol, line: span.line },
      tests: blocks.get(symbol) ?? [],
    });
  }
  return clusters;
}
