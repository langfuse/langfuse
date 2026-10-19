import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Local development checks, not a replacement for CI: Storybook/browser,
 * Playwright, Docker sandbox, and deployed-service e2e suites are excluded.
 * Integration suites need configured .env/.env.test and local infrastructure.
 * This command does not provision services or reset databases; selected tests
 * can still run their own setup hooks. See --help for modes and options.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseOptions(args) {
  const options = {
    branch: false,
    base: "origin/main",
    all: false,
    dryRun: false,
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--branch") options.branch = true;
    else if (arg === "--all") options.all = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--base") {
      const base = args[++index];
      if (!base || base.startsWith("-"))
        throw new Error("--base requires a Git ref");
      options.base = base;
      options.branch = true;
    } else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout;
}

export function collectChanges(git, base) {
  const paths = new Set();
  // Separate diffs retain staged changes even if the working tree undoes them.
  for (const args of [
    ["diff", "--name-only", "--no-renames", "-z", base, "HEAD", "--"],
    ["diff", "--name-only", "--no-renames", "-z", "--cached", "--"],
    ["diff", "--name-only", "--no-renames", "-z", "--"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ]) {
    for (const path of git(args).split("\0").filter(Boolean)) paths.add(path);
  }
  return [...paths].sort();
}

export function createPlan(
  files,
  packages,
  options,
  base,
  taskGraph,
  exists = existsSync,
) {
  const commands = [];
  if (!options.all && files.length === 0) return commands;
  const codeFiles = files.filter(
    (file) => !/\.(md|mdx|png|jpg|jpeg|svg|gif|ico)$/.test(file),
  );
  if (!options.all && codeFiles.length === 0) return commands;

  const owner = (file) =>
    packages.find((pkg) => file.startsWith(`${pkg.path}/`));
  // Turbo inputs select checks, including consumers of files outside packages.
  // Retain policy fallbacks for toolchain changes and unknown root resources;
  // skipping metadata here does not validate workflow/editor configuration.
  let broad = options.all;
  let jsToolchainChanged = false;
  const direct = new Set();
  const fullRoots = new Set();
  const analysisFiles = [];
  for (const file of codeFiles) {
    const pkg = owner(file);
    if (pkg) {
      direct.add(pkg.name);
      analysisFiles.push(file);
      // Enterprise source aliases are not all declared workspace dependencies.
      if (file.startsWith("ee/")) broad = true;
      continue;
    }
    if (
      /^(\.github|\.vscode|\.cursor)\//.test(file) ||
      /^scripts\/check\.(mjs|test\.mjs)$/.test(file)
    )
      continue;
    if (
      /^(prettier\.config\.[cm]?js|\.prettierrc(?:\.[^/]+)?|\.prettierignore|\.editorconfig)$/.test(
        file,
      )
    ) {
      // Consumer tasks declare formatting configuration in their Turbo inputs.
      continue;
    }
    analysisFiles.push(file);
    if (/^knip\.[^/]+$/.test(file)) continue;
    if (
      /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.nvmrc|tsconfig(?:\.[^/]+)?\.json|eslint\.config\.[cm]?js|vitest\.workspace\.[cm]?[jt]s)$/.test(
        file,
      ) ||
      file.startsWith("patches/")
    ) {
      jsToolchainChanged = true;
      for (const consumer of packages) {
        // These packages expose Cargo tasks through pnpm, not JS/TS checks.
        if (
          consumer.path !== "ai-gateway" &&
          consumer.path !== "packages/native"
        )
          fullRoots.add(consumer.name);
      }
      continue;
    }
    if (taskGraph.inputs.has(file)) continue;
    // New root files remain conservative until their consumers are mapped.
    broad = true;
  }
  // Turbo supplies transitive dependents, including dev dependencies, rather
  // than maintaining a second package graph from manifest dependency fields.
  const fullPackages = new Set(
    packages
      .filter((pkg) => fullRoots.has(pkg.name))
      .flatMap((pkg) => [pkg.name, ...pkg.dependents]),
  );
  const affected = new Set([
    ...direct,
    ...fullPackages,
    ...[...taskGraph.affected].map((task) =>
      task.slice(0, task.lastIndexOf("#")),
    ),
  ]);

  const add = (label, args) => commands.push({ label, args });
  const targets = new Set();
  const schedule = (task, names) => {
    for (const name of names) targets.add(`${name}#${task}`);
  };
  const isSelected = (pkg, task) => {
    if (!pkg.scripts[task]) return false;
    if (broad) return true;
    if (
      jsToolchainChanged &&
      (pkg.path === "ai-gateway" || pkg.path === "packages/native") &&
      !direct.has(pkg.name)
    )
      return false;
    return (
      fullPackages.has(pkg.name) ||
      taskGraph.affected.has(`${pkg.name}#${task}`)
    );
  };
  const prepare = (taskId) => {
    const task = taskGraph.tasks.get(taskId);
    if (!task) throw new Error(`Missing Turbo task graph for ${taskId}`);
    for (const dependency of task.dependencies) {
      // Related suites need build/generation prerequisites, not upstream suites.
      if (dependency.endsWith("#test") || dependency.endsWith("#test-client"))
        continue;
      targets.add(dependency);
    }
  };
  const selected = packages.filter((pkg) =>
    ["typecheck", "lint", "test", "test-client"].some((task) =>
      isSelected(pkg, task),
    ),
  );
  // File-only TypeScript checks miss downstream errors. Keep project-wide
  // incremental checks and let Turbo run prerequisite builds/code generation;
  // those prerequisites can compile native code even without Rust checks.
  schedule(
    "typecheck",
    selected
      .filter((pkg) => isSelected(pkg, "typecheck"))
      .map((pkg) => pkg.name),
  );

  const fullLint = [];
  for (const pkg of selected) {
    if (!isSelected(pkg, "lint")) continue;
    const ownFiles = codeFiles.filter((file) => owner(file)?.name === pkg.name);
    const sourceOnly =
      ownFiles.length > 0 &&
      ownFiles.every(
        (file) =>
          file.startsWith(`${pkg.path}/src/`) &&
          /\.[cm]?[jt]sx?$/.test(file) &&
          exists(resolve(root, file)),
      );
    const externalInputChanged = codeFiles.some(
      (file) =>
        !file.startsWith(`${pkg.path}/`) &&
        taskGraph.tasks.get(`${pkg.name}#lint`).inputFiles.has(file),
    );
    if (
      !broad &&
      direct.has(pkg.name) &&
      !fullPackages.has(pkg.name) &&
      !pkg.dependencies.some((dependency) => affected.has(dependency)) &&
      !externalInputChanged &&
      sourceOnly &&
      pkg.scripts.lint.includes("eslint")
    ) {
      // ESLint caches individual files. Prepare via the shared Turbo run, then
      // pass package-specific paths without forwarding them to other tasks.
      prepare(`${pkg.name}#lint`);
      commands.push({
        label: `lint (${pkg.name})`,
        args: [
          "--filter",
          pkg.name,
          "run",
          "lint",
          ...ownFiles.map((file) => `./${relative(pkg.path, file)}`),
        ],
        requiresTurbo: true,
      });
    } else fullLint.push(pkg.name);
  }
  schedule("lint", fullLint);

  const fullTests = [];
  const clientTests = [];
  for (const pkg of selected) {
    const tests = ["test", "test-client"].filter((task) =>
      isSelected(pkg, task),
    );
    if (!tests.length) continue;
    const ownFiles = codeFiles.filter((file) => owner(file)?.name === pkg.name);
    const dependencyChanged = pkg.dependencies.some((dependency) =>
      affected.has(dependency),
    );
    const sourceOnly =
      ownFiles.length > 0 &&
      ownFiles.every(
        (file) =>
          file.startsWith(`${pkg.path}/src/`) &&
          /\.[cm]?[jt]sx?$/.test(file) &&
          exists(resolve(root, file)),
      );
    const externalInputChanged = codeFiles.some(
      (file) =>
        !file.startsWith(`${pkg.path}/`) &&
        tests.some((task) =>
          taskGraph.tasks.get(`${pkg.name}#${task}`).inputFiles.has(file),
        ),
    );
    // Import-based selection cannot discover computed imports or runtime file
    // reads. Use --all when changing resources whose consumers are unknown.
    const related =
      !broad &&
      direct.has(pkg.name) &&
      !fullPackages.has(pkg.name) &&
      !dependencyChanged &&
      !externalInputChanged &&
      sourceOnly &&
      tests.every((task) => pkg.scripts[task].includes("vitest"));
    if (related) {
      // Git-dependent selection must not populate full-suite caches. Only the
      // existing package test scripts receive Vitest flags, never prerequisites.
      const steps = tests.map((task) => {
        prepare(`${pkg.name}#${task}`);
        return [
          "--filter",
          pkg.name,
          "run",
          task,
          "--changed",
          base,
          "--passWithNoTests",
        ];
      });
      commands.push({
        label: `related tests (${pkg.name})`,
        steps,
        requiresTurbo: true,
      });
    } else {
      if (tests.includes("test")) fullTests.push(pkg.name);
      if (tests.includes("test-client")) clientTests.push(pkg.name);
    }
  }
  schedule("test", fullTests);
  schedule("test-client", clientTests);
  if (targets.size) {
    // One graph lets Turbo deduplicate prerequisite work and schedule compatible
    // checks concurrently. File-specific commands wait for successful preparation.
    commands.unshift({
      label: "Turbo checks and prerequisites",
      args: [
        "exec",
        "turbo",
        "run",
        ...targets,
        "--continue=dependencies-successful",
      ],
      isTurboBatch: true,
    });
  }

  const formatted = files.filter(
    (file) =>
      /\.(js|jsx|ts|tsx|css)$/.test(file) && exists(resolve(root, file)),
  );
  if (
    options.all ||
    codeFiles.some((file) => /prettier|(^|\/)\.editorconfig$/.test(file))
  )
    add("format", ["run", "format:check"]);
  else if (formatted.length)
    add("format", [
      "exec",
      "prettier",
      "--check",
      "--",
      ...formatted.map((file) => `./${file}`),
    ]);
  if (
    options.all ||
    analysisFiles.some((file) =>
      /\.[cm]?[jt]sx?$|\.jsonc?$|\.ya?ml$|knip\./.test(file),
    )
  ) {
    // Removing an import can orphan an unchanged export anywhere in the graph,
    // so Knip must analyze the repository rather than just changed files.
    add("knip", ["exec", "knip"]);
  }
  if (
    options.all ||
    files.some(
      (file) =>
        file === "package.json" ||
        file === "turbo.json" ||
        file.endsWith("/turbo.json") ||
        file.startsWith("scripts/check."),
    )
  ) {
    add("check command tests", ["run", "test:check-command"]);
  }
  if (
    options.all ||
    files.some((file) =>
      /^scripts\/vitest\/ci-reporter\.(ts|test\.mjs)$/.test(file),
    )
  ) {
    add("Vitest reporter tests", [
      "exec",
      "node",
      "--test",
      "scripts/vitest/ci-reporter.test.mjs",
    ]);
  }
  return commands;
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: pnpm check [--branch] [--base <ref>] [--all] [--dry-run]\n\nDefault: staged, unstaged, and untracked changes.\n--branch: changes since merge-base with origin/main, plus local changes.\n--base: override branch target (implies --branch).\n--all: check every package.\n--dry-run: print checks without running them.",
    );
    return;
  }
  const git = (args) => capture("git", args);
  // Compare branch work to the common ancestor, not the target branch's tip.
  // Callers must fetch stale remote refs; missing refs deliberately fail rather
  // than falling back to a comparison that could silently miss changes.
  const base = options.branch
    ? git(["merge-base", "HEAD", options.base]).trim()
    : git(["rev-parse", "HEAD"]).trim();
  const files = collectChanges(git, base);
  console.log(
    `Checking ${options.all ? "all packages" : options.branch ? `branch against ${options.base}` : "local changes"} (${files.length} changed files)`,
  );
  const workspace = JSON.parse(
    capture("pnpm", [
      "exec",
      "turbo",
      "query",
      `query {
        packages { items { name path directDependencies { items { name } } allDependents { items { name } } } }
        affectedTasks(base: ${JSON.stringify(base)}, head: "HEAD", tasks: ["typecheck", "lint", "test", "test-client"]) {
          items { fullName name command reason {
            __typename
            ... on TaskAllChanged { description }
            ... on TaskFileChanged { filePath }
          } }
        }
      }`,
    ]),
  );
  if (workspace.errors?.length) {
    throw new Error(
      `Turbo package graph query failed: ${workspace.errors.map((error) => error.message).join("; ")}`,
    );
  }
  const packages = workspace.data.packages.items
    // Turbo includes its synthetic workspace root; it is not a check target.
    .filter((pkg) => pkg.name !== "//")
    .map((pkg) => {
      const manifest = JSON.parse(
        readFileSync(resolve(root, pkg.path, "package.json"), "utf8"),
      );
      return {
        name: pkg.name,
        path: pkg.path,
        scripts: manifest.scripts ?? {},
        dependencies: pkg.directDependencies.items
          .filter((dependency) => dependency.name !== "//")
          .map((dependency) => dependency.name),
        dependents: pkg.allDependents.items.map((dependent) => dependent.name),
      };
    })
    .sort((a, b) => b.path.length - a.path.length);
  const dryRun = JSON.parse(
    capture("pnpm", [
      "exec",
      "turbo",
      "run",
      "typecheck",
      "lint",
      "test",
      "test-client",
      "--dry=json",
    ]),
  );
  const taskGraph = {
    affected: new Set(),
    tasks: new Map(),
    inputs: new Set(),
  };
  for (const task of dryRun.tasks) {
    const inputFiles = new Set(
      Object.keys(task.inputs).map((file) =>
        relative(root, resolve(root, task.directory, file)),
      ),
    );
    taskGraph.tasks.set(task.taskId, { ...task, inputFiles });
    for (const file of inputFiles) taskGraph.inputs.add(file);
  }
  for (const task of workspace.data.affectedTasks.items) {
    // Turbo 2.11 includes runnable prerequisites in this collection, labelled
    // with this synthetic reason. Select affected checks, not those prerequisites;
    // execution still follows their normal Turbo dependency edges.
    if (
      task.reason.__typename === "TaskAllChanged" &&
      task.reason.description === "required by an affected task"
    )
      continue;
    if (task.reason.__typename === "TaskFileChanged") {
      // Deleted files are absent from live dry-run inputs but still affect tasks.
      taskGraph.inputs.add(task.reason.filePath);
      taskGraph.tasks.get(task.fullName)?.inputFiles.add(task.reason.filePath);
    }
    if (
      task.command &&
      ["typecheck", "lint", "test", "test-client"].includes(task.name)
    ) {
      taskGraph.affected.add(task.fullName);
    }
  }
  const plan = createPlan(files, packages, options, base, taskGraph);
  if (!plan.length) {
    console.log("No applicable checks.");
    return;
  }
  const failed = [];
  let turboFailed = false;
  for (const { label, args, steps, requiresTurbo, isTurboBatch } of plan) {
    if (requiresTurbo && turboFailed) {
      console.error(
        `\nSkipped ${label}: the shared Turbo check/preparation run failed.`,
      );
      failed.push(label);
      continue;
    }
    for (const command of steps ?? [args]) {
      console.log(
        `\n${label}: pnpm ${command.map((arg) => JSON.stringify(arg)).join(" ")}`,
      );
      if (options.dryRun) continue;
      const result = spawnSync("pnpm", command, {
        cwd: root,
        stdio: "inherit",
      });
      if (result.error) console.error(result.error.message);
      if (result.signal) {
        process.exitCode = 1;
        return;
      }
      if (result.status !== 0) {
        failed.push(label);
        if (isTurboBatch) turboFailed = true;
        // Do not run a suite whose prerequisite generation/build failed.
        break;
      }
    }
  }
  if (options.dryRun) return;
  if (failed.length) {
    console.error(
      `\nFailed: ${failed.join(", ")}. Integration tests may require .env/.env.test and local PostgreSQL, ClickHouse, Redis, and S3 services; see docker-compose.dev.yml. No services were started automatically.`,
    );
    process.exitCode = 1;
  } else console.log("\nAll selected checks passed.");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
