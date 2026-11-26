import { appendFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const requiredJobs = [
  "lint",
  "typecheck",
  "knip",
  "format-check",
  "tests-ai-gateway",
  "tests-ai-gateway-guardrail-rules",
  "tests-eslint-plugin",
  "tests-in-app-agent-sandbox-runtime",
  "tests-storybook",
  "build-storybook",
  "tests-shared",
  "tests-web",
  "tests-web-client",
  "tests-worker",
  "test-worker-llm-connections",
  "test-ai-gateway-e2e",
  "e2e-tests",
  "test-docker-build",
  "e2e-server-tests",
];

export function evaluateGate({ event, ref = "", needs, fork = false }) {
  if (!needs || typeof needs !== "object" || Array.isArray(needs)) {
    return ["Missing job results"];
  }
  const allowedSkips = allowedFilteredSkips(event, ref, needs, fork);
  const duplicate = isDuplicatePush(event, needs);
  return [
    ...failedNeeds(needs),
    ...missingRequiredJobs(needs, allowedSkips, duplicate, ref),
    ...releaseTagErrors(event, ref, needs),
  ];
}

function failedNeeds(needs) {
  return Object.entries(needs)
    .filter(([, job]) => ["failure", "cancelled"].includes(job.result))
    .map(([name, job]) => `${name}: ${job.result}`);
}

function isDuplicatePush(event, needs) {
  return (
    event === "push" &&
    needs["pre-job"]?.result === "success" &&
    needs["pre-job"]?.outputs?.should_skip === "true"
  );
}

function allowedFilteredSkips(event, ref, needs, fork) {
  const allowedSkips = new Set();
  if (
    !["pull_request", "merge_group", "push"].includes(event) ||
    ref.startsWith("refs/tags/")
  )
    return allowedSkips;
  const selection = needs["llm-connections-filter"];
  for (const [job, output] of [
    ["test-worker-llm-connections", "llm_connections"],
    ["test-ai-gateway-e2e", "ai_gateway"],
    ["tests-ai-gateway-guardrail-rules", "ai_gateway_guardrail_rules"],
  ]) {
    if (
      selection?.result === "success" &&
      selection.outputs?.[output] === "false"
    ) {
      allowedSkips.add(job);
    }
  }
  if (event === "pull_request" && fork) {
    allowedSkips.add("test-worker-llm-connections");
    allowedSkips.add("test-ai-gateway-e2e");
  }
  return allowedSkips;
}

function missingRequiredJobs(needs, allowedSkips, duplicate, ref) {
  const errors = [];
  for (const name of requiredJobs) {
    const result = needs[name]?.result;
    if (result === "success") continue;
    const requiredOnTag =
      ref.startsWith("refs/tags/") &&
      [
        "test-worker-llm-connections",
        "test-ai-gateway-e2e",
        "tests-ai-gateway-guardrail-rules",
      ].includes(name);
    if (
      result === "skipped" &&
      ((duplicate && !requiredOnTag) || allowedSkips.has(name))
    )
      continue;
    errors.push(`${name}: expected success, received ${result ?? "missing"}`);
  }
  return errors;
}

function releaseTagErrors(event, ref, needs) {
  return event === "push" &&
    /^refs\/tags\/v3(?:\.|$)/.test(ref) &&
    needs["validate-v3-release-tag"]?.result !== "success"
    ? ["validate-v3-release-tag: expected success"]
    : [];
}

function isMainModule() {
  if (!process.argv[1]) return false;
  const modulePath = fileURLToPath(import.meta.url);
  // A recognized entrypoint must run even if its path disappears after loading.
  if (resolve(process.argv[1]) === modulePath) return true;
  let entryPath;
  try {
    entryPath = realpathSync(process.argv[1]);
  } catch (error) {
    // Eval/import launchers can put non-file arguments in argv[1].
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
  return entryPath === realpathSync(modulePath);
}

if (isMainModule()) {
  let errors;
  try {
    errors = evaluateGate({
      event: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF,
      needs: JSON.parse(process.env.NEEDS_JSON),
      fork: process.env.IS_FORK === "true",
    });
  } catch (error) {
    errors = [`Invalid job results: ${error.message}`];
  }
  const success = errors.length === 0;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `success=${success}\n`);
  }
  for (const error of errors) console.error(error);
  console.log(
    success ? "All required CI jobs passed" : "Required CI jobs did not pass",
  );
  process.exitCode = success ? 0 : 1;
}
