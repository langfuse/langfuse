#!/usr/bin/env node

import fs from "node:fs";
import {
  reconcileAuditOutput,
  renderAuditSummary,
} from "./audit-output-contract.mjs";

process.on("uncaughtException", (error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});

const requiredEnvironment = [
  "BASE_PRICING_FILE",
  "BASE_TYPES_FILE",
  "CURRENT_PRICING_FILE",
  "CURRENT_TYPES_FILE",
  "HAS_REPOSITORY_DIFF",
  "MEMORY_SNAPSHOT_ONLY",
  "STRUCTURED_OUTPUT",
  "STRUCTURED_OUTPUT_PATH",
  "TYPES_DIFF_FILE",
];
for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const rawOutput = JSON.parse(process.env.STRUCTURED_OUTPUT);
const basePrices = JSON.parse(
  fs.readFileSync(process.env.BASE_PRICING_FILE, "utf8"),
);
const currentPrices = JSON.parse(
  fs.readFileSync(process.env.CURRENT_PRICING_FILE, "utf8"),
);
const baseTypes = fs.readFileSync(process.env.BASE_TYPES_FILE, "utf8");
const currentTypes = fs.readFileSync(process.env.CURRENT_TYPES_FILE, "utf8");
const typesDiff = fs.readFileSync(process.env.TYPES_DIFF_FILE, "utf8");
const { output, warnings } = reconcileAuditOutput(rawOutput, {
  basePrices,
  currentPrices,
  baseTypes,
  currentTypes,
  hasRepositoryDiff: process.env.HAS_REPOSITORY_DIFF === "true",
  memorySnapshotOnly: process.env.MEMORY_SNAPSHOT_ONLY === "true",
  typesDiff,
});

fs.writeFileSync(process.env.STRUCTURED_OUTPUT_PATH, JSON.stringify(output));
for (const warning of warnings) console.error(`::warning::${warning}`);
process.stdout.write(renderAuditSummary(output));
