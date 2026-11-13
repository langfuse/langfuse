import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Cargo validation uses fixed commands and preserves the wrapper boundary", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cargo-security-")));
  const install = join(root, "install");
  const workspace = join(root, "workspace");
  const cargoHome = join(root, "cargo-home");
  const wrapper = join(install, "cargo-security");
  try {
    mkdirSync(join(install, "cwd"), { recursive: true });
    mkdirSync(workspace);
    copyFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "cargo-security.sh"),
      wrapper,
    );
    for (const slug of ["ai-gateway", "native"]) {
      const bin = join(install, "toolchains", slug);
      mkdirSync(bin, { recursive: true });
      // Record the actual process boundary without compiling or downloading crates.
      writeFileSync(
        join(bin, "cargo"),
        `#!/usr/bin/env bash
printf '%s\\0' "$0" "$PWD" "\${CARGO_ENCODED_RUSTFLAGS-unset}" "\${GH_TOKEN-unset}" "$@"
`,
      );
      chmodSync(join(bin, "cargo"), 0o755);
    }
    const run = (...args) =>
      spawnSync("bash", [wrapper, ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_WORKSPACE: workspace,
          CARGO_SECURITY_CARGO_HOME: cargoHome,
          CARGO_ENCODED_RUSTFLAGS: "must-not-reach-cargo",
          GH_TOKEN: "test-token-must-not-reach-cargo",
        },
      });
    const expectCommand = (args, crateDir, expected) => {
      const result = run(...args);
      assert.equal(result.status, 0, result.stderr);
      const slug = crateDir === "ai-gateway" ? "ai-gateway" : "native";
      assert.deepEqual(result.stdout.split("\0").slice(0, -1), [
        join(install, "toolchains", slug, "cargo"),
        join(install, "cwd"),
        "unset",
        "unset",
        ...expected,
      ]);
    };
    for (const crateDir of ["ai-gateway", "packages/native"]) {
      const manifest = join(workspace, crateDir, "Cargo.toml");
      expectCommand(["check", crateDir], crateDir, [
        "check",
        "--manifest-path",
        manifest,
        "--locked",
        "--all-targets",
      ]);
      expectCommand(["test", crateDir], crateDir, [
        "test",
        "--manifest-path",
        manifest,
        "--locked",
        ...(crateDir === "packages/native"
          ? ["--features", "napi/dyn-symbols"]
          : []),
      ]);
      expectCommand(["fmt", crateDir], crateDir, [
        "fmt",
        "--manifest-path",
        manifest,
        "--all",
        "--",
        "--check",
      ]);
    }
    expectCommand(
      ["update", "ai-gateway", "serde@1.0.1", "1.0.2"],
      "ai-gateway",
      [
        "update",
        "--manifest-path",
        join(workspace, "ai-gateway", "Cargo.toml"),
        "--package",
        "serde@1.0.1",
        "--precise",
        "1.0.2",
      ],
    );
    expectCommand(["tree", "packages/native", "serde"], "packages/native", [
      "tree",
      "--manifest-path",
      join(workspace, "packages/native", "Cargo.toml"),
      "--locked",
      "--target",
      "all",
      "--invert",
      "serde",
    ]);
    for (const args of [
      ["check", "ai-gateway", "--config", "dangerous=true"],
      ["test", "packages/native", "--features", "other"],
      ["fmt", "ai-gateway", "--", "--emit", "stdout"],
      ["check", "../outside"],
      ["test", "--manifest-path=other/Cargo.toml"],
      ["check"],
    ]) {
      const result = run(...args);
      assert.equal(result.status, 2, JSON.stringify(args));
      assert.equal(
        result.stdout,
        "",
        "invalid commands must not execute cargo",
      );
    }
    writeFileSync(join(cargoHome, "config.toml"), "[build]\nrustflags = []\n");
    let result = run("check", "ai-gateway");
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /unexpected entry in CARGO_HOME/);
    rmSync(join(cargoHome, "config.toml"));
    mkdirSync(join(install, "cwd", ".cargo"));
    writeFileSync(
      join(install, "cwd", ".cargo", "config.toml"),
      "[build]\nrustflags = []\n",
    );
    result = run("test", "packages/native");
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /unexpected Cargo config/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
