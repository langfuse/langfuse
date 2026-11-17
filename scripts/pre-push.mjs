import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const zero = /^0+$/;
const objectId = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const sourceExtensions = /\.(?:[cm]?[jt]sx?|jsonc?|ya?ml|css|toml|rs)$/;
const authoredSourcePaths = [
  "web/src",
  "worker/src",
  "ee/src",
  ":(glob)packages/*/src/**",
  "ai-gateway/src",
  ":(exclude,glob)**/node_modules/**",
  ":(exclude,glob)**/dist/**",
  ":(exclude,glob)**/build/**",
  ":(exclude,glob)**/.next/**",
  ":(exclude)packages/icons/src/index.ts",
  ":(exclude)packages/icons/src/si.ts",
  ":(exclude)packages/icons/src/tb.ts",
  ":(exclude)packages/icons/src/generated",
  ":(exclude)web/src/workers/generated",
  ":(exclude)packages/langfuse-skills/src/generated",
];

function git(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(`Cannot resolve Git input: git ${args.join(" ")}`);
  }
}

function parsePushUpdates(input) {
  return input
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const fields = line.trim().split(/\s+/);
      if (
        fields.length !== 4 ||
        !objectId.test(fields[1]) ||
        !objectId.test(fields[3])
      )
        throw new Error(
          "Invalid pre-push ref update; refusing an unchecked push.",
        );
      return {
        localRef: fields[0],
        local: fields[1],
        remoteRef: fields[2],
        previous: fields[3],
      };
    });
}

function resolvePreviousCommit(root, remote, previous) {
  if (!zero.test(previous))
    return git(root, ["rev-parse", "--verify", `${previous}^{commit}`]);
  if (!remote || !git(root, ["remote"]).split("\n").includes(remote))
    throw new Error(
      "New branches require a named Git remote (see git remote -v), not a URL. Fetch its default branch and run git remote set-head <remote> --auto before pushing.",
    );
  try {
    const defaultRef = git(root, [
      "symbolic-ref",
      `refs/remotes/${remote}/HEAD`,
    ]);
    return git(root, ["rev-parse", "--verify", `${defaultRef}^{commit}`]);
  } catch {
    const quotedRemote = `'${remote.replaceAll("'", "'\\''")}'`;
    throw new Error(
      `Cannot resolve the local default branch for ${quotedRemote}. Run git fetch ${quotedRemote}, then git remote set-head ${quotedRemote} --auto before pushing a new branch.`,
    );
  }
}

function isAncestor(root, previous, head) {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", previous, head],
    {
      cwd: root,
      stdio: "ignore",
    },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error("Cannot verify pushed commit ancestry; push blocked.");
}

function resolvePushCheck(root, remote, head, update) {
  if (update.remoteRef === "refs/heads/main")
    throw new Error(
      "Push a PR branch. Changes to main must pass the merge queue.",
    );
  if (!update.remoteRef.startsWith("refs/heads/") || zero.test(update.local))
    return null;
  const pushed = git(root, [
    "rev-parse",
    "--verify",
    `${update.local}^{commit}`,
  ]);
  if (pushed !== head)
    throw new Error(
      `Check out ${update.localRef} before pushing it; checks must run against the pushed commit.`,
    );
  const previous = resolvePreviousCommit(root, remote, update.previous);
  const newBranch = zero.test(update.previous);
  if (newBranch) return { base: git(root, ["merge-base", head, previous]) };
  if (previous === head) return null;
  // A rollback's merge base is HEAD, so affected checks would select nothing.
  if (!isAncestor(root, previous, head)) return { all: true };
  return { base: previous };
}

export function resolvePushChecks(root, remote, input) {
  const updates = parsePushUpdates(input);
  const head = git(root, ["rev-parse", "HEAD"]);
  const checks = updates
    .map((update) => resolvePushCheck(root, remote, head, update))
    .filter((check) => check !== null);
  if (checks.some((check) => check.all)) return [{ all: true }];
  const bases = new Set(checks.map((check) => check.base));
  return [...bases].map((base) => ({ base }));
}

function assertTrackedTreeClean(root) {
  const tracked = git(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=no",
  ]);
  if (tracked)
    throw new Error(
      "Commit or stash tracked changes before pushing; checking a different tree could hide a failure in the pushed commit.",
    );
}

function assertNoUntrackedCode(root) {
  const untracked = git(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .split("\0")
    .filter((path) => sourceExtensions.test(path));
  if (untracked.length > 0)
    throw new Error(
      `Untracked code/config can alter checks. Commit or move it before pushing:\n${untracked.join("\n")}`,
    );
}

function assertNoIgnoredSource(root) {
  const ignored = git(root, [
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "-z",
    "--",
    ...authoredSourcePaths,
  ])
    .split("\0")
    .filter((path) => sourceExtensions.test(path));
  if (ignored.length > 0)
    throw new Error(
      `Ignored source can hide missing files in the pushed commit. Commit or move it before pushing:\n${ignored.join("\n")}`,
    );
}

export function assertCheckableTree(root) {
  assertTrackedTreeClean(root);
  assertNoUntrackedCode(root);
  assertNoIgnoredSource(root);
}

function runCheck(root, check) {
  const scope = check.all ? ["--all"] : ["--base", check.base];
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "scripts/check.mjs"),
      ...scope,
      "--only",
      "format,lint,typecheck",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Pre-push checks failed${result.signal ? ` (${result.signal})` : ""}; push blocked.`,
    );
}

function runPushChecks(root, checks) {
  for (const check of checks) runCheck(root, check);
}

export function main(remote, input, root = process.cwd()) {
  const checks = resolvePushChecks(root, remote, input);
  if (checks.length === 0) return;
  assertCheckableTree(root);
  runPushChecks(root, checks);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  const modulePath = fileURLToPath(import.meta.url);
  // A recognized entrypoint must run even if its path disappears after loading.
  if (resolve(process.argv[1]) === modulePath) return true;
  let entryPath;
  try {
    entryPath = realpathSync(process.argv[1]);
  } catch (error) {
    // Eval/import launchers can put non-file arguments in argv[1].
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
  return entryPath === realpathSync(modulePath);
}

if (isMainModule()) {
  try {
    main(process.argv[2], readFileSync(0, "utf8"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
