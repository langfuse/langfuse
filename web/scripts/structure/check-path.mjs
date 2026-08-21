#!/usr/bin/env node
// Placement check for a single path — "would creating this file add a
// project-structure violation?" — answered from the path alone.
//
//   node scripts/structure/check-path.mjs <path...>     human-readable findings
//   node scripts/structure/check-path.mjs --json <path...>
//
// This is the fast lane of `structure:stats`: no dependency-cruiser graph, no
// TS parse, so it costs a directory read instead of seconds. It therefore
// answers only for the census rules a path decides on its own — 1, 3, 4, 5, 9,
// 13, 18 — and never for a graph rule, which cannot be known before the
// file's imports exist.
//
// The verdict is a prediction of what the sensor would count, so the checks
// below reuse detectors.mjs where a detector is already path-only and mirror
// only its naming half where it is not. A rule the sensor does not count is
// not denied here.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as d from "./detectors.mjs";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = resolve(webRoot, "..");

/** @typedef {{ rule: number, verdict: "deny" | "ask", title: string, detail: string, correctPath: string | null, ruleFile: string }} Finding */

export const SKIP_ENV_VAR = "LANGFUSE_SKIP_STRUCTURE_HOOK";
const SKILL_RULES = ".agents/skills/project-structure/rules";
const KIND_DIRS = [
  "components",
  "hooks",
  "contexts",
  "stores",
  "fns",
  "server",
  "constants",
  "types",
];
/** @type {Record<number, string>} */
const RULE_FILES = {
  1: "01-one-component-per-file.md",
  3: "03-camelcase-named-after-the-export.md",
  4: "04-one-function-per-file-in-fns.md",
  5: "05-kind-folders-are-a-closed-list.md",
  9: "09-index-files-only-at-feature-surfaces.md",
  13: "13-components-ui-is-frozen.md",
  18: "18-fn-and-hook-tests-colocate-flat.md",
};
/** @type {Record<number, string>} */
const RULE_TITLES = {
  1: "one component per file, PascalCase filename matching the component",
  3: "hooks, fns, stores and contexts are camelCase, named after the export",
  4: "one function per file in fns/, no dump files",
  5: `kind folders are a closed list: ${KIND_DIRS.join(", ")}`,
  9: "index.ts only at a feature root and its server/ root",
  13: "components/ui is frozen — nothing new goes in",
  18: "tests for fns and hooks sit flat next to their file",
};
// Rule 18 cannot tell a misplaced test from a test written before its subject
// exists, so it surfaces instead of blocking.
const ASK_RULES = new Set([18]);

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const CODE_FILE = /\.[jt]sx?$/;
const NON_COMPONENT_KINDS =
  /(^|\/)(fns|hooks|stores|contexts|constants|types|server)\//;
const DUMP_STEMS = /^(helpers?|utils?|index|misc|common|fns|types|constants)$/;
// Folder names that show up in place of a kind folder, and what they meant.
/** @type {Record<string, string>} */
const KIND_REPLACEMENTS = {
  util: "fns",
  utils: "fns",
  helper: "fns",
  helpers: "fns",
  lib: "fns",
  libs: "fns",
  functions: "fns",
  config: "constants",
  configs: "constants",
  constant: "constants",
  type: "types",
  hook: "hooks",
  store: "stores",
  context: "contexts",
  component: "components",
};

/** @type {(p: string) => string} */
const base = (p) => p.slice(p.lastIndexOf("/") + 1);
/** @type {(p: string) => string} */
const stemOf = (p) => base(p).replace(CODE_FILE, "");
/** @type {(p: string) => string} */
const dirOf = (p) => p.slice(0, p.length - base(p).length);
/** @type {(s: string) => string} */
const toPascal = (s) =>
  s
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
/** @type {(s: string) => string} */
const toCamel = (s) => {
  const pascal = toPascal(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

/**
 * Normalizes any spelling of a target file to a web-relative path
 * (`src/...`), or null when it is outside `web/src`.
 * @type {(input: string) => string | null}
 */
export function toWebPath(input) {
  const absolute = input.startsWith("/")
    ? input
    : existsSync(resolve(repoRoot, input))
      ? resolve(repoRoot, input)
      : resolve(repoRoot, input).startsWith(`${webRoot}/`)
        ? resolve(repoRoot, input)
        : resolve(webRoot, input);
  if (!absolute.startsWith(`${webRoot}/src/`)) return null;
  return absolute.slice(webRoot.length + 1);
}

/** @type {(rule: number, detail: string, correctPath: string | null) => Finding} */
const finding = (rule, detail, correctPath) => ({
  rule,
  verdict: ASK_RULES.has(rule) ? "ask" : "deny",
  title: RULE_TITLES[rule],
  detail,
  correctPath,
  ruleFile: `${SKILL_RULES}/${RULE_FILES[rule]}`,
});

// Rule 5 — reuse the detector so the hook and the dashboard cannot disagree
// about what a kind folder is. It reads directories, so feed it the ancestors
// of the new file.
/** @type {(p: string) => Finding[]} */
function checkKindFolders(p) {
  const segments = dirOf(p).replace(/\/$/, "").split("/");
  const dirs = segments
    .map((_, i) => segments.slice(0, i + 1).join("/"))
    .filter((dir) => dir !== "src");
  return d.rule5(dirs).map((violation) => {
    const dir = violation.paths[0];
    const name = base(dir);
    const replacement = KIND_REPLACEMENTS[name.toLowerCase()];
    return finding(
      5,
      violation.key.slice(dir.length + 2),
      replacement
        ? p.replace(`/${name}/`, `/${replacement}/`)
        : PASCAL.test(name)
          ? p.replace(`/${name}/`, `/components/${name}/`)
          : null,
    );
  });
}

// Rule 9 — mirrors the detector's location half; `export *` and stray
// declarations need the file's text and stay with the dashboard.
/** @type {(p: string) => Finding[]} */
function checkIndexFile(p) {
  if (!/(^|\/)index\.[jt]sx?$/.test(p)) return [];
  const inScope =
    /^src\/(?:ee\/)?(features|components|hooks|contexts|stores|fns|utils|constants|lib)\//.test(
      p,
    );
  if (!inScope) return [];
  const featureIndex = /^src\/(?:ee\/)?features\/[^/]+\/index\.tsx?$/.test(p);
  const serverIndex = /^src\/(?:ee\/)?features\/[^/]+\/server\/index\.tsx?$/.test(
    p,
  );
  if (featureIndex || serverIndex) return [];
  // Anything deeper inside server/ is unspecified by the rules, as in rule 9.
  if (/(^|\/)server\//.test(p)) return [];
  const feature = p.match(/^src\/(?:ee\/)?features\/[^/]+\//);
  return [
    finding(
      9,
      "an index file here is a module boundary nobody designed — import the module directly",
      feature ? `${feature[0]}index.ts` : null,
    ),
  ];
}

/** @type {(p: string) => Finding[]} */
function checkFrozenUi(p) {
  if (!/^src\/components\/ui\//.test(p) || d.isTestish(p)) return [];
  return [
    finding(
      13,
      "the shadcn folder only shrinks: new files go to the feature that uses it, or to design-system when it is a designed abstraction",
      `src/components/design-system/${toPascal(stemOf(p))}/${toPascal(stemOf(p))}.tsx`,
    ),
  ];
}

// Rule 1 — the filename half only. Whether a `.tsx` exports one component
// needs its text, so this fires where a component is the only thing the path
// can mean. A camelCase stem is taken at its word — `showErrorToast.tsx` is a
// function that returns JSX, which rule 3 governs, not a component.
/** @type {(p: string) => Finding[]} */
function checkComponentName(p) {
  if (!p.endsWith(".tsx") || d.isTestish(p) || /^src\/pages\//.test(p))
    return [];
  const stem = stemOf(p);
  if (/^use[A-Z]/.test(stem) || /^[A-Z][A-Za-z0-9]*Context\.tsx$/.test(base(p)))
    return [];
  if (NON_COMPONENT_KINDS.test(p)) return [];
  const parent = base(dirOf(p).replace(/\/$/, ""));
  const componentPosition =
    parent === "components" ||
    PASCAL.test(parent) ||
    /^src\/(?:ee\/)?features\/[^/]+\/[^/]+$/.test(p);
  if (!componentPosition || PASCAL.test(stem) || CAMEL.test(stem)) return [];
  return [
    finding(
      1,
      `filename '${stem}' is neither PascalCase (a component) nor camelCase (a module)`,
      `${dirOf(p)}${toPascal(stem)}.tsx`,
    ),
  ];
}

// Rule 3 — the filename half only; "named after the export" needs the text.
/** @type {(p: string) => Finding[]} */
function checkModuleName(p) {
  if (d.isTestish(p) || /(^|\/)server\//.test(p)) return [];
  const stem = stemOf(p);
  const inKind = /(^|\/)(hooks|fns|stores|contexts)\//.test(p);
  if (!inKind && !/^use[A-Z]/.test(stem)) return [];
  if (/^[A-Z][A-Za-z0-9]*Context\.tsx?$/.test(base(p))) return [];
  if (/(^|\/)fns\/index\.[jt]s$/.test(p)) return [];
  if (CAMEL.test(stem)) return [];
  return [
    finding(
      3,
      `filename '${stem}' is not camelCase`,
      `${dirOf(p)}${toCamel(stem)}${p.endsWith(".tsx") ? ".tsx" : ".ts"}`,
    ),
  ];
}

/** @type {(p: string) => Finding[]} */
function checkFnsDumpFile(p) {
  if (d.isTestish(p) || !/(^|\/)fns\//.test(p)) return [];
  if (!DUMP_STEMS.test(stemOf(p))) return [];
  return [
    finding(
      4,
      `'${stemOf(p)}' is a dump file — one function per file, named after it, or a module folder like fns/searchJson/`,
      null,
    ),
  ];
}

// Rule 18 — the only check that reads the filesystem: a colocated test needs
// its subject beside it.
/** @type {(p: string) => Finding[]} */
function checkTestColocation(p) {
  const match = base(p).match(/^(.+)\.(clienttest|test|spec)\.(tsx?)$/);
  if (!match || /(^|\/)(__tests__|__e2e__|__mocks__)\//.test(p)) return [];
  const dir = dirOf(p);
  let subject = match[1];
  while (subject) {
    if (
      existsSync(`${webRoot}/${dir}${subject}.ts`) ||
      existsSync(`${webRoot}/${dir}${subject}.tsx`)
    )
      return [];
    const dot = subject.lastIndexOf(".");
    subject = dot > 0 ? subject.slice(0, dot) : "";
  }
  return [
    finding(
      18,
      `no ${match[1]}.ts(x) next to it — create the subject module first, or put the test beside the module it tests`,
      `${dir}${match[1]}.${match[3]}`,
    ),
  ];
}

/**
 * Findings for one path, in rule order. Empty means the path adds no
 * violation this check can see.
 * @type {(input: string) => Finding[]}
 */
export function checkPath(input) {
  const p = toWebPath(input);
  if (!p || !CODE_FILE.test(p)) return [];
  return [
    ...checkComponentName(p),
    ...checkModuleName(p),
    ...checkFnsDumpFile(p),
    ...checkKindFolders(p),
    ...checkIndexFile(p),
    ...checkFrozenUi(p),
    ...checkTestColocation(p),
  ].sort((left, right) => left.rule - right.rule);
}

/** @type {(results: {path: string, findings: Finding[]}[]) => string} */
export function formatFindings(results) {
  const lines = [];
  for (const { path, findings } of results) {
    if (!findings.length) continue;
    lines.push(path);
    for (const f of findings) {
      lines.push(`  rule ${f.rule} (${f.verdict}) — ${f.title}`);
      lines.push(`    ${f.detail}`);
      if (f.correctPath) lines.push(`    correct path: web/${f.correctPath}`);
      lines.push(`    rule file: ${f.ruleFile}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const paths = args.filter((arg) => !arg.startsWith("--"));
  if (!paths.length) {
    console.error(
      "usage: node scripts/structure/check-path.mjs [--json] <path...>",
    );
    process.exit(2);
  }
  const results = paths.map((path) => ({ path, findings: checkPath(path) }));
  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const report = formatFindings(results);
    console.log(
      report ||
        `no placement problem in ${paths.length} path${paths.length === 1 ? "" : "s"}`,
    );
  }
  const denied = results.some(({ findings }) =>
    findings.some((f) => f.verdict === "deny"),
  );
  process.exit(denied ? 1 : 0);
}
