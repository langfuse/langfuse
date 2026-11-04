#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";

process.on("uncaughtException", (error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});

const modelFiles = [
  "worker/src/constants/default-model-prices.json",
  "packages/shared/src/server/llm/types.ts",
];
// Files outside this surface are left in place so the allowlist check in
// "Validate audit diff" still fails the run loudly.
const discardableFile =
  /^(\.github\/workflows\/model-price-audit\.yml|\.agents\/skills\/add-model-price\/references\/[^/]+\.md)$/u;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const lines = (text) => text.split("\n").filter(Boolean);

if (lines(git("diff", "--name-only", "--", ...modelFiles)).length > 0) {
  process.exit(0);
}

const trackedFiles = lines(git("diff", "--name-only")).filter((file) =>
  discardableFile.test(file),
);
const untrackedFiles = lines(
  git("ls-files", "--others", "--exclude-standard"),
).filter((file) => discardableFile.test(file));
const discardedFiles = [...trackedFiles, ...untrackedFiles];
if (discardedFiles.length === 0) {
  process.exit(0);
}

console.log("::group::Discarded diff");
if (trackedFiles.length > 0) {
  process.stdout.write(git("diff", "--", ...trackedFiles));
  git("checkout", "--", ...trackedFiles);
}
for (const file of untrackedFiles) {
  console.log(`Removed untracked file: ${file}`);
  fs.rmSync(file, { force: true });
}
console.log("::endgroup::");
console.log(
  `::notice::No prices or selectable models changed; discarded edits to ${discardedFiles.join(", ")}`,
);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      "## Discarded edits",
      "",
      "No prices or selectable models changed, so these edits were discarded and no pull request will be opened:",
      "",
      ...discardedFiles.map((file) => `- \`${file}\``),
      "",
      "",
    ].join("\n"),
  );
}
