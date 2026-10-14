import assert from "node:assert/strict";
import test from "node:test";
import domainModule from "./domains.cjs";
import {
  rule5,
  rule6,
  rule8,
  rule9,
  rule10,
  rule12,
  rule13,
  rule19,
  rule20,
  pageOwnedFeatureSlug,
  thinPages,
} from "./detectors.mjs";
import { parseRuleId, RULE_IDS } from "./rules.mjs";

const domains = domainModule.createDomainIndex({
  domains: [
    { path: "src/scores" },
    { path: "src/scores/configs" },
    { path: "src/tracing/traces" },
    { path: "src/app/search" },
    { path: "src/app/search/filters" },
  ],
  sharedRoots: ["src/app/hooks", "src/app/components"],
  moves: [{ from: "src/features/traces", to: "src/tracing/traces" }],
});
/** @param {string} source @param {string[]} targets @returns {import("./detectors.mjs").Module} */
const graphModule = (source, targets = []) => ({
  source,
  dependents: [],
  dependencies: targets.map((resolved) => ({
    resolved,
    dependencyTypes: ["import"],
  })),
});

test("declared capabilities use the longest root, without prefix collisions", () => {
  assert.equal(
    domains.featureRoot("src/scores/configs/components/Editor.tsx"),
    "src/scores/configs/",
  );
  assert.equal(
    domains.featureRoot("src/scores/components/Score.tsx"),
    "src/scores/",
  );
  assert.equal(
    domains.featureRoot("src/scores/configs-more.ts"),
    "src/scores/",
  );
  assert.equal(domains.featureRoot("src/scores-other/Foo.tsx"), null);
  assert.equal(
    domains.featureRoot("src/features/legacy/Foo.tsx"),
    "src/features/legacy/",
  );
});

test("framework routes and undeclared shared folders do not become boundaries", () => {
  for (const path of [
    "src/pages/project/scores.tsx",
    "pages/project/scores.tsx",
    "app/api/watch/route.ts",
    "src/app/api/watch/route.ts",
    "src/app/hooks/useFoo.ts",
    "src/components/ui/button.tsx",
  ])
    assert.equal(domains.featureRoot(path), null, path);
  assert.equal(
    domains.featureRoot("src/app/search/index.ts"),
    "src/app/search/",
  );
});

test("private imports across nested and sibling capabilities require public surfaces", () => {
  const graph = [
    graphModule("src/scores/Score.tsx", [
      "src/scores/helpers.ts",
      "src/scores/configs/private.ts",
      "src/scores/configs/index.ts",
      "src/scores/configs/server/index.ts",
      "src/tracing/traces/private.ts",
      "src/tracing/traces/index.ts",
    ]),
  ];
  const violations = rule8(graph, domains);
  assert.equal(violations.length, 2);
  assert.deepEqual(
    violations.map(({ paths }) => paths[1]),
    ["src/scores/configs/private.ts", "src/tracing/traces/private.ts"],
  );
});

test("nested capability roots and their kind folders remain valid", () => {
  assert.deepEqual(
    rule5(
      [
        "src/scores",
        "src/scores/components",
        "src/scores/configs",
        "src/scores/configs/components",
        "src/app/search",
        "src/app/search/filters",
        "src/app/search/filters/fns",
      ],
      domains,
    ),
    [],
  );
  assert.equal(rule5(["src/scores/helpers"], domains).length, 1);
});

test("root and server barrels are checked while private barrel files remain findings", () => {
  const files = [
    "src/scores/index.ts",
    "src/scores/configs/index.ts",
    "src/scores/configs/server/index.ts",
    "src/scores/components/index.ts",
    "src/app/hooks/index.ts",
    "src/scores/server/private/index.ts",
  ];
  const violations = rule9(files, () => [], domains);
  assert.deepEqual(
    violations.map(({ paths }) => paths[0]),
    ["src/scores/components/index.ts", "src/app/hooks/index.ts"],
  );
  assert.equal(
    rule9(["src/scores/index.ts"], () => [{ name: "*", kind: "star" }], domains)
      .length,
    1,
  );
});

test("pages recognize moved public page surfaces but flag private components", () => {
  assert.equal(
    rule12(
      [
        graphModule("src/pages/project/scores.tsx", [
          "src/scores/ScoresPage.tsx",
          "src/scores/configs/index.ts",
          "src/scores/private.ts",
        ]),
      ],
      domains,
    ).length,
    1,
  );
});

test("shared ownership follows relocated shared roots and declared destinations", () => {
  const shared = graphModule("src/app/hooks/useScores.ts");
  shared.dependents = ["src/scores/ScoresPage.tsx"];
  const findings = rule6([shared, graphModule(shared.dependents[0])], domains);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].paths[1], "src/scores/");
  assert.equal(domains.destinationForRoute("traces"), "src/tracing/traces");
});

test("test fixtures retain domain isolation while global fixtures remain shareable", () => {
  const graph = [
    graphModule("src/scores/example.clienttest.ts", [
      "src/__tests__/fixture.ts",
      "src/scores/configs/__tests__/fixture.ts",
      "src/scores/__tests__/fixture.ts",
    ]),
  ];
  assert.equal(rule19(graph, [], domains).length, 1);
});

test("root Next route handlers are server contexts and app shell modules are not entries", () => {
  assert.deepEqual(
    rule10([
      graphModule("app/api/watch/route.ts", ["src/scores/server/helper.ts"]),
    ]),
    [],
  );
  assert.equal(
    rule10([
      graphModule("src/app/search/Search.tsx", ["src/scores/server/helper.ts"]),
    ]).length,
    1,
  );
  assert.equal(
    rule20([
      graphModule("app/api/watch/route.ts"),
      graphModule("src/app/search/orphan.ts"),
    ]).length,
    1,
  );
});

test("frozen legacy primitives retain their findings after relocation", () => {
  const primitive = "src/app/design-system/legacy-primitives/button.tsx";
  assert.deepEqual(
    rule13([
      primitive,
      "src/app/design-system/legacy-primitives/button.clienttest.tsx",
      "src/app/design-system/Button/Button.tsx",
      "src/app/design-system/animation-primitives/rainbow-button.tsx",
    ]).map(({ key }) => key),
    [primitive],
  );
});

test("relocated worker entrypoints do not hide unrelated orphan modules", () => {
  const orphan = "src/app/search/orphan.ts";
  assert.deepEqual(
    rule20([
      graphModule("src/app/workers/json-parser.worker.ts"),
      graphModule("src/workers/legacy.worker.ts"),
      graphModule(orphan),
    ]).map(({ key }) => key),
    [orphan],
  );
});

test("numeric selectors and readable IDs identify the same rules", () => {
  for (const [id, slug] of Object.entries(RULE_IDS)) {
    assert.equal(parseRuleId(id), Number(id));
    assert.equal(parseRuleId(slug), Number(id));
  }
  for (const invalid of [
    "8.5",
    "rule-8",
    "no-deep-imports",
    "",
    "21",
    undefined,
  ])
    assert.equal(parseRuleId(invalid), null);
});

test("cruiser ownership excludes child roots while retaining similar sibling names", () => {
  const own = new RegExp(domains.descendantPattern("src/scores"));
  assert.equal(own.test("src/scores/configs/private.ts"), false);
  assert.equal(own.test("src/scores/configs-more/private.ts"), true);
  assert.equal(own.test("src/scores/components/Score.tsx"), true);
});

test("root Pages routes retain page ownership, thin-route checks and server contexts", () => {
  assert.equal(
    pageOwnedFeatureSlug("pages/project/[projectId]/sessions/[id].tsx"),
    "sessions",
  );
  assert.equal(
    rule12(
      [
        graphModule("pages/project/scores.tsx", [
          "src/scores/ScoresPage.tsx",
          "src/scores/private.ts",
        ]),
      ],
      domains,
    ).length,
    1,
  );
  assert.deepEqual(
    rule10([
      graphModule("pages/api/scores.ts", ["src/scores/server/helper.ts"]),
    ]),
    [],
  );
  assert.deepEqual(
    thinPages(
      ["pages/index.tsx", "pages/api/example.ts"],
      () => "export default Page;",
    ),
    { thin: 1, total: 1 },
  );
});
