import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The hook is a stdin/stdout contract with three agent tools, so it is
// exercised as the process they run rather than as an imported function.
const repoRoot = (() => {
  let dir = process.cwd();
  while (!existsSync(resolve(dir, ".agents/config.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("repo root not found");
    dir = parent;
  }
  return dir;
})();

const HOOK = resolve(repoRoot, "scripts/agents/hooks/structure-path-guard.mjs");
const CHECK = resolve(repoRoot, "web/scripts/structure/check-path.mjs");

const runHook = (
  tool: "claude" | "cursor" | "codex",
  payload: unknown,
  env: Record<string, string> = {},
) => {
  const result = spawnSync("node", [HOOK, "--tool", tool], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    cwd: repoRoot,
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout.trim() };
};

const write = (filePath: string) => ({
  cwd: repoRoot,
  hook_event_name: "PreToolUse",
  tool_name: "Write",
  tool_input: { file_path: filePath },
});

describe("structure path check", () => {
  it("decides the census rules a path can decide, and stays out of the rest", () => {
    const cases: [string, number | null, string | null][] = [
      // path, expected rule, expected verdict
      ["web/src/features/traces/utils/formatCost.ts", 5, "deny"],
      ["web/src/features/traces/hooks/use-dialog.ts", 3, "deny"],
      ["web/src/features/traces/components/trace-badge.tsx", 1, "deny"],
      ["web/src/features/traces/fns/utils.ts", 4, "deny"],
      ["web/src/features/traces/components/index.ts", 9, "deny"],
      ["web/src/components/ui/newThing.tsx", 13, "deny"],
      ["web/src/features/traces/fns/notThere.clienttest.ts", 18, "ask"],
      // legitimate placements
      ["web/src/features/traces/fns/formatCost.ts", null, null],
      ["web/src/features/traces/hooks/useDialog.ts", null, null],
      [
        "web/src/features/traces/components/TraceBadge/TraceBadge.tsx",
        null,
        null,
      ],
      ["web/src/features/traces/index.ts", null, null],
      ["web/src/features/traces/server/index.ts", null, null],
      ["web/src/features/traces/constants/traceDownload.ts", null, null],
      ["web/src/features/traces/contexts/TraceContext.tsx", null, null],
      ["web/src/features/traces/fns/searchJson/matchNode.ts", null, null],
      ["web/src/features/traces/docs/README.ts", null, null],
      // outside the sensor's scope: no opinion
      ["worker/src/queues/newThing.ts", null, null],
      ["web/scripts/structure/new-script.mjs", null, null],
    ];

    const result = spawnSync(
      "node",
      [CHECK, "--json", ...cases.map(([path]) => path)],
      { encoding: "utf8", cwd: repoRoot },
    );
    const findings: {
      path: string;
      findings: { rule: number; verdict: string }[];
    }[] = JSON.parse(result.stdout);

    expect(
      findings.map((r) => [
        r.path,
        r.findings[0]?.rule ?? null,
        r.findings[0]?.verdict ?? null,
      ]),
    ).toEqual(cases);
  });

  it("returns each tool's documented response shape", () => {
    const claude = runHook(
      "claude",
      write("web/src/features/traces/utils/formatCost.ts"),
    );
    expect(JSON.parse(claude.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("rule 5"),
      },
    });
    // Claude supports "ask" natively; the message names the correct path, the
    // rule file and the escape hatch.
    const claudeAsk = JSON.parse(
      runHook(
        "claude",
        write("web/src/features/traces/fns/notThere.clienttest.ts"),
      ).stdout,
    );
    expect(claudeAsk.hookSpecificOutput.permissionDecision).toBe("ask");
    expect(claudeAsk.hookSpecificOutput.permissionDecisionReason).toContain(
      "correct path: web/src/features/traces/fns/notThere.ts",
    );
    expect(claudeAsk.hookSpecificOutput.permissionDecisionReason).toContain(
      ".agents/skills/project-structure/rules/18-fn-and-hook-tests-colocate-flat.md",
    );
    expect(claudeAsk.hookSpecificOutput.permissionDecisionReason).toContain(
      "LANGFUSE_SKIP_STRUCTURE_HOOK",
    );

    expect(
      JSON.parse(
        runHook("cursor", write("web/src/components/ui/newThing.tsx")).stdout,
      ),
    ).toMatchObject({
      permission: "deny",
      agent_message: expect.stringContaining("rule 13"),
    });
    // Cursor's preToolUse has no "ask": the note rides along on an allow.
    expect(
      JSON.parse(
        runHook(
          "cursor",
          write("web/src/features/traces/fns/notThere.clienttest.ts"),
        ).stdout,
      ),
    ).toMatchObject({
      permission: "allow",
      agent_message: expect.stringContaining("rule 18"),
    });

    // Codex sends the target inside an apply_patch payload.
    expect(
      JSON.parse(
        runHook("codex", {
          cwd: repoRoot,
          tool_name: "apply_patch",
          tool_input: {
            input:
              "*** Begin Patch\n*** Add File: web/src/features/traces/hooks/use-thing.ts\n+export const useThing = () => 1;\n*** End Patch",
          },
        }).stdout,
      ),
    ).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("rule 3"),
      },
    });
  });

  it("fails open, and never fires on anything but a new file in scope", () => {
    const silent = [
      // an edit to an existing badly-named, frozen file
      runHook("claude", write("web/src/components/ui/button.tsx")),
      // a path the rules say nothing about
      runHook("claude", write("worker/src/queues/whatever.ts")),
      // no path in the payload at all
      runHook("claude", {
        cwd: repoRoot,
        tool_name: "Bash",
        tool_input: { command: "ls" },
      }),
      // unparsable stdin, and no stdin
      runHook("claude", "not json at all"),
      runHook("claude", ""),
      // the escape hatch
      runHook("claude", write("web/src/features/traces/utils/formatCost.ts"), {
        LANGFUSE_SKIP_STRUCTURE_HOOK: "1",
      }),
    ];

    expect(silent.map((r) => [r.status, r.stdout])).toEqual(
      silent.map(() => [0, ""]),
    );
  });
});
