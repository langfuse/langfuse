import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = path.join(
  import.meta.dirname,
  "discard-edits-without-model-changes.mjs",
);

const pricingPath = "worker/src/constants/default-model-prices.json";
const typesPath = "packages/shared/src/server/llm/types.ts";
const referencePath =
  ".agents/skills/add-model-price/references/provider-sources-and-price-keys.md";
const newReferencePath =
  ".agents/skills/add-model-price/references/audit-notes.md";
const workflowPath = ".github/workflows/model-price-audit.yml";
const outsidePath = "README.md";

const checkedIn = {
  [pricingPath]: '[{"modelName":"alpha"}]\n',
  [typesPath]: 'export const openAIModels = [\n  "alpha",\n] as const;\n',
  [referencePath]: "# Provider Sources\n",
  [workflowPath]: "name: Default Model Price Audit\n",
  [outsidePath]: "# Langfuse\n",
};

function runDiscard(edits) {
  const repository = fs.mkdtempSync(
    path.join(os.tmpdir(), "model-price-audit-discard-"),
  );
  const write = (file, contents) => {
    fs.mkdirSync(path.dirname(path.join(repository, file)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(repository, file), contents);
  };
  const git = (...args) =>
    spawnSync(
      "git",
      ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
      { cwd: repository, encoding: "utf8" },
    );

  git("init", "--quiet");
  for (const [file, contents] of Object.entries(checkedIn))
    write(file, contents);
  git("add", "--all");
  git("commit", "--quiet", "--message", "base");
  for (const [file, contents] of Object.entries(edits)) write(file, contents);

  const summaryPath = path.join(
    repository,
    "..",
    `${path.basename(repository)}-summary.md`,
  );
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
  });
  const read = (file) =>
    fs.existsSync(path.join(repository, file))
      ? fs.readFileSync(path.join(repository, file), "utf8")
      : null;
  const files = Object.fromEntries(
    [...Object.keys(checkedIn), newReferencePath].map((file) => [
      file,
      read(file),
    ]),
  );
  const summary = fs.existsSync(summaryPath)
    ? fs.readFileSync(summaryPath, "utf8")
    : "";
  fs.rmSync(repository, { force: true, recursive: true });
  fs.rmSync(summaryPath, { force: true });
  return { files, result, summary };
}

test("discards reference and workflow edits when no prices or pickers changed", () => {
  const { files, result, summary } = runDiscard({
    [referencePath]:
      "# Provider Sources\n\n- October 31 2026 audit: no drift\n",
    [newReferencePath]: "# Audit notes\n",
    [workflowPath]: "name: Default Model Price Audit\n# tweak\n",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(files[referencePath], checkedIn[referencePath]);
  assert.equal(files[workflowPath], checkedIn[workflowPath]);
  assert.equal(files[newReferencePath], null);
  assert.match(result.stdout, /October 31 2026 audit: no drift/);
  assert.match(
    result.stdout,
    /::notice::No prices or selectable models changed/,
  );
  assert.ok(summary.includes(`- \`${referencePath}\``));
  assert.ok(summary.includes(`- \`${newReferencePath}\``));
});

test("keeps reference edits that accompany a pricing change", () => {
  const edits = {
    [pricingPath]: '[{"modelName":"alpha","input":1}]\n',
    [referencePath]: "# Provider Sources\n\n- Updated fact\n",
  };
  const { files, result, summary } = runDiscard(edits);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(files[pricingPath], edits[pricingPath]);
  assert.equal(files[referencePath], edits[referencePath]);
  assert.equal(result.stdout, "");
  assert.equal(summary, "");
});

test("keeps reference edits that accompany a selectable-model change", () => {
  const edits = {
    [typesPath]: "export const openAIModels = [\n] as const;\n",
    [referencePath]: "# Provider Sources\n\n- Removed alpha\n",
  };
  const { files, result } = runDiscard(edits);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(files[typesPath], edits[typesPath]);
  assert.equal(files[referencePath], edits[referencePath]);
});

test("leaves edits outside the audit surface for the allowlist check", () => {
  const { files, result } = runDiscard({
    [referencePath]: "# Provider Sources\n\n- Note\n",
    [outsidePath]: "# Langfuse\n\nInjected\n",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(files[referencePath], checkedIn[referencePath]);
  assert.equal(files[outsidePath], "# Langfuse\n\nInjected\n");
});
