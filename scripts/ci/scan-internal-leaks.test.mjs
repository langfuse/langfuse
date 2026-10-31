import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatFindings,
  scanDiff,
  scanLine,
  scanText,
} from "./scan-internal-leaks.mjs";

const joinHost = (...parts) => parts.join(".");

const posthog = joinHost("posthog", "com");
const euPosthog = joinHost("eu", posthog);
const usPosthog = joinHost("us", posthog);
const appPosthog = joinHost("app", posthog);

test("analytics app paths are leaks on any regional host", () => {
  const project = `https://${euPosthog}/project/1/dashboard/2`;
  const insight = `https://${usPosthog}/project/1/insights/3`;
  assert.deepEqual(scanLine(project), ["posthog-app"]);
  assert.deepEqual(scanLine(insight), ["posthog-app"]);
  assert.deepEqual(
    scanLine(`https://${posthog}/project/1/replay/home`),
    ["posthog-app"],
  );
});

test("public analytics hosts and ingest paths are allowed", () => {
  const allowed = [
    `https://${euPosthog}`,
    `https://${euPosthog}/`,
    `https://${usPosthog}`,
    `https://${joinHost("eu", "i", posthog)}`,
    `https://${joinHost("us", "i", posthog)}/batch`,
    `https://${appPosthog}/batch/`,
    `https://${appPosthog}/i/v1/analytics/events`,
    `https://${appPosthog}/flags/?v=2`,
    `https://${posthog}/docs/data/anonymous-vs-identified-events`,
    "https://*.posthog.com",
  ];
  for (const line of allowed) {
    assert.deepEqual(scanLine(line), [], line);
  }
});

test("support app hosts are leaks and the API host is allowed", () => {
  const pylon = joinHost("pylon", "com");
  const usepylon = joinHost("usepylon", "com");
  assert.deepEqual(scanLine(`https://${joinHost("app", pylon)}/issues/1`), [
    "pylon-app",
  ]);
  assert.deepEqual(
    scanLine(`https://${joinHost("app", usepylon)}/issues/1`),
    ["pylon-app"],
  );
  assert.deepEqual(scanLine(`https://${usepylon}/support/1`), ["pylon-app"]);
  assert.deepEqual(scanLine(`https://${joinHost("api", usepylon)}/v1`), []);
});

test("chat archive links are leaks", () => {
  const workspace = joinHost("langfuse", "slack", "com");
  assert.deepEqual(scanLine(`https://${workspace}/archives/C0123`), [
    "slack-archive",
  ]);
  assert.deepEqual(scanLine(`https://${joinHost("slack", "com")}/help`), []);
});

test("workspace issue links are leaks and the MCP endpoint is allowed", () => {
  const linear = joinHost("linear", "app");
  assert.deepEqual(
    scanLine(`https://${linear}/langfuse/issue/LFE-1/title`),
    ["linear-workspace"],
  );
  assert.deepEqual(
    scanLine(`https://${linear}/clickhouse/document/rfc-1`),
    ["linear-workspace"],
  );
  assert.deepEqual(
    scanLine(`https://${linear}/other-team/issue/ABC-1`),
    ["linear-workspace"],
  );
  assert.deepEqual(scanLine(`https://${joinHost("mcp", linear)}/mcp`), []);
  assert.deepEqual(scanLine(`https://${linear}/changelog`), []);
});

test("incident status URLs are leaks and the product name is allowed", () => {
  const incident = joinHost("incident", "io");
  assert.deepEqual(scanLine(`https://${joinHost("app", incident)}/org`), [
    "incident-url",
  ]);
  assert.deepEqual(scanLine(`${incident}/org/incidents/1`), ["incident-url"]);
  assert.deepEqual(scanLine(`see ${incident} for the product name`), []);
});

test("org error-tracker URLs are leaks and docs plus CSP wildcards are allowed", () => {
  const sentry = joinHost("sentry", "io");
  assert.deepEqual(
    scanLine(`https://${sentry}/organizations/langfuse/issues/1`),
    ["sentry-org"],
  );
  assert.deepEqual(
    scanLine(`https://${joinHost("langfuse", sentry)}/issues/1/`),
    ["sentry-org"],
  );
  assert.deepEqual(
    scanLine(`https://${joinHost("docs", sentry)}/platforms/javascript/`),
    [],
  );
  assert.deepEqual(
    scanLine(
      "connect-src https://*.sentry.io https://*.ingest.us.sentry.io;",
    ),
    [],
  );
});

test("internal trace and dashboard hosts are leaks and vendor docs are allowed", () => {
  const datadogCom = joinHost("app", "datadoghq", "com");
  const datadogEu = joinHost("app", "datadoghq", "eu");
  const docs = joinHost("docs", "datadoghq", "com");
  assert.deepEqual(scanLine(`https://${datadogCom}/apm/traces`), [
    "datadog-app",
  ]);
  assert.deepEqual(scanLine(`https://${datadogEu}/logs`), ["datadog-app"]);
  assert.deepEqual(scanLine(`https://${docs}/tracing/`), []);
  assert.deepEqual(
    scanLine(`https://${joinHost("langfuse", "grafana", "net")}/d/abc`),
    ["grafana-cloud"],
  );
  assert.deepEqual(scanLine("https://grafana.com/docs/"), []);
});

test("diff scanning reports only added lines", () => {
  const leaked = `https://${euPosthog}/project/9/dashboard/8`;
  const diff = [
    "diff --git a/notes.md b/notes.md",
    "--- a/notes.md",
    "+++ b/notes.md",
    "@@ -4,0 +5,2 @@",
    "+kept",
    `+${leaked}`,
    "@@ -10 +12 @@",
    `-https://${euPosthog}/project/1/dashboard/1`,
  ].join("\n");
  assert.deepEqual(scanDiff(diff), [
    { file: "notes.md", line: 6, ruleId: "posthog-app" },
  ]);
});

test("pull request text is scanned by line", () => {
  const leaked = `https://${usPosthog}/project/1/dashboard/2`;
  assert.deepEqual(scanText(`summary\n${leaked}\n`, "pr-body"), [
    { file: "pr-body", line: 2, ruleId: "posthog-app" },
  ]);
});

test("formatter does not repeat the matched text", () => {
  const leaked = `https://${euPosthog}/project/1`;
  const formatted = formatFindings([
    { file: "a.md", line: 3, ruleId: "posthog-app" },
  ]);
  assert.equal(formatted, "a.md:3 posthog-app");
  assert.equal(formatted.includes(leaked), false);
});
