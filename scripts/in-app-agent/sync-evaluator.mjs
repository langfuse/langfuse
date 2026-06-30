#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const evaluatorDir = join(
  resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  "web/src/features/in-app-agent/evaluators",
);
const baseUrls = {
  LOCAL:
    process.env.LANGFUSE_AI_FEATURES_LOCAL_BASE_URL ?? "http://localhost:3000",
  STAGING: "https://staging.langfuse.com",
  EU: "https://cloud.langfuse.com",
  US: "https://us.cloud.langfuse.com",
  JP: "https://jp.cloud.langfuse.com",
  HIPAA: "https://hipaa.cloud.langfuse.com",
};
const allowedArgs = new Set(["--dry-run", "--yes", "-y", "--help", "-h"]);
const args = process.argv.slice(2).filter((arg) => arg !== "--");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: pnpm assistant:sync-evals -- [--dry-run] [--yes]

Environment:
  LANGFUSE_AI_FEATURES_SYNC_TARGETS       Space or comma separated target names
  LANGFUSE_AI_FEATURES_LOCAL_BASE_URL     Defaults to http://localhost:3000
  LANGFUSE_AI_FEATURES_<TARGET>_PUBLIC_KEY
  LANGFUSE_AI_FEATURES_<TARGET>_SECRET_KEY
`);
  process.exit(0);
}

const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));
if (unknownArgs.length > 0) {
  fail(`Unknown argument(s): ${unknownArgs.join(", ")}`);
}

const dryRun = args.includes("--dry-run");
const assumeYes = args.includes("--yes") || args.includes("-y");
const targetNames = (
  process.env.LANGFUSE_AI_FEATURES_SYNC_TARGETS ??
  Object.keys(baseUrls).join(" ")
)
  .split(/[\s,]+/)
  .map((name) => name.trim().toUpperCase())
  .filter(Boolean);
const targets = targetNames.map((name) => {
  if (!baseUrls[name]) {
    fail(
      `${name}: unknown target. Expected one of: ${Object.keys(baseUrls).join(" ")}.`,
    );
  }

  const publicKeyVar = `LANGFUSE_AI_FEATURES_${name}_PUBLIC_KEY`;
  const secretKeyVar = `LANGFUSE_AI_FEATURES_${name}_SECRET_KEY`;
  return {
    name,
    baseUrl: baseUrls[name],
    publicKeyVar,
    secretKeyVar,
    publicKey: process.env[publicKeyVar],
    secretKey: process.env[secretKeyVar],
  };
});
const bundles = await loadBundles();
const bundleNames = bundles.map((bundle) => bundle.evaluator.name).join(", ");

if (dryRun) {
  console.log("Targets:");
  for (const target of targets)
    console.log(` - ${target.name}: ${target.baseUrl}`);
  console.log("Evaluator bundles:");
  for (const bundle of bundles) {
    console.log(` - ${bundle.evaluator.name} -> ${bundle.rule.name}`);
  }
  console.log("Dry run: no API calls were made.");
  process.exit(0);
}

await preflight();

const synced = [];
for (const target of targets) {
  const shouldSync =
    assumeYes ||
    (await confirm(
      `Sync evaluators (${bundleNames}) and processing rules in ${target.name} (${target.baseUrl})? [y/N] `,
    ));

  if (!shouldSync) {
    console.log(`Skipped ${target.name}.`);
    continue;
  }

  for (const bundle of bundles) {
    await syncBundle(target, bundle);
  }
  synced.push(target.name);
}

console.log(
  synced.length
    ? `Synced evaluators (${bundleNames}) and processing rules to regions: ${synced.join(", ")}.`
    : "No regions synced.",
);

async function loadBundles() {
  const evaluatorFiles = (await readdir(evaluatorDir))
    .filter((file) => file.endsWith("-evaluator.json"))
    .sort();

  if (evaluatorFiles.length === 0) {
    fail(`No evaluator files found in ${evaluatorDir}.`);
  }

  return Promise.all(
    evaluatorFiles.map(async (file) => {
      const evaluator = await readJson(join(evaluatorDir, file));
      const rule = await readJson(
        join(
          evaluatorDir,
          file.replace(/-evaluator\.json$/, "-evaluation-rule.json"),
        ),
      );
      return {
        evaluator,
        rule,
        rulePatch: {
          ...rule,
          evaluator: {
            name: rule.evaluator.name,
            scope: rule.evaluator.scope,
          },
        },
      };
    }),
  );
}

async function preflight() {
  const errors = [];

  for (const target of targets) {
    if (!target.publicKey || !target.secretKey) {
      errors.push(
        `${target.name}: ${target.publicKeyVar} and ${target.secretKeyVar} must be set.`,
      );
      continue;
    }

    console.log(
      `Checking evaluator API access in ${target.name} (${target.baseUrl})...`,
    );
    for (const path of [
      "/api/public/unstable/evaluators?page=1&limit=1",
      "/api/public/unstable/evaluation-rules?page=1&limit=1",
    ]) {
      const response = await request(target, path);
      if (response.status !== 200) {
        errors.push(
          `${target.name}: expected 200 from ${target.baseUrl}${path}, got ${response.status}.${response.text ? ` ${response.text}` : ""}`,
        );
        break;
      }
    }
  }

  if (errors.length > 0) {
    console.error("Preflight failed; no regions synced.");
    for (const error of errors) console.error(` - ${error}`);
    process.exit(1);
  }
}

async function syncBundle(target, bundle) {
  console.log(
    `Creating ${bundle.evaluator.name} or adding a new version in ${target.name} (${target.baseUrl})...`,
  );
  await requestOrFail(target, "/api/public/unstable/evaluators", {
    method: "POST",
    body: bundle.evaluator,
    action: `sync ${bundle.evaluator.name}`,
  });

  const ruleList = await requestOrFail(
    target,
    "/api/public/unstable/evaluation-rules?page=1&limit=100",
    { action: "list evaluation rules" },
  );
  const existingRule = ruleList.json?.data?.find(
    (rule) => rule.name === bundle.rule.name,
  );

  await requestOrFail(
    target,
    existingRule
      ? `/api/public/unstable/evaluation-rules/${existingRule.id}`
      : "/api/public/unstable/evaluation-rules",
    {
      method: existingRule ? "PATCH" : "POST",
      body: existingRule ? bundle.rulePatch : bundle.rule,
      action: `${existingRule ? "update" : "create"} evaluation rule ${bundle.rule.name}`,
    },
  );
  console.log(
    `${existingRule ? "Updated" : "Created"} evaluation rule ${bundle.rule.name} in ${target.name} (${target.baseUrl}).`,
  );
}

async function requestOrFail(target, path, options = {}) {
  const response = await request(target, path, options);
  if (response.ok) return response;

  console.error(
    `Failed to ${options.action} in ${target.name} (${target.baseUrl}); status ${response.status}.`,
  );
  console.error(
    response.json ? JSON.stringify(response.json, null, 2) : response.text,
  );
  process.exit(1);
}

async function request(target, path, { method = "GET", body } = {}) {
  try {
    const response = await fetch(`${target.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${target.publicKey}:${target.secretKey}`,
        ).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      json: parseJson(text),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: error instanceof Error ? error.message : String(error),
      json: null,
    };
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function confirm(question) {
  if (!input.isTTY) return false;

  const rl = createInterface({ input, output });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
