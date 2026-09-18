// Picks the tests most likely to already cover a changed test.
//
// Two ranking bases. With a coverage map, candidate files are ranked by shared
// covered production lines. Without one the skill runs degraded and ranks by
// shared production imports, weighted so a barrel every test imports —
// `@langfuse/shared/src/server` — counts for far less than a module two tests
// share alone.

export const TEST_FILE_RE = /\.(test|servertest|clienttest)\.(ts|tsx)$/;
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];
const INDEX_EXTENSIONS = ["/index.ts", "/index.tsx", "/index.js"];

const ALIASES = [
  { prefix: "@langfuse/shared/src/", to: "packages/shared/src/" },
  { prefix: "@langfuse/shared", to: "packages/shared/src/index" },
  { prefix: "@langfuse/ee/", to: "ee/src/" },
  { prefix: "@langfuse/ee", to: "ee/src/index" },
];

/** The workspace root a repo-relative file belongs to, e.g. `web`. */
export function packageRootOf(file) {
  const parts = file.split("/");
  return parts[0] === "packages" ? `${parts[0]}/${parts[1]}` : parts[0];
}

function normalize(path) {
  const out = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * Resolves an import specifier to a repo-relative file.
 * @param {string} spec
 * @param {string} fromFile repo-relative importer
 * @param {(path: string) => boolean} exists
 * @returns {string|null} null for node/third-party modules and unresolvable paths
 */
export function resolveImport(spec, fromFile, exists) {
  let base = null;

  if (spec.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1).join("/");
    base = normalize(`${dir}/${spec}`);
  } else if (spec.startsWith("@/")) {
    base = normalize(`${packageRootOf(fromFile)}/${spec.slice(2)}`);
  } else {
    const alias = ALIASES.find(
      (a) => spec === a.prefix || spec.startsWith(a.prefix),
    );
    if (!alias) return null;
    base = normalize(spec.replace(alias.prefix, alias.to));
  }

  // A specifier may already carry an extension, need one, or name a directory.
  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = base + ext;
    if (candidate && exists(candidate)) return candidate;
  }
  for (const ext of INDEX_EXTENSIONS) {
    if (exists(base + ext)) return base + ext;
  }
  return null;
}

/** Resolvable, non-test modules a test file imports. */
export function productionTargets(imports, fromFile, exists) {
  const out = new Set();
  for (const spec of imports) {
    const resolved = resolveImport(spec, fromFile, exists);
    if (resolved && !TEST_FILE_RE.test(resolved)) out.add(resolved);
  }
  return [...out];
}

/**
 * Inverts per-file module lists so a module's breadth of use is known.
 * @param {Map<string, string[]>} testToModules
 */
export function buildModuleIndex(testToModules) {
  const moduleToTests = new Map();
  for (const [file, modules] of testToModules) {
    for (const mod of modules) {
      if (!moduleToTests.has(mod)) moduleToTests.set(mod, new Set());
      moduleToTests.get(mod).add(file);
    }
  }
  return moduleToTests;
}

/** A module shared by many test files is weak evidence of redundancy. */
export function moduleWeight(moduleToTests, mod) {
  const breadth = moduleToTests.get(mod)?.size ?? 1;
  return 1 / Math.log2(breadth + 1);
}

function intersectLines(a, b) {
  let shared = 0;
  for (const [file, rangesA] of Object.entries(a)) {
    const rangesB = b[file];
    if (!rangesB) continue;
    for (const [aStart, aEnd] of rangesA) {
      for (const [bStart, bEnd] of rangesB) {
        const lo = Math.max(aStart, bStart);
        const hi = Math.min(aEnd, bEnd);
        if (hi >= lo) shared += hi - lo + 1;
      }
    }
  }
  return shared;
}

/**
 * Ranks other test files by overlap with `targetFile`, descending.
 * @returns {Array<{file: string, overlap: number, basis: string, shared: string[]}>}
 */
export function rankFiles({ targetFile, testToModules, coverage }) {
  if (coverage && coverage[targetFile]) {
    const mine = coverage[targetFile];
    return Object.entries(coverage)
      .filter(([file]) => file !== targetFile)
      .map(([file, theirs]) => ({
        file,
        overlap: intersectLines(mine, theirs),
        basis: "coverage",
        shared: Object.keys(theirs).filter((f) => f in mine),
      }))
      .filter((r) => r.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || a.file.localeCompare(b.file));
  }

  const moduleToTests = buildModuleIndex(testToModules);
  const mine = new Set(testToModules.get(targetFile) ?? []);
  const scored = [];
  for (const [file, modules] of testToModules) {
    if (file === targetFile) continue;
    const shared = modules.filter((m) => mine.has(m));
    if (!shared.length) continue;
    const overlap = shared.reduce(
      (sum, m) => sum + moduleWeight(moduleToTests, m),
      0,
    );
    scored.push({
      file,
      overlap: Number(overlap.toFixed(4)),
      basis: "imports",
      shared,
    });
  }
  return scored.sort(
    (a, b) => b.overlap - a.overlap || a.file.localeCompare(b.file),
  );
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "is",
  "are",
  "be",
  "to",
  "of",
  "for",
  "with",
  "when",
  "then",
  "it",
  "its",
  "that",
  "this",
  "should",
  "does",
  "do",
  "not",
  "no",
  "returns",
  "return",
  "given",
]);

/** Tokens shared between two test names or assertion lists, as a 0..1 ratio. */
export function similarity(a, b) {
  const tokens = (text) =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
    );
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const t of left) if (right.has(t)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

const fingerprint = (test) => `${test.name} ${test.assertions.join(" ")}`;

/**
 * Chooses the candidate tests shown to a judge. Siblings in the same file get
 * up to half the budget — two tests that can only fail together usually sit
 * next to each other — and ranked files fill the rest, best test per file so a
 * single large suite cannot crowd out every other source.
 *
 * @returns {Array<{id, file, name, line, source, overlap, basis}>}
 */
export function selectCandidates({ target, testsByFile, ranked, limit = 5 }) {
  const out = [];
  const siblingBudget = Math.ceil(limit / 2);

  const siblings = (testsByFile.get(target.file) ?? [])
    .filter((t) => t.id !== target.id)
    .map((t) => ({
      test: t,
      score: similarity(fingerprint(target), fingerprint(t)),
    }))
    .sort((a, b) => b.score - a.score || a.test.line - b.test.line)
    .slice(0, siblingBudget);

  for (const { test, score } of siblings) {
    out.push({
      ...pick(test),
      overlap: Number(score.toFixed(4)),
      basis: "sibling",
    });
  }

  for (const entry of ranked) {
    if (out.length >= limit) break;
    const best = (testsByFile.get(entry.file) ?? [])
      .map((t) => ({
        test: t,
        score: similarity(fingerprint(target), fingerprint(t)),
      }))
      .sort((a, b) => b.score - a.score || a.test.line - b.test.line)[0];
    if (!best) continue;
    out.push({
      ...pick(best.test),
      overlap: entry.overlap,
      basis: entry.basis,
    });
  }

  return out.slice(0, limit);
}

const pick = (t) => ({
  id: t.id,
  file: t.file,
  name: t.name,
  line: t.line,
  source: t.source,
});
