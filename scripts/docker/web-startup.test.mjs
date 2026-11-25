import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dockerfile = readFileSync(
  new URL("../../web/Dockerfile", import.meta.url),
  "utf8",
);
const command = dockerfile
  .match(/^CMD (?:.*\\\n)*.*$/m)?.[0]
  .slice(4)
  .replaceAll("\\\n", "\n");
assert.ok(command, "web Dockerfile must contain a startup command");

for (const cloudRegion of ["", "us"]) {
  test(`web startup replaces its shell with Node (cloud region: ${cloudRegion || "unset"})`, () => {
    const directory = mkdtempSync(join(tmpdir(), "langfuse-web-startup-"));
    try {
      const node = join(directory, "node");
      writeFileSync(node, '#!/bin/sh\nprintf "%s %s\\n" "$PPID" "$$"\n');
      chmodSync(node, 0o755);
      const result = spawnSync("bash", ["-c", command], {
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: cloudRegion,
        },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      const [parent, nodePid] = result.stdout.trim().split(" ");
      assert.equal(
        parent,
        String(process.pid),
        `Node ${nodePid} remained a child of the startup shell`,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
