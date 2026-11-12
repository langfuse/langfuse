import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("code-scanning intake skips licenses and routes every other scanner finding to remediation", () => {
  const workflow = readFileSync(
    new URL(
      "../../.github/workflows/dependabot-security-maintainer.md",
      import.meta.url,
    ),
    "utf8",
  );
  const filter = workflow.match(
    /^      cat > "\$FILTER_PATH" <<'JQ'\n([\s\S]*?)^      JQ$/m,
  )?.[1];
  assert.ok(filter, "workflow must define its code-scanning filter");
  const alerts = [
    {
      number: 1,
      tool: { name: "Snyk Container" },
      rule: {
        id: "SNYK-JS-EXAMPLE-123",
        full_description: "(CVE-2026-12345) @example/package@1.0.0",
        help: "Upgrade @example/package to version 1.0.1 or higher.",
      },
    },
    {
      number: 2,
      tool: { name: "Snyk Container" },
      rule: { id: "snyk:lic:npm:example:LGPL-3.0" },
    },
    {
      number: 3,
      tool: { name: "CodeQL" },
      rule: { id: "js/sql-injection", severity: "error" },
      most_recent_instance: {
        ref: "refs/heads/main",
        location: { path: "web/src/example.ts", start_line: 12 },
      },
    },
    {
      number: 4,
      tool: { name: "Snyk Container" },
      rule: { id: "SNYK-JS-UNRECOGNIZED-456" },
    },
    {
      number: 5,
      tool: { name: "Snyk Container" },
      rule: { id: "SNYK-RHEL9-OPENSSL-123", description: "Vulnerable RPM" },
      most_recent_instance: { location: { path: "/app/worker/Dockerfile" } },
    },
    {
      number: 6,
      tool: { name: "Another scanner" },
      rule: { id: "policy-123", tags: ["license"] },
    },
  ];
  const result = spawnSync("jq", [filter], {
    input: JSON.stringify(alerts),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const normalized = JSON.parse(result.stdout);
  assert.deepEqual(
    normalized.map(({ number }) => number),
    [1, 3, 4, 5],
  );
  assert.deepEqual(
    normalized.map(({ remediation }) => remediation),
    ["npm-upgrade", "code-fix", "code-fix", "code-fix"],
  );
  assert.equal(normalized[0].package, "@example/package");
  assert.equal(normalized[0].installed_version, "1.0.0");
  assert.equal(normalized[0].fix, alerts[0].rule.help);
  assert.equal(normalized[1].tool, "CodeQL");
  assert.equal(normalized[1].location, "web/src/example.ts");
  assert.equal(normalized[1].line, 12);
  assert.equal(normalized[2].package, null);
  assert.equal(normalized[3].rule_id, "SNYK-RHEL9-OPENSSL-123");
});
