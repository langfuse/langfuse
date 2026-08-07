import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  extname,
  isAbsolute,
  join,
  matchesGlob,
  relative,
  resolve,
} from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const FORCE_RERUN_TRIGGERS = [
  "**/package.json",
  "**/{vitest,vite}.config.*",
  "**/pnpm-lock.yaml",
  "**/pnpm-workspace.yaml",
  "**/.npmrc",
  "**/.node-version",
  "**/.tool-versions",
  "**/turbo.json",
  "**/tsconfig*.json",
  "**/Dockerfile*",
  "**/docker-compose*.y{a,}ml",
  "**/.github/**",
  "**/.env*.example",
  "**/packages/shared/{prisma,clickhouse}/**",
  "**/packages/shared/scripts/**",
  "**/patches/**",
  "**/scripts/vitest/**",
  "**/vitest-test-db-setup.ts",
];
export const FORCE_FULL_RUN_TRIGGER = "**/.vitest-force-full-run";

async function runGit(root: string, args: string[]) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return stdout;
}

function parseGitPaths(output: string, repositoryRoot: string) {
  return output
    .split("\0")
    .filter(Boolean)
    .map((file) => resolve(repositoryRoot, file));
}

export function addSharedPackageBuildOutputs(
  changedFiles: string[],
  repositoryRoot: string,
  publicBuildEntrypoints: string[] = [],
) {
  const sourceRoot = join(repositoryRoot, "packages/shared/src");
  const buildRoot = join(repositoryRoot, "packages/shared/dist/src");
  const expandedFiles = new Set(changedFiles);
  let sharedSourceChanged = false;

  for (const file of changedFiles) {
    const sourcePath = relative(sourceRoot, file);
    if (
      sourcePath.startsWith("..") ||
      isAbsolute(sourcePath) ||
      ![".ts", ".tsx"].includes(extname(sourcePath))
    ) {
      continue;
    }

    sharedSourceChanged = true;
    expandedFiles.add(join(buildRoot, sourcePath.replace(/\.tsx?$/, ".js")));
  }

  if (sharedSourceChanged) {
    publicBuildEntrypoints.forEach((file) => expandedFiles.add(file));
  }

  return [...expandedFiles];
}

export function addForceFullRunTrigger(
  changedFiles: string[],
  repositoryRoot: string,
) {
  if (
    changedFiles.some((file) =>
      FORCE_RERUN_TRIGGERS.some((pattern) => matchesGlob(file, pattern)),
    )
  ) {
    return [...changedFiles, join(repositoryRoot, ".vitest-force-full-run")];
  }

  return changedFiles;
}

async function getSharedPackageBuildEntrypoints(repositoryRoot: string) {
  const packageRoot = join(repositoryRoot, "packages/shared");
  const packageJson = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  ) as { exports?: Record<string, { import?: string }> };

  return Object.values(packageJson.exports ?? {})
    .map((entry) => entry.import)
    .filter(
      (entry): entry is string =>
        typeof entry === "string" && !entry.includes("*"),
    )
    .map((entry) => resolve(packageRoot, entry));
}

export function createSharedPackageVcsProvider() {
  return {
    async findChangedFiles({
      root,
      changedSince,
    }: {
      root: string;
      changedSince?: string | boolean;
    }) {
      try {
        const repositoryRoot = (
          await runGit(root, ["rev-parse", "--show-toplevel"])
        ).trim();
        const commands = [
          ["diff", "--cached", "--name-only", "-z"],
          ["ls-files", "--others", "--modified", "--exclude-standard", "-z"],
        ];

        if (typeof changedSince === "string") {
          commands.unshift([
            "diff",
            "--name-only",
            "-z",
            `${changedSince}...HEAD`,
          ]);
        }

        const outputs = await Promise.all(
          commands.map((command) => runGit(repositoryRoot, command)),
        );
        const changedFiles = outputs.flatMap((output) =>
          parseGitPaths(output, repositoryRoot),
        );
        const publicBuildEntrypoints =
          await getSharedPackageBuildEntrypoints(repositoryRoot);

        // Consumer tests resolve @langfuse/shared through dist, while Git reports
        // source changes. Add both the mirrored output and public entrypoints;
        // the latter cover CommonJS require calls that Vite cannot traverse.
        return addForceFullRunTrigger(
          addSharedPackageBuildOutputs(
            changedFiles,
            repositoryRoot,
            publicBuildEntrypoints,
          ),
          repositoryRoot,
        );
      } catch (error) {
        console.warn(
          `[vitest-selection] Could not determine changed files; running the full suite. ${String(error)}`,
        );
        return [resolve(root, ".vitest-force-full-run")];
      }
    },
  };
}

export default createSharedPackageVcsProvider();
