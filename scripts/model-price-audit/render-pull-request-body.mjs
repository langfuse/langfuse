#!/usr/bin/env node

import fs from "node:fs";
import { renderPullRequestBody } from "./audit-output-contract.mjs";

process.on("uncaughtException", (error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});

if (!process.env.STRUCTURED_OUTPUT_PATH) {
  throw new Error(
    "Missing required environment variable: STRUCTURED_OUTPUT_PATH",
  );
}

const output = JSON.parse(
  fs.readFileSync(process.env.STRUCTURED_OUTPUT_PATH, "utf8"),
);
process.stdout.write(
  renderPullRequestBody(output, { reportUrl: process.env.AUDIT_REPORT_URL }),
);
