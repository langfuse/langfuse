import { readFileSync } from "node:fs";

import { renderPullRequestBody } from "./lib.mjs";

const payload = JSON.parse(readFileSync(process.env.ESLINT_DISABLE_BATCH_MANIFEST, "utf8"));
const output = process.env.STRUCTURED_OUTPUT
  ? JSON.parse(process.env.STRUCTURED_OUTPUT)
  : {};
const productChange = process.env.PRODUCT_CHANGE !== "false";
const selected = payload.batch;
const batch = productChange
  ? selected
  : {
      batchKey: selected?.batchKey ?? "unresolved",
      mode: "unresolved",
      rule: null,
      files: [".agents/skills/eslint-disable-cleanup/references/unresolved.json"],
      directives: [],
    };

process.stdout.write(
  renderPullRequestBody({
    batch,
    summary: output.summary ?? "",
    validation: output.validation ?? [],
    dryRunMode: process.env.DRY_RUN_MODE,
  }),
);
