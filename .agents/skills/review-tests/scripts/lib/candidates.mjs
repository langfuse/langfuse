// Resolves a test's imports to production modules, extracts the production
// *functions* the test body calls, and indexes those symbols by how many test
// files call them.
//
// The unit is the production function a test calls, not the file it imports.
// Every worker test imports `@langfuse/shared/src/server`, so file overlap says
// nothing; two tests that both call `getGenerationsForAnalyticsIntegrations(`
// very likely fail together. A symbol's breadth — how many test files call it —
// tells a helper every test calls (`createOrgProjectAndApiKey`) apart from the
// one function a test actually targets.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { maskCode } from "./scan-tests.mjs";

export const TEST_FILE_RE = /\.(test|servertest|clienttest)\.(ts|tsx)$/;
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];
const INDEX_EXTENSIONS = ["/index.ts", "/index.tsx", "/index.js"];

const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const WORKSPACE_PACKAGES = [
  { name: "@langfuse/shared", dir: "packages/shared" },
  { name: "@langfuse/ee", dir: "ee" },
];
const DIST = "./dist/";

/**
 * Maps each `exports` subpath of a workspace package to the extensionless
 * source file its `dist` target is built from.
 * @param {string} dir repo-relative package directory
 * @param {object} exports the package.json `exports` field
 * @returns {Map<string, string>} subpath (`.`, `./query`) → source base path
 */
export function sourceExports(dir, exports) {
  const out = new Map();
  for (const [subpath, value] of Object.entries(exports ?? {})) {
    const target =
      typeof value === "string" ? value : (value?.import ?? value?.require);
    if (typeof target !== "string" || !target.startsWith(DIST)) continue;
    out.set(
      subpath,
      `${dir}/${target.slice(DIST.length).replace(/\.js$/, "")}`,
    );
  }
  return out;
}

function loadWorkspacePackages() {
  return WORKSPACE_PACKAGES.map(({ name, dir }) => {
    let exports = {};
    try {
      const manifest = join(REPO_ROOT, dir, "package.json");
      exports = JSON.parse(readFileSync(manifest, "utf8")).exports;
    } catch {
      /* unreadable manifest: only `src/` deep imports resolve */
    }
    return { name, dir, exports: sourceExports(dir, exports) };
  });
}

const PACKAGES = loadWorkspacePackages();

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
 * @param {Array<{name: string, dir: string, exports: Map<string, string>}>} [packages]
 *   workspace packages, resolved through their `exports`
 * @returns {string|null} null for node/third-party modules and unresolvable paths
 */
export function resolveImport(spec, fromFile, exists, packages = PACKAGES) {
  let base = null;

  if (spec.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1).join("/");
    base = normalize(`${dir}/${spec}`);
  } else if (spec.startsWith("@/")) {
    base = normalize(`${packageRootOf(fromFile)}/${spec.slice(2)}`);
  } else {
    const pkg = packages.find(
      (p) => spec === p.name || spec.startsWith(`${p.name}/`),
    );
    if (!pkg) return null;
    // A deep `src/` path not listed in `exports` maps straight to source.
    const subpath = `.${spec.slice(pkg.name.length)}`;
    base =
      pkg.exports.get(subpath) ??
      (subpath.startsWith("./src/") ? `${pkg.dir}/${subpath.slice(2)}` : null);
    if (!base) return null;
    base = normalize(base);
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

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Production symbols a test body calls, qualified by the module that provides
 * them: `packages/shared/src/server/index.ts#createTrace`. A namespace import's
 * members and an object binding's methods (`prisma.trace.findMany(`) qualify
 * as `module#binding.member`. JSX usage counts as a call, so client tests
 * rendering a component share a symbol with every other test of it.
 *
 * @param {string} source one test's source
 * @param {Array<{local: string, imported: string, spec: string}>} bindings
 * @param {string} file the test file, for import resolution
 * @param {(path: string) => boolean} exists
 * @returns {string[]}
 */
export function callSymbols(source, bindings, file, exists) {
  const isCode = maskCode(source);
  const atCode = (re) => {
    const found = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) if (isCode[m.index]) found.push(m);
    return found;
  };

  const out = new Set();
  for (const b of bindings) {
    const module = resolveImport(b.spec, file, exists);
    if (!module || TEST_FILE_RE.test(module)) continue;
    const local = escapeRe(b.local);
    const name = b.imported === "*" ? null : b.imported;

    if (name && atCode(new RegExp(`(?<![\\w$.])${local}\\s*\\(`, "g")).length) {
      out.add(`${module}#${name}`);
    }
    if (name && atCode(new RegExp(`<${local}(?![\\w$])`, "g")).length) {
      out.add(`${module}#${name}`);
    }
    const members = atCode(
      new RegExp(`(?<![\\w$.])${local}\\.([\\w$]+(?:\\.[\\w$]+)*)\\s*\\(`, "g"),
    );
    for (const m of members) {
      out.add(name ? `${module}#${name}.${m[1]}` : `${module}#${m[1]}`);
    }
  }
  return [...out].sort();
}

/**
 * Inverts per-test symbol lists into symbol → set of test files, so a symbol's
 * breadth of use is known.
 * @param {Map<string, {file: string, symbols: string[]}>} byTestId
 */
export function buildSymbolIndex(byTestId) {
  const index = new Map();
  for (const { file, symbols } of byTestId.values()) {
    for (const sym of symbols) {
      if (!index.has(sym)) index.set(sym, new Set());
      index.get(sym).add(file);
    }
  }
  return index;
}

/** A symbol called from many test files is weak evidence of redundancy. */
export function symbolWeight(index, sym) {
  const breadth = index.get(sym)?.size ?? 1;
  return 1 / Math.log2(breadth + 1);
}
