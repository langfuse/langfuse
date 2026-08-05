/**
 * Import rules from the langfuse-web project-structure RFC
 * (Linear: "langfuse web project code structure RFC", meta LFE-14748).
 *
 * All rules are warnings while the codebase migrates (RFC step 1: instrument
 * panel). The per-rule dashboard is `pnpm structure:stats`, which implements
 * the same rules exactly on the dependency graph; the regex versions here are
 * the CI-enforceable approximations and may slightly undercount (noted per
 * rule). Rule numbers refer to the RFC's Rules section.
 */

/** rules 7, 9: a component's public entry — components/Foo/Foo.tsx (index
 * files are tolerated here so rule 9 flags them exactly once) */
const COMPONENT_ENTRY = "(^|/)([A-Z][A-Za-z0-9]*)/(\\2|index)\\.(ts|tsx)$";
const TEST_FILES =
  "(^|/)(__tests__|__e2e__|__mocks__)/|\\.(clienttest|servertest|test|spec|stories)\\.[jt]sx?$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "rfc11-no-runtime-cycles",
      comment:
        "Rule 11: no import cycles. Cycles broken by a type-only edge are " +
        "excluded — they are not a runtime hazard (tracked in structure:stats).",
      severity: "warn",
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ["type-only"] } },
    },
    {
      name: "rfc08-features-via-index",
      comment:
        "Rule 8: features import other features only through their index.ts.",
      severity: "warn",
      from: { path: "^(src/(?:ee/)?features/[^/]+)/" },
      to: {
        path: "^src/(?:ee/)?features/[^/]+/",
        pathNot: ["^$1/", "^src/(?:ee/)?features/[^/]+/index\\.tsx?$"],
      },
    },
    {
      name: "rfc10-no-client-to-server",
      comment:
        "Rule 10: client code does not import from server/ — `import type` " +
        "is the exception. Server contexts and tests are out of scope.",
      severity: "warn",
      from: {
        pathNot: [
          "(^|/)server/",
          "^src/pages/api/",
          "^src/instrumentation",
          TEST_FILES,
        ],
      },
      to: { path: "(^|/)server/", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "rfc07-no-component-internals",
      comment:
        "Rule 7: no importing another component's internals — cross a " +
        "component folder (a PascalCase dir) only via its root file. This " +
        "regex approximation allows everything inside the importer's own " +
        "outermost component subtree; structure:stats checks all levels.",
      severity: "warn",
      from: { path: "^(.*?/[A-Z][A-Za-z0-9]*)/" },
      to: {
        path: "(^|/)[A-Z][A-Za-z0-9]*/.",
        pathNot: ["^$1/", COMPONENT_ENTRY],
      },
    },
    {
      name: "rfc07-no-component-internals-from-outside",
      comment:
        "Rule 7, importer outside any component folder: internals of any " +
        "component are off limits; use its root file.",
      severity: "warn",
      from: { pathNot: "(^|/)[A-Z][A-Za-z0-9]*/" },
      to: {
        path: "(^|/)[A-Z][A-Za-z0-9]*/.",
        pathNot: [COMPONENT_ENTRY],
      },
    },
    {
      name: "rfc12-pages-import-page-components",
      comment:
        "Rule 12: a src/pages file is a thin shim — it imports a feature's " +
        "Page component (or the feature index) and exports route config. " +
        "_app/_document/_error and pages/api are out of scope.",
      severity: "warn",
      from: {
        path: "^src/pages/",
        pathNot: ["^src/pages/api/", "^src/pages/_"],
      },
      to: {
        path: "^src",
        pathNot: [
          "^src/(?:ee/)?features/[^/]+/(index\\.tsx?|[A-Z][A-Za-z0-9]*Page\\.tsx)$",
        ],
      },
    },
    {
      name: "rfc19-tests-only-from-tests",
      comment:
        "Rule 19: only tests and __tests__ modules import from __tests__.",
      severity: "warn",
      from: { pathNot: [TEST_FILES] },
      to: { path: "(^|/)__tests__/" },
    },
    {
      name: "rfc19-no-cross-feature-tests",
      comment:
        "Rule 19: one feature's tests don't reach another feature's __tests__.",
      severity: "warn",
      from: { path: "^(src/(?:ee/)?features/[^/]+)/" },
      to: {
        path: "^src/(?:ee/)?features/[^/]+/(.+/)?__tests__/",
        pathNot: ["^$1/"],
      },
    },
    {
      name: "rfc19-global-tests-never-import-feature-tests",
      comment:
        "Rule 19: a feature's __tests__ can use the global one, never the reverse.",
      severity: "warn",
      from: { path: "^src/__tests__/" },
      to: { path: "^src/(?:ee/)?features/.*__tests__/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: "^src",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
