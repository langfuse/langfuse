import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCommand } from "../dist/command.js";

test(
  "terminates the complete process tree when a command times out",
  { skip: process.platform === "win32" },
  async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "sandbox-command-"));

    try {
      const result = await runCommand(
        "(sleep 0.2; touch descendant-survived) & wait",
        50,
        "timeout-test",
        cwd,
      );

      assert.equal(result.exitCode, 124);
      assert.match(result.stderr, /timed out after 50ms/);

      await new Promise((resolve) => setTimeout(resolve, 300));
      await assert.rejects(
        access(path.join(cwd, "descendant-survived")),
        (error) => error?.code === "ENOENT",
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
