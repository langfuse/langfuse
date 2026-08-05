// Rule detectors for the project-structure RFC (see .dependency-cruiser.js
// header for the RFC link). Pure functions: (graph, census) -> violations.
//
// Each violation is { key, paths } where `key` is a stable string used for
// baseline diffing and `paths` are the repo paths it involves (for --scope).

/** @typedef {{ name: string, dependencyTypes: string[] }} CycleStep */
/** @typedef {{ resolved: string, dependencyTypes: string[], circular?: boolean, cycle?: CycleStep[] }} Dep */
/** @typedef {{ source: string, dependencies: Dep[], dependents: string[] }} Module */
/** @typedef {{ key: string, paths: string[] }} Violation */
/** @typedef {{ name: string, kind: "type" | "value" | "reexport" | "star" }} ExportEntry */
/** @typedef {(p: string) => ExportEntry[]} ExportsOf */
/** @typedef {(p: string) => string} ContentOf */

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const KIND_DIRS = new Set([
  "components",
  "hooks",
  "contexts",
  "stores",
  "fns",
  "server",
]);

/** @type {(p: string) => boolean} */
export const isTestish = (p) =>
  /(^|\/)(__tests__|__e2e__|__mocks__)\//.test(p) ||
  /\.(clienttest|servertest|test|spec|stories)\.[jt]sx?$/.test(p);

/** @type {(p: string) => string | null} */
const featureRoot = (p) => {
  const m = p.match(/^src\/(?:ee\/)?features\/[^/]+\//);
  return m ? m[0] : null;
};

/** @type {(p: string) => string} */
const base = (p) => p.slice(p.lastIndexOf("/") + 1);
/** @type {(p: string) => string} */
const stem = (p) => base(p).replace(/\.[jt]sx?$/, "");

/** @type {(key: string, ...paths: string[]) => Violation} */
const v = (key, ...paths) => ({ key, paths });

// ---------------------------------------------------------------------------
// Import-side rules (dependency graph)
// ---------------------------------------------------------------------------

// Rule 7 — no importing another component's internals.
// A component boundary is any PascalCase directory. Crossing a boundary is
// only allowed through the component's root entry (<Name>.tsx/.ts, or an
// index file — flagged separately by rule 9). Walk boundaries deepest-first;
// a root-entry hit defers the decision to the parent boundary.
/** @param {Module[]} modules @returns {Violation[]} */
export function rule7(modules) {
  /** @type {(p: string) => { dir: string, name: string }[]} */
  const boundaries = (p) => {
    const out = [];
    // lookahead keeps the trailing slash unconsumed so directly-nested
    // PascalCase dirs (Foo/Bar/...) each register a boundary
    const re = /\/([A-Z][A-Za-z0-9]*)(?=\/)/g;
    let m;
    while ((m = re.exec(p)))
      out.push({ dir: p.slice(0, m.index + m[0].length + 1), name: m[1] });
    return out.reverse(); // deepest first
  };
  const out = [];
  for (const mod of modules) {
    for (const dep of mod.dependencies) {
      const to = dep.resolved;
      for (const b of boundaries(to)) {
        const isEntry =
          to === `${b.dir}${b.name}.tsx` ||
          to === `${b.dir}${b.name}.ts` ||
          to === `${b.dir}index.tsx` ||
          to === `${b.dir}index.ts`;
        if (isEntry) continue; // public entry: check the parent boundary instead
        if (!mod.source.startsWith(b.dir))
          out.push(v(`${mod.source} -> ${to}`, mod.source, to));
        break;
      }
    }
  }
  return out;
}

// Rule 8 — features import other features only through their index.ts.
/** @param {Module[]} modules @returns {Violation[]} */
export function rule8(modules) {
  const out = [];
  for (const mod of modules) {
    const from = featureRoot(mod.source);
    if (!from) continue;
    for (const dep of mod.dependencies) {
      const to = featureRoot(dep.resolved);
      if (!to || to === from) continue;
      if (dep.resolved === `${to}index.ts` || dep.resolved === `${to}index.tsx`)
        continue;
      out.push(v(`${mod.source} -> ${dep.resolved}`, mod.source, dep.resolved));
    }
  }
  return out;
}

// Rule 10 — client code does not import from server/; `import type` excepted.
/** @param {Module[]} modules @returns {Violation[]} */
export function rule10(modules) {
  /** @type {(p: string) => boolean} */
  const serverish = (p) =>
    /(^|\/)server\//.test(p) ||
    /^src\/(pages|app)\/api\//.test(p) ||
    /(^|\/)scripts\//.test(p) || // CLI entrypoints run server-side
    /^src\/instrumentation/.test(p);
  const out = [];
  for (const mod of modules) {
    if (serverish(mod.source) || isTestish(mod.source)) continue;
    for (const dep of mod.dependencies) {
      if (!/(^|\/)server\//.test(dep.resolved)) continue;
      if (dep.dependencyTypes.includes("type-only")) continue;
      out.push(v(`${mod.source} -> ${dep.resolved}`, mod.source, dep.resolved));
    }
  }
  return out;
}

// Rule 11 — no import cycles. A cycle broken by a type-only edge is not a
// runtime hazard; those are reported as a survey metric instead.
/** @param {Module[]} modules @returns {{ runtime: Violation[], typeOnly: Violation[] }} */
export function rule11(modules) {
  /** @type {Map<string, Violation>} */
  const runtime = new Map();
  /** @type {Map<string, Violation>} */
  const typeOnly = new Map();
  for (const mod of modules) {
    for (const dep of mod.dependencies) {
      if (!dep.circular || !dep.cycle) continue;
      const names = dep.cycle.map((c) => c.name);
      const key = [...names].sort().join(" | ");
      const isRuntime = dep.cycle.every(
        (c) => !c.dependencyTypes.includes("type-only"),
      );
      const bucket = isRuntime ? runtime : typeOnly;
      if (!bucket.has(key))
        bucket.set(key, v(`cycle: ${names.join(" -> ")}`, ...names));
    }
  }
  return { runtime: [...runtime.values()], typeOnly: [...typeOnly.values()] };
}

// Rule 12 — a src/pages file only imports a Page component (or a feature
// index) and exports route config. _app/_document/_error and pages/api are
// out of scope.
/** @param {Module[]} modules @returns {Violation[]} */
export function rule12(modules) {
  const out = [];
  for (const mod of modules) {
    if (!/^src\/pages\//.test(mod.source)) continue;
    if (/^src\/pages\/(api\/|_)/.test(mod.source)) continue;
    for (const dep of mod.dependencies) {
      const ok =
        /^src\/(?:ee\/)?features\/[^/]+\/(index\.tsx?|[A-Z][A-Za-z0-9]*Page\.tsx)$/.test(
          dep.resolved,
        );
      if (!ok)
        out.push(
          v(`${mod.source} -> ${dep.resolved}`, mod.source, dep.resolved),
        );
    }
  }
  return out;
}

// Rule 19 — only tests (and other __tests__ modules) import from __tests__;
// a feature's tests never reach another feature's __tests__; the global
// __tests__ never imports a feature's.
/** @param {Module[]} modules @param {string[]} files @returns {Violation[]} */
export function rule19(modules, files) {
  const out = [];
  for (const mod of modules) {
    for (const dep of mod.dependencies) {
      if (!/(^|\/)__tests__\//.test(dep.resolved)) continue;
      if (!isTestish(mod.source))
        out.push(
          v(`${mod.source} -> ${dep.resolved}`, mod.source, dep.resolved),
        );
      const from = featureRoot(mod.source);
      const to = featureRoot(dep.resolved);
      if (to && from && to !== from)
        out.push(
          v(
            `cross-feature: ${mod.source} -> ${dep.resolved}`,
            mod.source,
            dep.resolved,
          ),
        );
      if (to && mod.source.startsWith("src/__tests__/"))
        out.push(
          v(
            `global->feature: ${mod.source} -> ${dep.resolved}`,
            mod.source,
            dep.resolved,
          ),
        );
    }
  }
  // placement: fixtures/mocks are test support and belong in __tests__
  for (const f of files) {
    if (
      /\.(fixtures?|mocks?)\.[jt]sx?$/.test(base(f)) &&
      !/(^|\/)__tests__\//.test(f)
    )
      out.push(v(`fixture outside __tests__: ${f}`, f));
  }
  return out;
}

// Rule 20 — no unused exports. File-level proxy: modules nothing imports.
// (Symbol-level needs a knip config — follow-up.)
/** @param {Module[]} modules @returns {Violation[]} */
export function rule20(modules) {
  /** @type {(p: string) => boolean} */
  const entry = (p) =>
    /^src\/(pages|app)\//.test(p) || // Next.js routing entries
    /^src\/(middleware|instrumentation|env)/.test(p) ||
    /^src\/workers\//.test(p) || // loaded via `new Worker(url)` — invisible to the graph
    /(^|\/)scripts\//.test(p) || // package.json script entrypoints
    /\.d\.ts$/.test(p);
  return modules
    .filter(
      (m) =>
        m.dependents.length === 0 && !entry(m.source) && !isTestish(m.source),
    )
    .map((m) => v(m.source, m.source));
}

// Rule 6 — a file used by one feature lives in that feature. Resolves shared
// folder files' dependents transitively through other shared files to the
// ultimate consuming features (same method as the pre-RFC survey).
/** @param {Module[]} modules @returns {Violation[]} */
export function rule6(modules) {
  const SHARED =
    /^src\/(components|hooks|utils|constants|contexts|stores|fns|lib)\//;
  const bySource = new Map(modules.map((m) => [m.source, m]));
  /** @type {(p: string) => string | null} */
  const home = (p) => {
    if (featureRoot(p)) return featureRoot(p);
    if (p.startsWith("src/pages/")) return "pages";
    if (SHARED.test(p)) return null; // resolve transitively
    return "other";
  };
  // no memoization: a cycle back-edge truncates the traversal, and caching
  // such a partial result would misclassify shared files order-dependently
  /** @type {(p: string, stack?: Set<string>) => Set<string>} */
  const eff = (p, stack = new Set()) => {
    if (stack.has(p)) return new Set();
    stack.add(p);
    const homes = new Set();
    for (const d of bySource.get(p)?.dependents ?? []) {
      if (isTestish(d)) continue;
      const h = home(d);
      if (h === null) for (const hh of eff(d, stack)) homes.add(hh);
      else homes.add(h);
    }
    stack.delete(p);
    return homes;
  };
  const out = [];
  for (const m of modules) {
    if (!SHARED.test(m.source) || isTestish(m.source)) continue;
    const homes = [...eff(m.source)];
    const feats = homes.filter((h) => h !== "pages" && h !== "other");
    const rest = homes.filter((h) => h === "other");
    if (feats.length === 1 && rest.length === 0)
      out.push(
        v(`${m.source} -> only used by ${feats[0]}`, m.source, feats[0]),
      );
  }
  return out;
}

// Survey metric — mutually importing feature pairs (the untangling worklist).
/** @param {Module[]} modules @returns {string[]} */
export function mutualFeaturePairs(modules) {
  /** @type {Set<string>} */
  const edges = new Set();
  for (const mod of modules) {
    const from = featureRoot(mod.source);
    if (!from) continue;
    for (const dep of mod.dependencies) {
      const to = featureRoot(dep.resolved);
      if (to && to !== from) edges.add(`${from}>${to}`);
    }
  }
  const pairs = new Set();
  for (const e of edges) {
    const [a, b] = e.split(">");
    if (edges.has(`${b}>${a}`)) pairs.add([a, b].sort().join(" <-> "));
  }
  return [...pairs].sort();
}

// Survey metric — deep imports into features from outside any feature
// (excluding the legitimate pages -> Page-component path).
/** @param {Module[]} modules @returns {Violation[]} */
export function outsideDeepImports(modules) {
  const out = [];
  for (const mod of modules) {
    if (featureRoot(mod.source)) continue;
    const isPage = /^src\/pages\//.test(mod.source);
    for (const dep of mod.dependencies) {
      const to = featureRoot(dep.resolved);
      if (!to) continue;
      if (dep.resolved === `${to}index.ts` || dep.resolved === `${to}index.tsx`)
        continue;
      if (isPage && /\/[A-Z][A-Za-z0-9]*Page\.tsx$/.test(dep.resolved))
        continue;
      out.push(v(`${mod.source} -> ${dep.resolved}`, mod.source, dep.resolved));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// File-side rules (census: file walk + TS export parse)
// ---------------------------------------------------------------------------

// Census scopes: the RFC is explicit for features; src/components legacy
// subtrees (ui, table, ...) are tracked by rules 6/13 and the survey instead.
const FEATURE_SCOPE = /^src\/(?:ee\/)?features\//;

/** @type {(p: string) => boolean} */
const isContextModule = (p) => /^[A-Z][A-Za-z0-9]*Context\.tsx?$/.test(base(p));
/** @type {(p: string) => boolean} */
const isHookFile = (p) => /^use[A-Z]/.test(stem(p));

// Rule 1 — one component per file, PascalCase filename matches the component.
/** @param {string[]} files @param {ExportsOf} exportsOf @returns {Violation[]} */
export function rule1(files, exportsOf) {
  const out = [];
  for (const f of files) {
    if (!f.endsWith(".tsx") || isTestish(f) || /^src\/pages\//.test(f))
      continue;
    if (isHookFile(f) || isContextModule(f)) continue; // rule 3 territory
    const ex = exportsOf(f);
    const comps = ex.filter((e) => e.kind === "value" && PASCAL.test(e.name));
    if (comps.length === 0) continue; // not a component module
    const issues = [];
    if (!PASCAL.test(stem(f))) issues.push("filename not PascalCase");
    if (comps.length > 1)
      issues.push(
        `${comps.length} components: ${comps.map((e) => e.name).join(", ")}`,
      );
    else if (PASCAL.test(stem(f)) && comps[0].name !== stem(f))
      issues.push(`component ${comps[0].name} != filename`);
    if (issues.length) out.push(v(`${f}: ${issues.join("; ")}`, f));
  }
  return out;
}

// Rule 2 — a component file exports only the component and its types.
/** @param {string[]} files @param {ExportsOf} exportsOf @returns {Violation[]} */
export function rule2(files, exportsOf) {
  const out = [];
  for (const f of files) {
    if (!f.endsWith(".tsx") || isTestish(f) || /^src\/pages\//.test(f))
      continue;
    if (isHookFile(f) || isContextModule(f)) continue;
    const ex = exportsOf(f);
    const comps = ex.filter((e) => e.kind === "value" && PASCAL.test(e.name));
    if (comps.length === 0) continue;
    const extra = ex.filter(
      (e) =>
        e.kind === "value" && !PASCAL.test(e.name) && e.name !== "(default)",
    );
    if (extra.length)
      out.push(
        v(`${f}: extra exports: ${extra.map((e) => e.name).join(", ")}`, f),
      );
  }
  return out;
}

// Rule 3 — hooks, fns, stores, contexts: camelCase, file named after the
// export. Context modules get the canonical React pattern as one unit:
// FooContext.tsx may export FooContext, FooProvider and useFoo* hooks.
/** @param {string[]} files @param {ExportsOf} exportsOf @returns {Violation[]} */
export function rule3(files, exportsOf) {
  const out = [];
  for (const f of files) {
    if (isTestish(f)) continue;
    if (/(^|\/)server\//.test(f)) continue; // server/ internals: unspecified by the RFC
    const inKind = /(^|\/)(hooks|fns|stores|contexts)\//.test(f);
    if (!inKind && !isHookFile(f) && !isContextModule(f)) continue;
    if (/(^|\/)fns\/index\.[jt]s$/.test(f)) continue; // rule 4's dump-file finding
    const s = stem(f);
    if (isContextModule(f)) {
      const root = s.replace(/Context$/, "");
      const stray = exportsOf(f).filter(
        (e) =>
          e.kind === "value" &&
          e.name !== s &&
          e.name !== `${root}Provider` &&
          !e.name.startsWith(`use${root}`),
      );
      if (stray.length)
        out.push(
          v(
            `${f}: beyond the context pattern: ${stray.map((e) => e.name).join(", ")}`,
            f,
          ),
        );
      continue;
    }
    const issues = [];
    if (!CAMEL.test(s)) issues.push("filename not camelCase");
    else if (!exportsOf(f).some((e) => e.name === s))
      issues.push(`no export named ${s}`);
    if (issues.length) out.push(v(`${f}: ${issues.join("; ")}`, f));
  }
  return out;
}

// Rule 4 — one function per file in fns/; no dump files.
/** @param {string[]} files @param {ExportsOf} exportsOf @returns {Violation[]} */
export function rule4(files, exportsOf) {
  const out = [];
  for (const f of files) {
    if (isTestish(f) || !/(^|\/)fns\//.test(f)) continue;
    const values = exportsOf(f).filter((e) => e.kind === "value");
    const issues = [];
    if (
      /^(helpers?|utils?|index|misc|common|fns|types|constants)$/.test(stem(f))
    )
      issues.push("dump file");
    if (values.length > 1)
      issues.push(
        `${values.length} exports: ${values.map((e) => e.name).join(", ")}`,
      );
    if (issues.length) out.push(v(`${f}: ${issues.join("; ")}`, f));
  }
  return out;
}

// Rule 5 — kind folders are a closed list; component folders live under
// components/. server/ internals are unspecified by the RFC and skipped.
/** @param {string[]} dirs @returns {Violation[]} */
export function rule5(dirs) {
  const out = [];
  for (const d of dirs) {
    if (!FEATURE_SCOPE.test(d)) continue;
    if (/^src\/(?:ee\/)?features\/[^/]+$/.test(d)) continue; // the feature root itself
    if (/(^|\/)(server|__tests__)\//.test(d + "/")) {
      if (!/(^|\/)(server|__tests__)$/.test(d)) continue; // below server|__tests__: skip
    }
    const name = base(d);
    const parent = d.slice(0, -(name.length + 1));
    const parentName = base(parent);
    if (name === "__tests__") continue;
    if (KIND_DIRS.has(name)) {
      const featRootDir = /^src\/(?:ee\/)?features\/[^/]+$/.test(parent);
      if (!featRootDir && !PASCAL.test(parentName))
        out.push(
          v(
            `${d}: kind folder under '${parentName}/', not a feature root or component`,
            d,
          ),
        );
    } else if (PASCAL.test(name)) {
      if (parentName !== "components")
        out.push(v(`${d}: component folder outside components/`, d));
    } else {
      out.push(
        v(
          `${d}: '${name}' is not a kind folder (components|hooks|contexts|stores|fns|server)`,
          d,
        ),
      );
    }
  }
  return out;
}

// Rule 9 — index.ts only at feature roots; named re-exports only, no
// export *, no logic. src/pages (routing) and src/server are out of scope.
/** @param {string[]} files @param {ExportsOf} exportsOf @returns {Violation[]} */
export function rule9(files, exportsOf) {
  const out = [];
  const SCOPE =
    /^src\/(?:ee\/)?(features|components|hooks|contexts|stores|fns|utils|constants|lib)\//;
  for (const f of files) {
    if (!/(^|\/)index\.[jt]sx?$/.test(f) || !SCOPE.test(f)) continue;
    if (/(^|\/)server\//.test(f)) continue; // server/ internals: unspecified by the RFC
    if (/^src\/(?:ee\/)?features\/[^/]+\/index\.tsx?$/.test(f)) {
      const ex = exportsOf(f);
      if (ex.some((e) => e.kind === "star")) out.push(v(`${f}: export *`, f));
      if (ex.some((e) => e.kind === "value"))
        out.push(v(`${f}: has own declarations (logic)`, f));
    } else {
      out.push(v(`${f}: index file outside a feature root`, f));
    }
  }
  return out;
}

// Rule 13 — components/ui is frozen: nothing new goes in. Census of its
// files; the baseline ratchet flags additions.
/** @param {string[]} files @returns {Violation[]} */
export function rule13(files) {
  return files
    .filter((f) => /^src\/components\/ui\//.test(f) && !isTestish(f))
    .map((f) => v(f, f));
}

// Rule 16 — ESLint ignores at file level only. Line-level disables are the
// violations; file-level ones are counted as a survey metric.
/** @param {string[]} files @param {ContentOf} contentOf @returns {{ lineLevel: Violation[], fileLevel: string[] }} */
export function rule16(files, contentOf) {
  /** @type {Violation[]} */
  const out = [];
  /** @type {string[]} */
  const fileLevel = [];
  for (const f of files) {
    const lines = contentOf(f).split("\n");
    lines.forEach((line, i) => {
      const m = line.match(/eslint-disable(-next)?-line\s*([^*]*)/);
      if (m) out.push(v(`${f}:${i + 1}: ${m[2].trim() || "(all rules)"}`, f));
      else if (/^\/\*\s*eslint-disable/.test(line.trim())) fileLevel.push(f);
    });
  }
  return { lineLevel: out, fileLevel };
}

// Rule 18 — tests for fns and hooks are colocated flat next to their file.
// Facet-named tests (Subject.facet.clienttest.tsx) count as colocated when
// the base subject module sits next to them.
/** @param {string[]} files @returns {Violation[]} */
export function rule18(files) {
  const set = new Set(files);
  const out = [];
  for (const f of files) {
    const m = base(f).match(/^(.+)\.(clienttest|test|spec)\.(tsx?)$/);
    if (!m || /(^|\/)(__tests__|__e2e__|__mocks__)\//.test(f)) continue;
    const dir = f.slice(0, f.length - base(f).length);
    let subject = m[1];
    let found = false;
    while (subject) {
      if (set.has(`${dir}${subject}.ts`) || set.has(`${dir}${subject}.tsx`)) {
        found = true;
        break;
      }
      const dot = subject.lastIndexOf(".");
      subject = dot > 0 ? subject.slice(0, dot) : "";
    }
    if (!found) out.push(v(`${f}: no adjacent ${m[1]}.ts(x)`, f));
  }
  return out;
}

// Survey metric — kebab-case files (naming sweep, RFC step 7).
/** @param {string[]} files @returns {string[]} */
export function kebabFiles(files) {
  return files.filter(
    (f) =>
      !isTestish(f) &&
      stem(f)
        .replace(/\.[a-z]+$/, "")
        .includes("-"),
  );
}

// Survey metric — thin pages (<= 20 lines, per the RFC's ~20-line shim rule).
/** @param {string[]} files @param {ContentOf} contentOf @returns {{ thin: number, total: number }} */
export function thinPages(files, contentOf) {
  const pages = files.filter(
    (f) =>
      /^src\/pages\//.test(f) &&
      !/^src\/pages\/api\//.test(f) &&
      /\.[jt]sx?$/.test(f),
  );
  const thin = pages.filter(
    (f) => contentOf(f).trimEnd().split("\n").length <= 20,
  );
  return { thin: thin.length, total: pages.length };
}
