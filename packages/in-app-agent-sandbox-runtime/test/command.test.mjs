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
        "setsid sh -c 'touch escaped-descendant-started; sleep 0.5; touch escaped-descendant-survived' & wait",
        250,
        "timeout-test",
        cwd,
      );

      assert.equal(result.exitCode, 124);
      assert.match(result.stderr, /timed out after 250ms/);
      await access(path.join(cwd, "escaped-descendant-started"));

      await new Promise((resolve) => setTimeout(resolve, 400));
      await assert.rejects(
        access(path.join(cwd, "escaped-descendant-survived")),
        (error) => error?.code === "ENOENT",
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
