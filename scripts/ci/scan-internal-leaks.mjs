#!/usr/bin/env node
/**
 * Fail when a newly added line, or pull request title/body, contains an
 * internal analytics or observability URL.
 *
 * Scans added diff lines only, so existing public references stay until
 * someone edits them. Prints file, line, and rule id. Does not print the
 * matched text.
 *
 * Allowed on purpose: regional analytics hosts with no app path, SDK ingest
 * paths, vendor documentation, the support API host, and the Linear MCP
 * endpoint. Production counts are not scanned here; the agent guide covers
 * those, because a number regex false-positives on ordinary code.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const host = (parts) => parts.join(".");

const POSTHOG = host(["posthog", "com"]);
const POSTHOG_APP_PATHS = [
  "project",
  "dashboard",
  "insights",
  "replay",
  "notebooks",
  "session-recordings",
  "persons",
  "cohorts",
  "experiments",
  "feature_flags",
];

const PYLON_APP = host(["app", "pylon", "com"]);
const USEPYLON = host(["usepylon", "com"]);
const USEPYLON_API = host(["api", "usepylon", "com"]);
const USEPYLON_APP = host(["app", "usepylon", "com"]);

const SLACK_ARCHIVES = `${host(["slack", "com"])}/archives/`;

const LINEAR = host(["linear", "app"]);
const LINEAR_WORKSPACES = ["langfuse", "clickhouse"];
const LINEAR_SECTIONS = ["issue", "document", "project", "team", "initiative"];

const INCIDENT = host(["incident", "io"]);
const SENTRY = host(["sentry", "io"]);
const SENTRY_DOCS = host(["docs", "sentry", "io"]);
const DATADOG_APP = [
  host(["app", "datadoghq", "com"]),
  host(["app", "datadoghq", "eu"]),
];
const GRAFANA_CLOUD = host(["grafana", "net"]);

const RULES = [
  {
    id: "posthog-app",
    test(line) {
      const lower = line.toLowerCase();
      return POSTHOG_APP_PATHS.some((path) =>
        lower.includes(`${POSTHOG}/${path}/`),
      );
    },
  },
  {
    id: "pylon-app",
    test(line) {
      const lower = line.toLowerCase();
      if (lower.includes(PYLON_APP) || lower.includes(USEPYLON_APP)) {
        return true;
      }
      if (!lower.includes(USEPYLON)) return false;
      return lower.split(USEPYLON_API).join("").includes(USEPYLON);
    },
  },
  {
    id: "slack-archive",
    test(line) {
      return line.toLowerCase().includes(SLACK_ARCHIVES);
    },
  },
  {
    id: "linear-workspace",
    test(line) {
      const lower = line.toLowerCase();
      if (
        LINEAR_WORKSPACES.some((workspace) =>
          lower.includes(`${LINEAR}/${workspace}/`),
        )
      ) {
        return true;
      }
      const section = LINEAR_SECTIONS.join("|");
      const pattern = new RegExp(
        `${LINEAR.replaceAll(".", "\\.")}/[a-z0-9-]+/(?:${section})/`,
        "i",
      );
      return pattern.test(line);
    },
  },
  {
    id: "incident-url",
    test(line) {
      const escaped = INCIDENT.replaceAll(".", "\\.");
      if (
        new RegExp(
          `https?:\\/\\/(?:[a-z0-9-]+\\.)*${escaped}(?:\\/|$)`,
          "i",
        ).test(line)
      ) {
        return true;
      }
      return new RegExp(
        `(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\\.)?${escaped}\\/`,
        "i",
      ).test(line);
    },
  },
  {
    id: "sentry-org",
    test(line) {
      const lower = line.toLowerCase();
      if (lower.includes(`${SENTRY}/organizations/`)) return true;
      const pattern = new RegExp(
        `https?:\\/\\/([^\\s/"']+\\.${SENTRY.replaceAll(".", "\\.")})(/[^\\s"']*)?`,
        "gi",
      );
      for (const match of line.matchAll(pattern)) {
        const foundHost = match[1].toLowerCase();
        const path = match[2] ?? "";
        if (!path.startsWith("/")) continue;
        if (foundHost === SENTRY_DOCS || foundHost.includes("*")) continue;
        return true;
      }
      return false;
    },
  },
  {
    id: "datadog-app",
    test(line) {
      const lower = line.toLowerCase();
      return DATADOG_APP.some((entry) => lower.includes(entry));
    },
  },
  {
    id: "grafana-cloud",
    test(line) {
      const escaped = GRAFANA_CLOUD.replaceAll(".", "\\.");
      return new RegExp(`[a-z0-9-]+\\.${escaped}\\b`, "i").test(line);
    },
  },
];

/** @returns {string[]} */
export function scanLine(line) {
  return RULES.filter((rule) => rule.test(line)).map((rule) => rule.id);
}

/**
 * @param {string} text
 * @param {string} file
 * @returns {{ file: string, line: number, ruleId: string }[]}
 */
export function scanText(text, file) {
  const findings = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    for (const ruleId of scanLine(lines[index])) {
      findings.push({ file, line: index + 1, ruleId });
    }
  }
  return findings;
}

/**
 * @param {string} diffText unified diff
 * @returns {{ file: string, line: number, ruleId: string }[]}
 */
export function scanDiff(diffText) {
  const findings = [];
  let file = null;
  let newLine = 0;

  for (const raw of diffText.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      file = null;
      continue;
    }
    if (raw.startsWith("+++ ")) {
      const name = raw.slice(4).trim();
      file = name === "/dev/null" ? null : name.replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (file == null) continue;
    if (raw.startsWith("+")) {
      for (const ruleId of scanLine(raw.slice(1))) {
        findings.push({ file, line: newLine, ruleId });
      }
      newLine += 1;
      continue;
    }
    if (raw.startsWith("-") || raw.startsWith("\\")) continue;
    if (raw.startsWith(" ")) newLine += 1;
  }

  return findings;
}

/** @param {{ file: string, line: number, ruleId: string }[]} findings */
export function formatFindings(findings) {
  return findings
    .map((finding) => `${finding.file}:${finding.line} ${finding.ruleId}`)
    .join("\n");
}

function gitDiff(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function usage() {
  return [
    "usage: node scripts/ci/scan-internal-leaks.mjs --staged",
    "       node scripts/ci/scan-internal-leaks.mjs --base <rev>",
    "PR_TITLE and PR_BODY are scanned when set.",
  ].join("\n");
}

function main(argv) {
  const findings = [];
  const staged = argv.includes("--staged");
  const baseFlag = argv.indexOf("--base");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }
  if (!staged && baseFlag === -1 && !process.env.PR_TITLE && !process.env.PR_BODY) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (staged) {
    findings.push(
      ...scanDiff(gitDiff(["diff", "--cached", "--unified=0"])),
    );
  }
  if (baseFlag !== -1) {
    const base = argv[baseFlag + 1];
    if (!base || base.startsWith("--")) {
      console.error(usage());
      process.exitCode = 2;
      return;
    }
    findings.push(
      ...scanDiff(gitDiff(["diff", "--unified=0", base, "HEAD"])),
    );
  }
  if (process.env.PR_TITLE) {
    findings.push(...scanText(process.env.PR_TITLE, "pr-title"));
  }
  if (process.env.PR_BODY) {
    findings.push(...scanText(process.env.PR_BODY, "pr-body"));
  }

  if (findings.length === 0) return;

  console.error(formatFindings(findings));
  console.error(
    `internal URL leak scan failed (${findings.length} match${findings.length === 1 ? "" : "es"})`,
  );
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
