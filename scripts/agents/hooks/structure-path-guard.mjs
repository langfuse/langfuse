#!/usr/bin/env node
// Pre-write hook: refuse a *new* file under `web/src` whose path would add a
// project-structure violation. One implementation, three response shapes:
//
//   node scripts/agents/hooks/structure-path-guard.mjs --tool claude|cursor|codex
//
// Two invariants, both load-bearing:
//
//   1. Creation only. The check runs when the target path does not exist yet.
//      An edit to a badly-named file is never blocked — the name is not the
//      bug you were asked to fix.
//   2. Fail open, always. Unreadable stdin, unparsable payload, a throw, a
//      missing check — every one of them allows the write. A broken sensor
//      must not be able to stop work.
//
// Never invoke the sensor through pnpm from here: package-manager startup is
// most of a full run. This calls the path check directly and costs a
// directory read.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const STDIN_TIMEOUT_MS = 1500;
const SKIP_ENV_VAR = "LANGFUSE_SKIP_STRUCTURE_HOOK";
const PATH_KEYS = [
  "file_path",
  "filePath",
  "path",
  "target_file",
  "notebook_path",
];

const tool = (() => {
  const index = process.argv.indexOf("--tool");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value === "cursor" || value === "codex" ? value : "claude";
})();

/** Anything but a decision is an allow, expressed the way each tool expects. */
const allow = () => {
  if (tool === "cursor") process.stdout.write(JSON.stringify({}));
  process.exit(0);
};

/** @type {(verdict: "deny" | "ask", message: string) => never} */
const decide = (verdict, message) => {
  if (tool === "cursor") {
    // Cursor's preToolUse takes allow or deny only, so an "ask" becomes an
    // allow carrying the note — it surfaces the rule without blocking.
    process.stdout.write(
      JSON.stringify(
        verdict === "deny"
          ? {
              permission: "deny",
              agent_message: message,
              user_message: "Blocked by the project-structure path check.",
            }
          : { permission: "allow", agent_message: message },
      ),
    );
  } else if (tool === "codex") {
    // Codex has no native "ask" for PreToolUse, so an ask is returned as
    // context and the tool's own approval flow is left alone.
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput:
          verdict === "deny"
            ? {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: message,
              }
            : { hookEventName: "PreToolUse", additionalContext: message },
      }),
    );
  } else {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: verdict,
          permissionDecisionReason: message,
        },
      }),
    );
  }
  process.exit(0);
};

/** @type {(value: unknown, out?: string[]) => string[]} */
const stringValues = (value, out = []) => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringValues(item, out);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) stringValues(item, out);
  return out;
};

/** @type {(payload: any) => string[]} */
const targetPaths = (payload) => {
  const input = payload?.tool_input;
  const found = new Set();
  if (input && typeof input === "object")
    for (const key of PATH_KEYS)
      if (typeof input[key] === "string" && input[key]) found.add(input[key]);
  // A patch-shaped tool (Codex `apply_patch`) carries the target inside the
  // patch text. Only consulted when no explicit path field was present, so a
  // file's *contents* can never be mistaken for a path. `Move to` matters as
  // much as `Add File`: a rename lands the file at a path that did not exist.
  if (!found.size)
    for (const text of stringValues(input))
      for (const match of text.matchAll(
        /^\*\*\* (?:Add File|Move to): (.+)$/gm,
      ))
        found.add(match[1].trim());
  return [...found];
};

/** @type {(cwd: string | undefined, target: string) => string} */
const absolute = (cwd, target) =>
  target.startsWith("/") ? target : resolve(cwd || repoRoot, target);

/** @type {(results: {path: string, findings: any[]}[]) => string} */
const message = (results) => {
  const total = results.reduce((sum, r) => sum + r.findings.length, 0);
  const lines = [
    `Project structure: this path would add ${total} new violation${total === 1 ? "" : "s"}.`,
    "",
  ];
  for (const { path, findings } of results) {
    lines.push(path);
    for (const f of findings) {
      lines.push(`  rule ${f.rule} — ${f.title}`);
      lines.push(`    ${f.detail}`);
      if (f.correctPath) lines.push(`    correct path: web/${f.correctPath}`);
      lines.push(`    rule file: ${f.ruleFile}`);
    }
    lines.push("");
  }
  lines.push(
    "Existing files are grandfathered; this fires only on creating a new one.",
    `Escape hatch: set ${SKIP_ENV_VAR}=1 to disable this hook.`,
  );
  return lines.join("\n");
};

const readStdin = () =>
  new Promise((resolvePromise) => {
    let raw = "";
    const done = () => resolvePromise(raw);
    const timer = setTimeout(done, STDIN_TIMEOUT_MS);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      done();
    });
  });

async function main() {
  if (process.env[SKIP_ENV_VAR]) allow();

  const raw = await readStdin();
  if (!raw.trim()) allow();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    allow();
  }

  const candidates = targetPaths(payload).filter((target) => {
    const path = absolute(payload?.cwd, target);
    // Creation only: an existing file's name is not this hook's business.
    return path.startsWith(`${repoRoot}/web/src/`) && !existsSync(path);
  });
  if (!candidates.length) allow();

  const { checkPath } = await import(
    `file://${repoRoot}/web/scripts/structure/check-path.mjs`
  );
  const results = candidates
    .map((target) => ({
      path: target,
      findings: checkPath(absolute(payload?.cwd, target)),
    }))
    .filter(({ findings }) => findings.length);
  if (!results.length) allow();

  const verdict = results.some(({ findings }) =>
    findings.some((f) => f.verdict === "deny"),
  )
    ? "deny"
    : "ask";
  decide(verdict, message(results));
}

// Fail open on anything at all: a hook that throws must not block a write.
process.on("uncaughtException", allow);
process.on("unhandledRejection", allow);
main().catch(allow);
