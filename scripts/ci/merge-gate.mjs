import { appendFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const requiredJobs = [
  "lint",
  "knip",
  "format-check",
  "tests-ai-gateway",
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
  const errors = Object.entries(needs)
    .filter(([, job]) => ["failure", "cancelled"].includes(job.result))
    .map(([name, job]) => `${name}: ${job.result}`);
  const duplicate =
    event === "push" &&
    needs["pre-job"]?.result === "success" &&
    needs["pre-job"]?.outputs?.should_skip === "true";
  const allowedSkips = new Set();
  if (event === "pull_request") {
    for (const [job, filter] of [
      ["test-worker-llm-connections", "llm-connections-filter"],
      ["test-ai-gateway-e2e", "ai-gateway-filter"],
    ]) {
      if (
        needs[filter]?.result === "success" &&
        needs[filter]?.outputs?.changed === "false"
      ) {
        allowedSkips.add(job);
      }
    }
    if (fork) allowedSkips.add("test-ai-gateway-e2e");
  }
  for (const name of requiredJobs) {
    const result = needs[name]?.result;
    if (result === "success") continue;
    if (result === "skipped" && (duplicate || allowedSkips.has(name))) continue;
    errors.push(`${name}: expected success, received ${result ?? "missing"}`);
  }
  if (/^refs\/tags\/v3(?:\.|$)/.test(ref)) {
    if (needs["validate-v3-release-tag"]?.result !== "success") {
      errors.push("validate-v3-release-tag: expected success");
    }
  }
  return errors;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
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
