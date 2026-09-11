import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("sync removes dangling skill shims and passes the subsequent check", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-shims-"));
  try {
    mkdirSync(join(root, "scripts/agents"), { recursive: true });
    mkdirSync(join(root, ".agents/skills"), { recursive: true });
    mkdirSync(join(root, ".claude/skills"), { recursive: true });
    copyFileSync(new URL("sync-agent-shims.mjs", import.meta.url), join(root, "scripts/agents/sync-agent-shims.mjs"));
    copyFileSync(new URL("../../.agents/config.json", import.meta.url), join(root, ".agents/config.json"));
    writeFileSync(join(root, ".agents/AGENTS.md"), "# Agent instructions\n");
    const stale = join(root, ".claude/skills/deleted-skill");
    symlinkSync("../../.agents/skills/deleted-skill", stale);
    const run = (...args) => execFileSync(process.execPath, [join(root, "scripts/agents/sync-agent-shims.mjs"), ...args], { cwd: root });
    run();
    assert.equal(lstatSync(stale, { throwIfNoEntry: false }), undefined);
    run("--check");
    run();
    run("--check");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
