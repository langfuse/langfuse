import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertCheckableTree, resolvePushChecks } from "./pre-push.mjs";

test("pre-push validates every advertised ref and the checked tree", () => {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const fixture = mkdtempSync(join(tmpdir(), "langfuse-pre-push-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: fixture,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git("clone", "--shared", "--no-checkout", "--quiet", repository, ".");
    git("sparse-checkout", "set", "--no-cone", "/package.json");
    git("checkout", "--detach", "HEAD");
    const head = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/fixture-base", head);
    git(
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/fixture-base",
    );
    const previous = git("rev-parse", "HEAD^");
    const zero = "0".repeat(head.length);
    const update = (local = head, old = previous, ref = "refs/heads/example") =>
      `refs/heads/example ${local} ${ref} ${old}\n`;
    assert.deepEqual(resolvePushChecks(fixture, "origin", update()), [
      { base: previous },
    ]);
    git("checkout", "--detach", previous);
    assert.deepEqual(
      resolvePushChecks(fixture, "origin", update(previous, head)),
      [{ all: true }],
    );
    assert.throws(
      () =>
        resolvePushChecks(
          fixture,
          "origin",
          update(previous, head) + update(head, previous),
        ),
      /Check out/,
    );
    git("checkout", "--detach", head);
    assert.deepEqual(
      resolvePushChecks(fixture, "origin", update(head, head)),
      [],
    );
    assert.deepEqual(resolvePushChecks(fixture, "origin", update(head, zero)), [
      { base: head },
    ]);
    assert.deepEqual(
      resolvePushChecks(fixture, "origin", update() + update()),
      [{ base: previous }],
    );
    assert.throws(
      () => resolvePushChecks(fixture, "origin", update() + update(previous)),
      /Check out/,
    );
    assert.throws(
      () =>
        resolvePushChecks(
          fixture,
          "origin",
          update(head, "f".repeat(head.length)),
        ),
      /Cannot resolve/,
    );
    assert.throws(
      () => resolvePushChecks(fixture, "missing", update(head, zero)),
      /named Git remote/,
    );
    assert.throws(
      () =>
        resolvePushChecks(
          fixture,
          "https://github.com/example/repository.git",
          update(head, zero),
        ),
      /named Git remote.*not a URL/,
    );
    git("remote", "add", "upstream", repository);
    assert.throws(
      () => resolvePushChecks(fixture, "upstream", update(head, zero)),
      /git fetch 'upstream'.*git remote set-head 'upstream' --auto/,
    );
    assert.throws(
      () =>
        resolvePushChecks(
          fixture,
          "origin",
          update(zero, previous, "refs/heads/main"),
        ),
      /merge queue/,
    );
    assert.throws(
      () => resolvePushChecks(fixture, "origin", "invalid update\n"),
      /Invalid pre-push/,
    );
    assert.deepEqual(resolvePushChecks(fixture, "origin", update(zero)), []);
    for (const ref of ["refs/tags/old-release", "refs/notes/commits"]) {
      assert.deepEqual(
        resolvePushChecks(
          fixture,
          "origin",
          `${ref} ${previous} ${ref} ${zero}\n`,
        ),
        [],
      );
    }
    assertCheckableTree(fixture);
    writeFileSync(join(fixture, "notes.md"), "Unrelated notes\n");
    assertCheckableTree(fixture);
    writeFileSync(
      join(fixture, "probe.ts"),
      "export const value: number = 'invalid';\n",
    );
    assert.throws(() => assertCheckableTree(fixture), /Untracked code/);
    rmSync(join(fixture, "probe.ts"));
    writeFileSync(
      join(fixture, ".git/info/exclude"),
      "*.local.*\n.env\nnode_modules/\ndist/\ngenerated/\n",
    );
    mkdirSync(join(fixture, "web/src"), { recursive: true });
    writeFileSync(
      join(fixture, "web/src/helper.local.ts"),
      "export const value = 1;\n",
    );
    assert.throws(() => assertCheckableTree(fixture), /Ignored source/);
    rmSync(join(fixture, "web/src/helper.local.ts"));
    for (const path of [
      ".env",
      "node_modules/example/index.js",
      "web/src/node_modules/example/index.js",
      "packages/shared/dist/index.js",
      "packages/shared/prisma/generated/index.ts",
      "packages/icons/src/generated/icon.ts",
      "web/src/workers/generated/worker.ts",
    ]) {
      mkdirSync(dirname(join(fixture, path)), { recursive: true });
      writeFileSync(join(fixture, path), "local artifact\n");
    }
    assertCheckableTree(fixture);
    writeFileSync(join(fixture, "package.json"), "{}\n");
    assert.throws(() => assertCheckableTree(fixture), /different tree/);
    const source = resolve(repository, "scripts/pre-push.mjs");
    const alias = join(fixture, "pre-push.mjs");
    symlinkSync(source, alias);
    for (const flags of [[], ["--preserve-symlinks-main"]]) {
      const invalid = spawnSync(process.execPath, [...flags, alias], {
        cwd: fixture,
        input: "invalid update\n",
        encoding: "utf8",
      });
      assert.equal(invalid.status, 1, invalid.stderr);
      assert.match(invalid.stderr, /Invalid pre-push/);
    }
    const importHook = `await import(${JSON.stringify(pathToFileURL(source).href)}); console.log("imported");`;
    for (const launcher of [
      join(fixture, "missing"),
      join(alias, "child"),
      fixture,
    ]) {
      const imported = spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", importHook, launcher],
        { encoding: "utf8" },
      );
      assert.equal(imported.status, 0, imported.stderr);
      assert.match(imported.stdout, /imported/);
    }
    const loop = join(fixture, "loop");
    symlinkSync(loop, loop);
    const invalidLauncher = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", importHook, loop],
      { encoding: "utf8" },
    );
    assert.equal(invalidLauncher.status, 1, invalidLauncher.stderr);
    assert.match(invalidLauncher.stderr, /ELOOP/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
