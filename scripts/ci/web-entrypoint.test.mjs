import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("web startup stops when Postgres migration cleanup fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "web-entrypoint-"));
  try {
    const calls = join(dir, "calls");
    writeFileSync(
      join(dir, "prisma"),
      `#!/bin/sh
printf '%s %s\\n' "$1" "$2" >> "$CALLS"
if [ "$1 $2" = "db execute" ]; then
    exit 17
fi
exit 0
`,
      { mode: 0o755 },
    );

    const result = spawnSync(
      "/bin/sh",
      [
        fileURLToPath(new URL("../../web/entrypoint.sh", import.meta.url)),
        "/bin/sh",
        "-c",
        'printf "app started\\n" >> "$CALLS"',
      ],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 5000,
        env: {
          PATH: dir,
          CALLS: calls,
          DATABASE_URL: "postgresql://synthetic:synthetic@localhost/synthetic",
          CLICKHOUSE_URL: "http://localhost:8123",
          LANGFUSE_AUTO_CLICKHOUSE_MIGRATION_DISABLED: "true",
        },
      },
    );

    assert.ifError(result.error);
    assert.equal(result.status, 17, result.stdout + result.stderr);
    assert.equal(readFileSync(calls, "utf8"), "db execute\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
