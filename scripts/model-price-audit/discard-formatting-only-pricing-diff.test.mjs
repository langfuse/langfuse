import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = path.join(
  import.meta.dirname,
  "discard-formatting-only-pricing-diff.mjs",
);

function runCleanup(basePrices, currentPrices) {
  const fixtureDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "model-price-audit-formatting-"),
  );
  const basePath = path.join(fixtureDirectory, "base.json");
  const currentPath = path.join(fixtureDirectory, "current.json");
  const baseText = JSON.stringify(basePrices, null, 2) + "\n";
  const currentText = JSON.stringify(currentPrices, null, 4) + "\n";
  fs.writeFileSync(basePath, baseText);
  fs.writeFileSync(currentPath, currentText);

  const result = spawnSync(
    process.execPath,
    [scriptPath, "--base", basePath, "--current", currentPath],
    { encoding: "utf8" },
  );
  const finalText = fs.readFileSync(currentPath, "utf8");
  fs.rmSync(fixtureDirectory, { force: true, recursive: true });
  return { baseText, currentText, finalText, result };
}

const alpha = {
  modelName: "alpha",
  pricingTiers: [{ prices: { input: 1, output: 2 }, priority: 0 }],
};
const beta = {
  modelName: "beta",
  pricingTiers: [{ prices: { input: 3, output: 4 }, priority: 0 }],
};

test("restores the checked-in file after entry and object-key reordering", () => {
  const reorderedAlpha = {
    pricingTiers: [{ priority: 0, prices: { output: 2, input: 1 } }],
    modelName: "alpha",
  };
  const { baseText, finalText, result } = runCleanup(
    [alpha, beta],
    [beta, reorderedAlpha],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(finalText, baseText);
  assert.match(
    result.stdout,
    /Discarded pricing JSON formatting or ordering changes/,
  );
});

test("preserves a real pricing value change", () => {
  const updatedAlpha = {
    ...alpha,
    pricingTiers: [{ prices: { input: 10, output: 2 }, priority: 0 }],
  };
  const { currentText, finalText, result } = runCleanup(
    [alpha, beta],
    [updatedAlpha, beta],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(finalText, currentText);
  assert.equal(result.stdout, "");
});

test("preserves nested array reordering as a potentially meaningful change", () => {
  const base = [{ ...alpha, inputPriceKeys: ["input", "input_tokens"] }];
  const current = [{ ...alpha, inputPriceKeys: ["input_tokens", "input"] }];
  const { currentText, finalText, result } = runCleanup(base, current);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(finalText, currentText);
});
