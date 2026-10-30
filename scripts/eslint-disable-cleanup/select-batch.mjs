import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import {
  branchNameForBatch,
  buildAllowedTools,
  isScannablePath,
  parseDirectives,
  parseOpenBatchMetadata,
  selectBatch,
} from "./lib.mjs";

const unresolvedPath =
  process.argv[2] ?? ".agents/skills/eslint-disable-cleanup/references/unresolved.json";
const openPullRequestsPath = process.env.ESLINT_DISABLE_OPEN_PRS ?? "";

const tracked = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (tracked.status !== 0) {
  console.error(tracked.stderr || "git ls-files failed");
  process.exit(tracked.status ?? 1);
}

const files = tracked.stdout.split("\0").filter((file) => isScannablePath(file));
const directives = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  directives.push(...parseDirectives(source, file));
}

const unresolved = JSON.parse(readFileSync(unresolvedPath, "utf8"));
const skippedKeys = (unresolved.batches ?? []).map((batch) => batch.batchKey);
const blockedFiles = [];
if (openPullRequestsPath) {
  const open = parseOpenBatchMetadata(JSON.parse(readFileSync(openPullRequestsPath, "utf8")));
  skippedKeys.push(...open.skippedKeys);
  blockedFiles.push(...open.blockedFiles);
}

const batch = selectBatch({ directives, skippedKeys, blockedFiles });
const payload = batch
  ? {
      batch: {
        ...batch,
        branchName: branchNameForBatch(batch.batchKey),
        allowedTools: buildAllowedTools(batch.files),
      },
      directiveCount: directives.length,
    }
  : { batch: null, directiveCount: directives.length };

const outPath = process.env.ESLINT_DISABLE_BATCH_MANIFEST_OUT;
if (outPath) writeFileSync(outPath, `${JSON.stringify(payload)}\n`);
else process.stdout.write(`${JSON.stringify(payload)}\n`);
