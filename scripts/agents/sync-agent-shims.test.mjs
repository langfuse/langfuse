import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const createFixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), "agent-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, contents) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  };
  write(
    ".agents/config.json",
    readFileSync(new URL("../../.agents/config.json", import.meta.url)),
  );
  write(".agents/AGENTS.md", "# Repository instructions\n");
  write(".agents/skills/example/SKILL.md", "# Example skill\n");
  write("web/AGENTS.md", "# Web instructions\n");
  write("web/src/feature/AGENTS.md", "# Feature instructions\n");
  mkdirSync(join(root, "scripts/agents"), { recursive: true });
  copyFileSync(
    new URL("./sync-agent-shims.mjs", import.meta.url),
    join(root, "scripts/agents/sync-agent-shims.mjs"),
  );
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [join(root, "scripts/agents/sync-agent-shims.mjs"), ...args],
      { encoding: "utf8" },
    );
  return { root, write, run };
};

const assertSuccess = (result) => {
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
};

test("sync keeps root and nested instructions in AGENTS.md without translation", (t) => {
  const { root, run } = createFixture(t);
  assertSuccess(run());
  assertSuccess(run());
  assertSuccess(run("--check", "--check-paths"));

  assert.equal(readlinkSync(join(root, "AGENTS.md")), ".agents/AGENTS.md");
  for (const directory of ["", "web", "web/src/feature"]) {
    assert.ok(!readdirSync(join(root, directory)).includes("CLAUDE.md"));
  }
  assert.equal(
    readlinkSync(join(root, ".claude/skills/example")),
    "../../.agents/skills/example",
  );
  const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
  assert.ok(mcp.mcpServers["langfuse-docs"]);
});

test("nested guidance paths are validated only when requested", (t) => {
  const { write, run } = createFixture(t);
  write("web/src/feature/AGENTS.md", "Read `scripts/agents/missing.mjs`.\n");
  write(
    "web/.agents/skills/vendor/AGENTS.md",
    "Read `scripts/agents/vendor.mjs`.\n",
  );
  assertSuccess(run());
  assertSuccess(run("--check"));

  const result = run("--check", "--check-paths");
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Broken path reference in web\/src\/feature\/AGENTS.md/,
  );
  assert.doesNotMatch(result.stderr, /vendor.mjs/);

  write("scripts/agents/missing.mjs", "// Referenced file.\n");
  assertSuccess(run("--check", "--check-paths"));
});
