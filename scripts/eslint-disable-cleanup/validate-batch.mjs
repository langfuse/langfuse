import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { parseDirectives, validateBatchEdit } from "./lib.mjs";

const manifestPath = process.env.ESLINT_DISABLE_BATCH_MANIFEST;
if (!manifestPath) {
  console.error("::error::ESLINT_DISABLE_BATCH_MANIFEST is not set");
  process.exit(1);
}

const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
const batch = parsed.batch ?? parsed;
const changedFiles = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);
const changedLineCount = Number(process.env.CHANGED_LINE_COUNT ?? "0");
const allowUnchangedDirectives = process.env.ALLOW_UNCHANGED_DIRECTIVES === "true";

const beforeByFile = new Map();
const afterByFile = new Map();
for (const file of batch.files ?? []) {
  const before = spawnSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" });
  beforeByFile.set(
    file,
    before.status === 0 ? parseDirectives(before.stdout, file) : [],
  );
  afterByFile.set(file, parseDirectives(readFileSync(file, "utf8"), file));
}

const errors = validateBatchEdit({
  beforeByFile,
  afterByFile,
  batch,
  changedFiles,
  changedLineCount,
  allowUnchangedDirectives,
});

if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}
