#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const evaluatorDir = join(repoRoot, "web/src/features/in-app-agent/evaluators");

const targets = [
  {
    name: "LOCAL",
    baseUrl:
      process.env.LANGFUSE_AI_FEATURES_LOCAL_BASE_URL ??
      "http://localhost:3000",
  },
  { name: "STAGING", baseUrl: "https://staging.langfuse.com" },
  { name: "EU", baseUrl: "https://cloud.langfuse.com" },
  { name: "US", baseUrl: "https://us.cloud.langfuse.com" },
  { name: "JP", baseUrl: "https://jp.cloud.langfuse.com" },
  { name: "HIPAA", baseUrl: "https://hipaa.cloud.langfuse.com" },
];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const assumeYes = args.has("--yes") || args.has("-y");
const help = args.has("--help") || args.has("-h");
const unknownArgs = [...args].filter(
  (arg) => !["--dry-run", "--yes", "-y", "--help", "-h"].includes(arg),
);

if (help) {
  console.log(`Usage: pnpm run assistant:sync-evals -- [--dry-run] [--yes]

Syncs all in-app-agent evaluator definitions and matching processing rules.

Environment:
  LANGFUSE_AI_FEATURES_SYNC_TARGETS       Space or comma separated target names
  LANGFUSE_AI_FEATURES_LOCAL_BASE_URL     Defaults to http://localhost:3000
  LANGFUSE_AI_FEATURES_<TARGET>_PUBLIC_KEY
  LANGFUSE_AI_FEATURES_<TARGET>_SECRET_KEY
`);
  process.exit(0);
}

if (unknownArgs.length > 0) {
  fail(`Unknown argument(s): ${unknownArgs.join(", ")}`);
}

const selectedTargets = resolveSelectedTargets();
const bundles = await loadBundles();

if (dryRun) {
  printPlan({ selectedTargets, bundles });
  console.log("Dry run: no API calls were made.");
  process.exit(0);
}

const preflightErrors = await preflightTargets(selectedTargets);
if (preflightErrors.length > 0) {
  console.error("Preflight failed; no regions synced.");
  for (const error of preflightErrors) {
    console.error(` - ${error}`);
  }
  process.exit(1);
}

const syncedTargets = [];
for (const target of selectedTargets) {
  const shouldSync = assumeYes
    ? true
    : await confirm(
        `Sync evaluators (${bundles.map((bundle) => bundle.evaluatorName).join(", ")}) and processing rules in ${target.name} (${target.baseUrl})? [y/N] `,
      );

  if (!shouldSync) {
    console.log(`Skipped ${target.name}.`);
    continue;
  }

  for (const bundle of bundles) {
    await syncEvaluatorBundle({ target, bundle });
  }

  syncedTargets.push(target.name);
}

if (syncedTargets.length === 0) {
  console.log("No regions synced.");
} else {
  console.log(
    `Synced evaluators (${bundles.map((bundle) => bundle.evaluatorName).join(", ")}) and processing rules to regions: ${syncedTargets.join(", ")}.`,
  );
}

function resolveSelectedTargets() {
  const knownTargets = new Map(targets.map((target) => [target.name, target]));
  const selectedNames = (
    process.env.LANGFUSE_AI_FEATURES_SYNC_TARGETS ??
    targets.map((target) => target.name).join(" ")
  )
    .split(/[\s,]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  const selected = [];
  const errors = [];
  for (const name of selectedNames) {
    const target = knownTargets.get(name);
    if (!target) {
      errors.push(
        `${name}: unknown target. Expected one of: ${targets.map((target) => target.name).join(" ")}.`,
      );
      continue;
    }
    selected.push(target);
  }

  if (errors.length > 0) {
    console.error("Target selection failed.");
    for (const error of errors) {
      console.error(` - ${error}`);
    }
    process.exit(1);
  }

  return selected;
}

async function loadBundles() {
  const files = (await readdir(evaluatorDir))
    .filter((file) => file.endsWith("-evaluator.json"))
    .sort();

  if (files.length === 0) {
    fail(`No evaluator files found in ${evaluatorDir}.`);
  }

  const loaded = [];
  for (const evaluatorFileName of files) {
    const evaluatorFile = join(evaluatorDir, evaluatorFileName);
    const ruleFile = join(
      evaluatorDir,
      evaluatorFileName.replace(/-evaluator\.json$/, "-evaluation-rule.json"),
    );

    if (!existsSync(ruleFile)) {
      fail(`Evaluation rule file not found for ${evaluatorFile}: ${ruleFile}`);
    }

    const evaluator = parseJsonFile(
      evaluatorFile,
      await readFile(evaluatorFile, "utf8"),
    );
    const evaluatorName = validateEvaluator(evaluator, evaluatorFile);

    const rule = parseJsonFile(ruleFile, await readFile(ruleFile, "utf8"));
    const ruleName = validateEvaluationRule({
      rule,
      file: ruleFile,
      evaluatorName,
    });

    loaded.push({
      evaluatorFile,
      ruleFile,
      evaluatorName,
      evaluator,
      ruleName,
      rule,
      rulePatch: {
        ...rule,
        evaluator: {
          name: rule.evaluator.name,
          scope: rule.evaluator.scope,
        },
      },
    });
  }

  return loaded;
}

function parseJsonFile(file, content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    fail(`${file}: invalid JSON. ${error.message}`);
  }
}

function validateEvaluator(evaluator, file) {
  assertPlainObject(evaluator, `${file}: evaluator`);
  assertNonEmptyString(evaluator.name, `${file}: .name`);

  if (evaluator.type !== "llm_as_judge") {
    fail(`${file}: only llm_as_judge evaluator sync is supported.`);
  }
  assertNonEmptyString(evaluator.prompt, `${file}: .prompt`);
  assertPlainObject(evaluator.outputDefinition, `${file}: .outputDefinition`);

  return evaluator.name;
}

function validateEvaluationRule({ rule, file, evaluatorName }) {
  assertPlainObject(rule, `${file}: evaluation rule`);
  assertNonEmptyString(rule.name, `${file}: .name`);
  assertPlainObject(rule.evaluator, `${file}: .evaluator`);

  if (rule.evaluator.name !== evaluatorName) {
    fail(`${file}: .evaluator.name must match ${evaluatorName}.`);
  }
  if (rule.evaluator.scope !== "project") {
    fail(`${file}: .evaluator.scope must be project.`);
  }
  if (rule.evaluator.type !== "llm_as_judge") {
    fail(`${file}: .evaluator.type must be llm_as_judge.`);
  }
  if (rule.target !== "observation") {
    fail(`${file}: only observation evaluation rules are supported.`);
  }
  if (!Array.isArray(rule.filter)) {
    fail(`${file}: .filter must be an array.`);
  }
  if (!Array.isArray(rule.mapping)) {
    fail(`${file}: .mapping must be an array.`);
  }

  return rule.name;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
}

function credentialsForTarget(target) {
  const publicKeyVar = `LANGFUSE_AI_FEATURES_${target.name}_PUBLIC_KEY`;
  const secretKeyVar = `LANGFUSE_AI_FEATURES_${target.name}_SECRET_KEY`;
  const publicKey = process.env[publicKeyVar];
  const secretKey = process.env[secretKeyVar];

  return {
    publicKeyVar,
    secretKeyVar,
    publicKey,
    secretKey,
  };
}

async function preflightTargets(selectedTargets) {
  const errors = [];

  for (const target of selectedTargets) {
    const credentials = credentialsForTarget(target);

    if (!credentials.publicKey || !credentials.secretKey) {
      errors.push(
        `${target.name}: ${credentials.publicKeyVar} and ${credentials.secretKeyVar} must be set.`,
      );
      continue;
    }

    console.log(
      `Checking evaluator API access in ${target.name} (${target.baseUrl})...`,
    );

    const evaluatorResponse = await apiRequest({
      target,
      credentials,
      path: "/api/public/unstable/evaluators?page=1&limit=1",
    });
    if (evaluatorResponse.status !== 200) {
      errors.push(
        preflightStatusError({
          target,
          path: "/api/public/unstable/evaluators",
          response: evaluatorResponse,
        }),
      );
      continue;
    }

    const ruleResponse = await apiRequest({
      target,
      credentials,
      path: "/api/public/unstable/evaluation-rules?page=1&limit=1",
    });
    if (ruleResponse.status !== 200) {
      errors.push(
        preflightStatusError({
          target,
          path: "/api/public/unstable/evaluation-rules",
          response: ruleResponse,
        }),
      );
      continue;
    }

    console.log(
      `Evaluator and evaluation-rule API access checks passed for ${target.name} (${target.baseUrl}).`,
    );
  }

  return errors;
}

function preflightStatusError({ target, path, response }) {
  const detail = response.text ? ` ${response.text}` : "";
  return `${target.name}: expected 200 from ${target.baseUrl}${path}, got ${response.status}.${detail}`;
}

async function syncEvaluatorBundle({ target, bundle }) {
  const credentials = credentialsForTarget(target);

  console.log(
    `Creating ${bundle.evaluatorName} or adding a new version in ${target.name} (${target.baseUrl})...`,
  );
  const evaluatorResponse = await apiRequest({
    target,
    credentials,
    method: "POST",
    path: "/api/public/unstable/evaluators",
    body: bundle.evaluator,
  });
  assertSuccess({
    response: evaluatorResponse,
    action: `sync ${bundle.evaluatorName}`,
    target,
  });
  console.log(
    `Created ${bundle.evaluatorName} or added a new version in ${target.name} (${target.baseUrl}).`,
  );

  console.log(
    `Creating or updating evaluation rule ${bundle.ruleName} in ${target.name} (${target.baseUrl})...`,
  );
  const ruleListResponse = await apiRequest({
    target,
    credentials,
    path: "/api/public/unstable/evaluation-rules?page=1&limit=100",
  });
  assertSuccess({
    response: ruleListResponse,
    action: "list evaluation rules",
    target,
  });

  const existingRule = ruleListResponse.json?.data?.find(
    (rule) => rule.name === bundle.ruleName,
  );

  const ruleResponse = await apiRequest({
    target,
    credentials,
    method: existingRule ? "PATCH" : "POST",
    path: existingRule
      ? `/api/public/unstable/evaluation-rules/${existingRule.id}`
      : "/api/public/unstable/evaluation-rules",
    body: existingRule ? bundle.rulePatch : bundle.rule,
  });
  assertSuccess({
    response: ruleResponse,
    action: `${existingRule ? "update" : "create"} evaluation rule ${bundle.ruleName}`,
    target,
  });

  console.log(
    `${existingRule ? "Updated" : "Created"} evaluation rule ${bundle.ruleName} in ${target.name} (${target.baseUrl}).`,
  );
}

async function apiRequest({ target, credentials, path, method = "GET", body }) {
  const headers = {
    Authorization: `Basic ${Buffer.from(
      `${credentials.publicKey}:${credentials.secretKey}`,
    ).toString("base64")}`,
  };

  let response;
  try {
    response = await fetch(`${target.baseUrl}${path}`, {
      method,
      headers: body
        ? {
            ...headers,
            "Content-Type": "application/json",
          }
        : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    return {
      status: 0,
      ok: false,
      text: error instanceof Error ? error.message : String(error),
      json: null,
    };
  }

  const text = await response.text();
  let json = null;

  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    text,
    json,
  };
}

function assertSuccess({ response, action, target }) {
  if (response.ok) {
    return;
  }

  console.error(
    `Failed to ${action} in ${target.name} (${target.baseUrl}); status ${response.status}.`,
  );
  if (response.json) {
    console.error(JSON.stringify(response.json, null, 2));
  } else if (response.text) {
    console.error(response.text);
  }
  process.exit(1);
}

function printPlan({ selectedTargets, bundles }) {
  console.log("Targets:");
  for (const target of selectedTargets) {
    console.log(` - ${target.name}: ${target.baseUrl}`);
  }

  console.log("Evaluator bundles:");
  for (const bundle of bundles) {
    console.log(
      ` - ${bundle.evaluatorName}: ${basename(bundle.evaluatorFile)} -> ${bundle.ruleName}: ${basename(bundle.ruleFile)}`,
    );
  }
}

async function confirm(question) {
  if (!input.isTTY) {
    return false;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
