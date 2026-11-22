import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

test("the check CLI loads the Turbo workspace only for applicable checks", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "langfuse-check-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const repo = join(temp, "repo");
  const scripts = join(repo, "scripts");
  mkdirSync(scripts, { recursive: true });
  copyFileSync(
    new URL("./check.mjs", import.meta.url),
    join(scripts, "check.mjs"),
  );
  const git = (...args) => execFileSync("git", args, { cwd: repo });
  git("init", "--quiet");
  git("add", ".");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.org",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  );

  const calls = join(temp, "calls");
  writeFileSync(
    join(temp, "pnpm"),
    `#!/bin/sh
[ "$1 $2" = "exec turbo" ] || exit 1
echo "$3" >> "$TURBO_CALLS"
case "$3" in
  query) echo '{"data":{"packages":{"items":[]},"affectedTasks":{"items":[]}}}' ;;
  run) echo '{"tasks":[]}' ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o755 },
  );
  function check(args, output, expectedCalls) {
    writeFileSync(calls, "");
    const stdout = execFileSync(
      process.execPath,
      ["scripts/check.mjs", "--dry-run", ...args],
      {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: [temp, process.env.PATH].join(delimiter),
          TURBO_CALLS: calls,
        },
      },
    );
    assert.match(stdout, output);
    assert.equal(readFileSync(calls, "utf8"), expectedCalls);
  }
  check([], /No applicable checks/, "");
  check(["--all", "--only", "format"], /Formatting/, "query\nrun\n");
  writeFileSync(join(repo, "guide.md"), "Guide");
  check([], /No applicable checks/, "");
  writeFileSync(join(repo, "example.ts"), "export {};");
  check(["--only", "format"], /Formatting/, "query\nrun\n");
});
