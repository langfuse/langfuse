import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ALL_VERSION_FILES,
  JSON_VERSION_FILES,
  TS_VERSION_FILES,
  bumpReleaseVersion,
  computeNextVersion,
  readRepoVersion,
} from "./bump-release-version.mjs";

function createFixtureRepo(version = "4.88.0") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lf-release-bump-"));
  for (const rel of JSON_VERSION_FILES) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(
      full,
      `${JSON.stringify({ name: rel, version }, null, 2)}\n`,
      "utf8",
    );
  }
  for (const rel of TS_VERSION_FILES) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `export const VERSION = "v${version}";\n`, "utf8");
  }
  return dir;
}

test("computeNextVersion handles patch, minor, major, and custom prereleases", () => {
  assert.deepEqual(computeNextVersion("4.88.0", "patch"), {
    currentVersion: "4.88.0",
    nextVersion: "4.88.1",
    tagName: "v4.88.1",
    isMajorBump: false,
    isPrerelease: false,
  });

  assert.deepEqual(computeNextVersion("4.88.2", "minor"), {
    currentVersion: "4.88.2",
    nextVersion: "4.89.0",
    tagName: "v4.89.0",
    isMajorBump: false,
    isPrerelease: false,
  });

  assert.deepEqual(computeNextVersion("4.88.2", "major"), {
    currentVersion: "4.88.2",
    nextVersion: "5.0.0",
    tagName: "v5.0.0",
    isMajorBump: true,
    isPrerelease: false,
  });

  assert.deepEqual(computeNextVersion("4.88.0", "custom", "v4.89.0-rc.1"), {
    currentVersion: "4.88.0",
    nextVersion: "4.89.0-rc.1",
    tagName: "v4.89.0-rc.1",
    isMajorBump: false,
    isPrerelease: true,
  });

  assert.equal(
    computeNextVersion("4.89.0-rc.1", "patch").nextVersion,
    "4.89.0",
  );
  assert.equal(
    computeNextVersion("4.89.0-rc.1", "minor").nextVersion,
    "4.89.0",
  );
  assert.equal(
    computeNextVersion("4.89.1-rc.1", "minor").nextVersion,
    "4.90.0",
  );
  assert.equal(computeNextVersion("5.0.0-rc.1", "major").nextVersion, "5.0.0");
  assert.equal(computeNextVersion("5.1.0-rc.1", "major").nextVersion, "6.0.0");
});

test("computeNextVersion rejects non-increasing and malformed versions", () => {
  assert.throws(
    () => computeNextVersion("4.88.0", "custom", "4.88.0"),
    /strictly greater/,
  );
  assert.throws(
    () => computeNextVersion("4.88.0", "custom", "4.87.9"),
    /strictly greater/,
  );
  assert.throws(
    () => computeNextVersion("4.88.0", "custom", "4.88.0-rc.1"),
    /strictly greater/,
  );
  assert.throws(
    () => computeNextVersion("4.88.0", "custom", "4.089.0"),
    /Invalid semantic/,
  );
  assert.throws(
    () => computeNextVersion("4.88.0", "custom", "4.89.00"),
    /Invalid semantic/,
  );
  assert.throws(
    () => computeNextVersion("4.88.0", "custom", "04.89.0"),
    /Invalid semantic/,
  );
  assert.throws(
    () => computeNextVersion("4.88.0", "custom", "not-a-version"),
    /Invalid semantic/,
  );
  assert.throws(
    () => computeNextVersion("4.88.0", "custom", ""),
    /custom_version is required/,
  );
});

test("bumpReleaseVersion updates all six tracked files and preserves dry-run immutability", () => {
  const dir = createFixtureRepo("4.88.0");
  try {
    const dry = bumpReleaseVersion({
      rootDir: dir,
      bump: "minor",
      dryRun: true,
    });
    assert.equal(dry.nextVersion, "4.89.0");
    assert.equal(readRepoVersion(dir), "4.88.0");

    const applied = bumpReleaseVersion({
      rootDir: dir,
      bump: "minor",
      dryRun: false,
    });
    assert.equal(applied.nextVersion, "4.89.0");
    assert.equal(applied.files.length, ALL_VERSION_FILES.length);
    assert.equal(readRepoVersion(dir), "4.89.0");

    for (const rel of TS_VERSION_FILES) {
      assert.equal(
        fs.readFileSync(path.join(dir, rel), "utf8"),
        'export const VERSION = "v4.89.0";\n',
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readRepoVersion fails loudly when tracked files drift", () => {
  const dir = createFixtureRepo("4.88.0");
  try {
    fs.writeFileSync(
      path.join(dir, "worker/src/constants/VERSION.ts"),
      'export const VERSION = "v4.87.0";\n',
      "utf8",
    );
    assert.throws(
      () => readRepoVersion(dir),
      /Version mismatch across tracked release files/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
