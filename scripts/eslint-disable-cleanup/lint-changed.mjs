import { readFileSync } from "node:fs";

import { lintFiles } from "./lib.mjs";

const manifestPath = process.env.ESLINT_DISABLE_BATCH_MANIFEST;
if (!manifestPath) {
  console.error("::error::ESLINT_DISABLE_BATCH_MANIFEST is not set");
  process.exit(1);
}

const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
const batch = parsed.batch ?? parsed;
const files = Array.isArray(batch.files) ? batch.files : [];
if (files.length === 0) {
  console.error("::error::Selected batch has no files to lint");
  process.exit(1);
}

const result = lintFiles(files);
if (result.error) console.error(result.error);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status);
