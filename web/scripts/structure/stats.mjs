#!/usr/bin/env node
// Structure stats — violations per project-structure-RFC rule over web/src.
//
//   pnpm structure:stats                     per-rule counts (+ Δ vs baseline)
//   pnpm structure:stats --rule 8            drill down: list rule 8 violations
//   pnpm structure:stats --scope src/features/traces
//                                            count only violations touching a path
//   pnpm structure:stats --diff              list new/fixed items vs the baseline
//   pnpm structure:stats --baseline          (re)write .structure-baseline.json
//   pnpm structure:stats --next [n]          top n work items to fix next (default 6)
//   pnpm structure:stats --json              machine-readable output
//
// Import-shaped rules run on a dependency-cruiser graph (same options as
// .dependency-cruiser.js); file-shaped rules run on a TS-parse census.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import extractTsConfig from "dependency-cruiser/config-utl/extract-ts-config";
import { buildCensus } from "./census.mjs";
import * as d from "./detectors.mjs";
import { computeNextItems } from "./next.mjs";

/** @typedef {import("./detectors.mjs").Violation} Violation */

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const BASELINE_PATH = `${webRoot}/.structure-baseline.json`;

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2);
/** @type {(name: string) => boolean} */
const flag = (name) => args.includes(`--${name}`);
/** @type {(name: string) => string | undefined} */
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const ruleFilter = opt("rule");
const scope = opt("scope");

const useColor =
  process.stdout.isTTY && !process.env.NO_COLOR && !flag("no-color");
/** @type {(code: string) => (s: string) => string} */
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : `${s}`);
const green = paint("32");
const red = paint("31");
const dim = paint("2");
const bold = paint("1");

// --- build graph + census ---------------------------------------------------
process.chdir(webRoot);
const t0 = Date.now();
const dcConfig = require(`${webRoot}/.dependency-cruiser.js`);
const cruiseResult = await cruise(
  ["src"],
  {
    includeOnly: dcConfig.options.includeOnly,
    doNotFollow: dcConfig.options.doNotFollow,
    tsPreCompilationDeps: true,
    tsConfig: dcConfig.options.tsConfig,
    validate: false,
  },
  undefined,
  { tsConfig: extractTsConfig(`${webRoot}/tsconfig.json`) },
);
const graph =
  typeof cruiseResult.output === "string"
    ? JSON.parse(cruiseResult.output)
    : cruiseResult.output;
const modules = graph.modules;
const tGraph = Date.now();

const census = buildCensus(webRoot);
const { files, dirs, contentOf, exportsOf } = census;

// --- run detectors -----------------------------------------------------------
const cycles = d.rule11(modules);
const r16 = d.rule16(files, contentOf);
const pages = d.thinPages(files, contentOf);
const mutualPairs = d.mutualFeaturePairs(modules);
const outsideDeep = d.outsideDeepImports(modules);
const kebab = d.kebabFiles(files);

const RULES = [
  {
    id: 1,
    mech: "census",
    title: "One component per file; PascalCase filename = component",
    get: () => d.rule1(files, exportsOf),
  },
  {
    id: 2,
    mech: "census",
    title: "Component file exports only the component (+ types)",
    get: () => d.rule2(files, exportsOf),
  },
  {
    id: 3,
    mech: "census",
    title: "hooks/fns/stores/contexts: camelCase, named after export",
    get: () => d.rule3(files, exportsOf),
  },
  {
    id: 4,
    mech: "census",
    title: "One function per file in fns/; no dump files",
    get: () => d.rule4(files, exportsOf),
  },
  {
    id: 5,
    mech: "census",
    title: "Kind folders: components|hooks|contexts|stores|fns|server",
    get: () => d.rule5(dirs),
  },
  {
    id: 6,
    mech: "graph",
    title: "A file used by one feature lives in that feature",
    get: () => d.rule6(modules),
  },
  {
    id: 7,
    mech: "graph",
    title: "No importing another component's internals",
    get: () => d.rule7(modules),
  },
  {
    id: 8,
    mech: "graph",
    title: "Cross-feature imports only via the feature's index.ts",
    get: () => d.rule8(modules),
  },
  {
    id: 9,
    mech: "census",
    title: "index.ts only at feature roots; named re-exports, no logic",
    get: () => d.rule9(files, exportsOf),
  },
  {
    id: 10,
    mech: "graph",
    title: "Client code does not import server/ (types excepted)",
    get: () => d.rule10(modules),
  },
  {
    id: 11,
    mech: "graph",
    title: "No runtime import cycles",
    get: () => cycles.runtime,
  },
  {
    id: 12,
    mech: "graph",
    title: "src/pages files import only a feature's Page component",
    get: () => d.rule12(modules),
  },
  {
    id: 13,
    mech: "census",
    title: "components/ui is frozen (file census — ratchet on adds)",
    get: () => d.rule13(files),
  },
  {
    id: 14,
    mech: "review",
    title: "Design-system components: no app state, no data fetching",
  },
  {
    id: 15,
    mech: "process",
    title: "Moves preserve git history (git mv; move ≠ edit)",
  },
  {
    id: 16,
    mech: "census",
    title: "ESLint ignores at file level only (line-level disables)",
    get: () => r16.lineLevel,
  },
  {
    id: 17,
    mech: "ratchet",
    title: "New code follows the rules; the baseline only shrinks",
  },
  {
    id: 18,
    mech: "census",
    title: "fn/hook tests colocated flat next to their file",
    get: () => d.rule18(files),
  },
  {
    id: 19,
    mech: "graph",
    title: "Only tests import __tests__; fixtures live in __tests__",
    get: () => d.rule19(modules, files),
  },
  {
    id: 20,
    mech: "graph",
    title: "No unused exports (file-level orphans; symbol-level TBD)",
    get: () => d.rule20(modules),
  },
];

/** @type {(viol: Violation) => boolean} */
const inScope = (viol) => !scope || viol.paths.some((p) => p.startsWith(scope));
/** @type {Map<number, Violation[]>} id -> sorted, deduped violations (scoped) */
const results = new Map();
for (const r of RULES) {
  if (!r.get) continue;
  const byKey = new Map(); // a pair of import statements can yield two graph edges
  for (const viol of r.get()) if (inScope(viol)) byKey.set(viol.key, viol);
  results.set(
    r.id,
    [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
  );
}
const tAll = Date.now();

const metrics = {
  "kebab-case files (naming sweep target: 0)": kebab.filter(
    (f) => !scope || f.startsWith(scope),
  ).length,
  "thin pages (<= 20 lines)": `${pages.thin} of ${pages.total}`,
  "mutually importing feature pairs": mutualPairs.length,
  "type-only import cycles (no runtime hazard)": cycles.typeOnly.length,
  "file-level eslint-disables (allowed, counted)": r16.fileLevel.length,
  "deep imports into features from non-feature code":
    outsideDeep.filter(inScope).length,
};

// --- baseline ----------------------------------------------------------------
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : null;

if (flag("baseline")) {
  if (scope) {
    console.error(
      "--baseline cannot be combined with --scope (it must snapshot everything)",
    );
    process.exit(1);
  }
  const snapshot = {
    rules: Object.fromEntries(
      [...results].map(([id, v]) => [id, v.map((x) => x.key)]),
    ),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(snapshot, null, 1) + "\n");
  console.log(`baseline written: ${BASELINE_PATH.replace(webRoot + "/", "")}`);
  process.exit(0);
}

// Scoped baseline counts: every violation key embeds its paths as
// whitespace-delimited tokens, so token-prefix matching gives the same
// semantics as inScope()'s path-prefix matching on current violations.
/** @type {(key: string) => boolean} */
const keyInScope = (key) =>
  !scope || key.split(/\s+/).some((t) => t.startsWith(scope));
/** @type {(id: number) => string[] | null} */
const baselineKeys = (id) => {
  /** @type {string[] | undefined} */
  const keys = baseline?.rules?.[id];
  if (!keys) return null;
  return keys.filter(keyInScope);
};

// --- output ------------------------------------------------------------------
if (flag("next")) {
  const nextArg = opt("next");
  const topN = nextArg && /^\d+$/.test(nextArg) ? Number(nextArg) : 6;
  const items = computeNextItems(results, topN);
  if (flag("json")) {
    console.log(
      JSON.stringify(
        items.map((it) => ({
          path: it.path,
          score: it.score,
          violations: it.count,
          byRule: Object.fromEntries(it.byRule),
          hint: it.hint,
          samples: it.samples,
        })),
        null,
        2,
      ),
    );
    process.exit(0);
  }
  console.log(
    bold(`what to fix next${scope ? ` — ${scope}` : " — web/src"}`) +
      dim(
        `  (top ${items.length}, leverage = violations cleared × rule weight)`,
      ),
  );
  console.log();
  items.forEach((it, i) => {
    const rules = [...it.byRule.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${n}× rule ${id}`)
      .join(", ");
    console.log(
      `${String(i + 1).padStart(2)}. ${bold(String(it.score).padStart(4) + " pts")}  ${it.path}`,
    );
    console.log(`     ${rules}${it.hint ? ` — ${it.hint}` : ""}`);
    for (const s of it.samples) console.log(dim(`     e.g. ${s}`));
    console.log();
  });
  if (!items.length) console.log("nothing left in scope 🎉");
  else
    console.log(
      dim(
        "full list for an item:  pnpm structure:stats --rule <n> --scope <path>",
      ),
    );
  process.exit(0);
}

if (flag("json")) {
  console.log(
    JSON.stringify(
      {
        rules: Object.fromEntries(
          [...results].map(([id, v]) => [
            id,
            { count: v.length, violations: v.map((x) => x.key) },
          ]),
        ),
        metrics,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

/** @type {(delta: number) => string} */
const fmtDelta = (delta) =>
  delta === 0 ? dim("±0") : delta < 0 ? green(String(delta)) : red(`+${delta}`);

if (ruleFilter) {
  const id = Number(ruleFilter);
  const rule = RULES.find((r) => r.id === id);
  if (!rule) {
    console.error(`unknown rule: ${ruleFilter} (1-20)`);
    process.exit(1);
  }
  if (!rule.get) {
    console.log(
      `rule ${id} (${rule.title}) is ${rule.mech}-enforced — nothing to list`,
    );
    process.exit(0);
  }
  const viols = results.get(id) ?? [];
  console.log(bold(`rule ${id} — ${rule.title}`));
  console.log(
    `${viols.length} violation${viols.length === 1 ? "" : "s"}${scope ? ` in ${scope}` : ""}\n`,
  );
  for (const x of viols) console.log("  " + x.key);
  process.exit(0);
}

if (flag("diff")) {
  if (!baseline) {
    console.error(
      "no baseline — write one first: pnpm structure:stats --baseline",
    );
    process.exit(1);
  }
  let anything = false;
  for (const r of RULES) {
    if (!r.get) continue;
    const now = new Set((results.get(r.id) ?? []).map((x) => x.key));
    const base = new Set(baselineKeys(r.id) ?? []);
    const fixed = [...base].filter((k) => !now.has(k));
    const added = [...now].filter((k) => !base.has(k));
    if (!fixed.length && !added.length) continue;
    anything = true;
    console.log(
      bold(`rule ${r.id} — ${r.title}  (${fmtDelta(now.size - base.size)})`),
    );
    for (const k of fixed) console.log(green("  − ") + dim(k));
    for (const k of added) console.log(red("  + ") + k);
    console.log();
  }
  if (!anything) console.log("no changes vs baseline");
  process.exit(0);
}

console.log(
  bold(
    `Structure stats — web/src vs the project-structure RFC${scope ? `  (scope: ${scope})` : ""}`,
  ),
);
console.log(
  dim(
    `graph: ${modules.length} modules, ${graph.summary.totalDependenciesCruised} edges (${((tGraph - t0) / 1000).toFixed(1)}s) · census: ${files.length} files (${((tAll - tGraph) / 1000).toFixed(1)}s)`,
  ),
);
console.log();
console.log(dim(" rule  count      Δ  mechanism  title"));
let total = 0;
let baseTotal = 0;
let hasBaseline = false;
for (const r of RULES) {
  const viols = r.get ? (results.get(r.id) ?? []) : null;
  const count = viols ? String(viols.length) : "—";
  let delta = "";
  if (viols) {
    total += viols.length;
    const bk = baselineKeys(r.id);
    if (bk) {
      hasBaseline = true;
      baseTotal += bk.length;
      delta = fmtDelta(viols.length - bk.length);
    }
  }
  console.log(
    `${String(r.id).padStart(5)}  ${count.padStart(5)}  ${delta.padStart(useColor && delta ? 14 : 5)}  ${r.mech.padEnd(9)}  ${r.title}`,
  );
}
console.log();
console.log(
  bold(`total: ${total}`) +
    (hasBaseline ? `  since baseline: ${fmtDelta(total - baseTotal)}` : ""),
);
console.log();
for (const [k, val] of Object.entries(metrics))
  console.log(dim(`  ${String(val).padStart(5)}  ${k}`));
console.log();
console.log(
  dim(
    "drill down:  pnpm structure:stats --rule 8 [--scope src/features/traces]",
  ),
);
if (!baseline)
  console.log(
    dim("snapshot:    pnpm structure:stats --baseline   (enables Δ + --diff)"),
  );
else console.log(dim("what moved:  pnpm structure:stats --diff"));
