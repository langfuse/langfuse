/**
 * Bundle the JSON-parser Web Worker into a string module.
 *
 * The client starts the worker from a blob built out of that string, so the
 * worker has no URL at all: it cannot 404 after a deploy, and worker and main
 * thread always come from the same build. See `jsonParserWorkerClient.ts`.
 *
 * The output is committed. `json-parser.worker.servertest.ts` re-runs this
 * script and fails when the committed file no longer matches, so the two can
 * never drift.
 *
 *   pnpm --filter web run build:json-parser-worker
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import prettier from "prettier";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const WORKER_ENTRY = "src/workers/json-parser.worker.ts";
export const GENERATED_FILE = path.join(
  webDir,
  "src/workers/generated/json-parser.worker.source.ts",
);

/**
 * Bundle the worker and return the module text to write.
 *
 * `@langfuse/shared/src/utils/json` is aliased to shared's TypeScript source:
 * the published entry point resolves to `dist`, whose emitted imports drag the
 * rest of shared (and zod) into a bundle that only needs one function.
 */
export async function buildWorkerSourceModule() {
  const result = await build({
    absWorkingDir: webDir,
    entryPoints: [WORKER_ENTRY],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    tsconfig: "tsconfig.json",
    minify: true,
    legalComments: "none",
    write: false,
    alias: {
      "@langfuse/shared/src/utils/json": path.join(
        webDir,
        "../packages/shared/src/utils/json.ts",
      ),
    },
  });

  const [output] = result.outputFiles;
  if (!output) throw new Error("esbuild produced no output for the worker");

  const bundled = output.text;

  // A bundle that still references these never runs in a Worker; catching it
  // here beats catching it as a runtime error in a user's browser.
  for (const forbidden of ["importScripts(", "require(", "process.env"]) {
    if (bundled.includes(forbidden)) {
      throw new Error(
        `JSON-parser worker bundle contains \`${forbidden}\` — it must be self-contained`,
      );
    }
  }

  const moduleText = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Bundled from ${WORKER_ENTRY} by scripts/build-json-parser-worker.mjs.
 * Regenerate with: pnpm --filter web run build:json-parser-worker
 */

export const JSON_PARSER_WORKER_SOURCE = ${JSON.stringify(bundled)};
`;

  return prettier.format(moduleText, {
    ...((await prettier.resolveConfig(GENERATED_FILE)) ?? {}),
    filepath: GENERATED_FILE,
  });
}

/** True when the committed module is already what a fresh build produces. */
export async function isGeneratedFileCurrent() {
  const [fresh, committed] = await Promise.all([
    buildWorkerSourceModule(),
    readFile(GENERATED_FILE, "utf8").catch(() => null),
  ]);
  return { current: fresh === committed, fresh, committed };
}

// Only write when run as a script, so tests can import the builder.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const moduleText = await buildWorkerSourceModule();
  await writeFile(GENERATED_FILE, moduleText);
  console.log(
    `JSON-parser worker bundled into ${GENERATED_FILE} (${moduleText.length} B)`,
  );
}
