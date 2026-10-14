import assert from "node:assert/strict";
import test from "node:test";
import {
  relocatePath,
  rewriteReferences,
  rewriteStyleReferences,
} from "./relocate.mjs";

const moves = [
  { from: "src/features/scores", to: "src/scores" },
  { from: "src/features/score-configs", to: "src/scores/configuration" },
  { from: "src/app", to: "app" },
];

test("batch moves preserve nested targets, mocks and relative imports", () => {
  const host = {
    fileExists: () => true,
    readFile: () => "export {}",
    directoryExists: () => true,
  };
  const source =
    'import { f } from "../score-configs/f";\nvi.mock("@/src/features/scores/server/router");\nconst route = "/scores";';
  const actual = rewriteReferences(
    "src/features/scores/Score.tsx",
    source,
    moves,
    {},
    host,
  );
  assert.equal(
    actual,
    'import { f } from "./configuration/f";\nvi.mock("@/src/scores/server/router");\nconst route = "/scores";',
  );
});

test("a moved importer keeps references to unmoved support files", () => {
  const host = {
    fileExists: () => true,
    readFile: () => "export {}",
    directoryExists: () => true,
  };
  const actual = rewriteReferences(
    "src/features/scores/Score.stories.tsx",
    'import "../../../.storybook/preview";',
    moves,
    {},
    host,
  );
  assert.equal(actual, 'import "../../.storybook/preview";');
  assert.equal(
    relocatePath("src/features/scores-other/index.ts", moves),
    "src/features/scores-other/index.ts",
  );
  assert.equal(
    relocatePath("src/app/api/watch/route.ts", moves),
    "app/api/watch/route.ts",
  );
});

test("dot-prefixed domain data is not a relative file path", () => {
  const host = {
    fileExists: () => true,
    readFile: () => "export {}",
    directoryExists: () => true,
  };
  const source =
    'const separator = "."; const completion = ".input"; const parent = "..";';
  assert.equal(
    rewriteReferences("src/features/scores/Score.tsx", source, moves, {}, host),
    source,
  );
});

test("relative browser URLs and string predicates preserve their values", () => {
  const host = {
    fileExists: () => true,
    readFile: () => "export {}",
    directoryExists: () => true,
  };
  const source =
    'const accepted = url.startsWith("../"); const urls = ["../relative/path"]; const mcp = "../api/public/mcp";';
  assert.equal(
    rewriteReferences("src/features/scores/Score.tsx", source, moves, {}, host),
    source,
  );
});

test("CSS references and Tailwind scan roots follow stylesheet moves", () => {
  const styleMoves = [{ from: "src/styles", to: "src/app/styles" }];
  const css =
    '@import "tailwindcss" source("..");\n@source "../../node_modules/example";';
  assert.equal(
    rewriteStyleReferences("src/styles/globals.css", css, styleMoves),
    '@import "tailwindcss" source("../..");\n@source "../../../node_modules/example";',
  );
});

test("individual file moves preserve extensionless relative and alias targets", () => {
  const fileMoves = [
    { from: "src/helpers/format.ts", to: "src/formatting/format.ts" },
    { from: "src/helpers/index.ts", to: "src/formatting/index.ts" },
  ];
  const host = {
    /** @param {string} path */
    fileExists: (path) =>
      path.endsWith("/src/helpers/format.ts") ||
      path.endsWith("/src/helpers/index.ts"),
    readFile: () => "export {}",
    directoryExists: () => true,
  };
  const webRoot = new URL("../../", import.meta.url).pathname;
  const options = { baseUrl: webRoot, paths: { "@/*": ["./*"] } };
  const source =
    'import { f } from "./helpers/format";\nexport { f } from "@/src/helpers/format";\nvi.mock("@/src/helpers");\nconst data = "./helpers/format";';
  assert.equal(
    rewriteReferences("src/consumer.ts", source, fileMoves, options, host),
    'import { f } from "./formatting/format";\nexport { f } from "@/src/formatting/format";\nvi.mock("@/src/formatting");\nconst data = "./helpers/format";',
  );
  assert.equal(
    rewriteReferences(
      "src/consumer.ts",
      'import { f } from "./helpers/format.js";',
      fileMoves,
      options,
      host,
    ),
    'import { f } from "./formatting/format.js";',
  );
});
