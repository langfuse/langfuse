import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

/**
 * Local development checks, not a replacement for CI: standalone Playwright,
 * Docker sandbox, and deployed-service e2e suites are excluded.
 * Storybook tests require installed Playwright Chromium browser binaries.
 * Integration suites need configured .env/.env.test and local infrastructure.
 * This command does not provision services or reset databases; selected tests
 * can still run their own setup hooks. See --help for modes and options.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function createOutput(
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
) {
  const terminal = Boolean(stdout.isTTY && stderr.isTTY && env.TERM !== "dumb");
  let color = terminal;
  if (Object.hasOwn(env, "NO_COLOR") || env.TERM === "dumb") color = false;
  else if (Object.hasOwn(env, "FORCE_COLOR")) color = env.FORCE_COLOR !== "0";
  else if (stdout.hasColors && stderr.hasColors)
    color = terminal && stdout.hasColors() && stderr.hasColors();
  // Children write to log files, so their TTY detection cannot see our terminal.
  const childEnv = {
    ...env,
    FORCE_COLOR: color ? (env.FORCE_COLOR ?? "1") : "0",
  };
  if (color) delete childEnv.NO_COLOR;
  else childEnv.NO_COLOR = "1";
  return {
    terminal,
    childEnv,
    paint: (code, text) =>
      color ? `\x1b[${code}m${text}\x1b[0m` : stripVTControlCharacters(text),
    indent: (text) =>
      (color ? text : stripVTControlCharacters(text))
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
  };
}

const checkTasks = [
  { name: "typecheck", label: "Types" },
  { name: "lint", label: "Lint", runner: "eslint" },
  {
    name: "test",
    label: "Tests",
    runner: "vitest",
    suite: "server",
    suiteLabel: "Server",
  },
  {
    name: "test-client",
    label: "Tests",
    runner: "vitest",
    suite: "client",
    suiteLabel: "Client",
  },
  {
    name: "test-storybook",
    label: "Tests",
    runner: "vitest",
    suite: "storybook",
    suiteLabel: "Storybook",
  },
];

const components = ["format", "typecheck", "lint", "knip", "tests"];

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
    else if (["--only", "-o", "--skip", "-s"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("-"))
        throw new Error(`${arg} requires a comma-separated list of checks`);
      const names = value.split(",");
      for (const name of names) {
        if (!components.includes(name))
          throw new Error(
            `Unknown check: ${JSON.stringify(name)}. Choose from: ${components.join(", ")}`,
          );
      }
      const key = arg === "--only" || arg === "-o" ? "only" : "skip";
      options[key] = [...new Set([...(options[key] ?? []), ...names])];
    } else if (arg === "--base") {
      const base = args[++index];
      if (!base || base.startsWith("-"))
        throw new Error("--base requires a Git ref");
      options.base = base;
      options.branch = true;
    } else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.only && options.skip)
    throw new Error("--only and --skip cannot be combined");
  return options;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: createOutput({ ...process.env, NO_COLOR: "1" }).childEnv,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (command === "pnpm" && args.includes("turbo")) {
      mkdirSync(resolve(root, ".turbo"), { recursive: true });
      const logFile = resolve(root, ".turbo/check-planning.log");
      writeFileSync(logFile, `${result.stdout ?? ""}${result.stderr ?? ""}`, {
        mode: 0o600,
      });
      throw new Error(
        `Unable to plan checks. Task-runner details: ${relative(root, logFile)}`,
      );
    }
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
  const checks = new Set(
    (options.only ?? components).filter(
      (name) => !options.skip?.includes(name),
    ),
  );
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

  const packageChecks = [];
  const targets = new Set();
  const schedule = (task, names) => {
    for (const name of names) targets.add(`${name}#${task}`);
  };
  const isSelected = (pkg, task) => {
    const component = checkTasks.find((check) => check.name === task)?.suite
      ? "tests"
      : task;
    if (!checks.has(component)) return false;
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
      if (
        checkTasks.some(
          (task) => task.suite && dependency.endsWith(`#${task.name}`),
        )
      )
        continue;
      targets.add(dependency);
    }
  };
  const selected = packages.flatMap((pkg) => {
    const tasks = checkTasks.filter((task) => isSelected(pkg, task.name));
    if (!tasks.length) return [];
    const ownFiles = codeFiles.filter((file) => owner(file)?.name === pkg.name);
    const sourceOnly =
      ownFiles.length > 0 &&
      ownFiles.every(
        (file) =>
          file.startsWith(`${pkg.path}/src/`) &&
          /\.[cm]?[jt]sx?$/.test(file) &&
          exists(resolve(root, file)),
      );
    const dependencyChanged = pkg.dependencies.some((dependency) =>
      affected.has(dependency),
    );
    return [
      {
        pkg,
        tasks,
        ownFiles,
        canNarrow:
          !broad &&
          direct.has(pkg.name) &&
          !fullPackages.has(pkg.name) &&
          !dependencyChanged &&
          sourceOnly,
        externalTasks: new Set(
          tasks
            .filter((task) =>
              codeFiles.some(
                (file) =>
                  !file.startsWith(`${pkg.path}/`) &&
                  taskGraph.tasks
                    .get(`${pkg.name}#${task.name}`)
                    .inputFiles.has(file),
              ),
            )
            .map((task) => task.name),
        ),
      },
    ];
  });
  // File-only TypeScript checks miss downstream errors. Keep project-wide
  // incremental checks and let Turbo run prerequisite builds/code generation;
  // those prerequisites can compile native code even without Rust checks.
  schedule(
    "typecheck",
    selected
      .filter(({ tasks }) => tasks.some((task) => task.name === "typecheck"))
      .map(({ pkg }) => pkg.name),
  );

  // Test suites narrow together; lint narrows independently. Keep group order
  // stable because Turbo targets and printed package checks preserve insertion order.
  const groups = [
    checkTasks.filter((task) => task.name === "lint"),
    checkTasks.filter((task) => task.suite),
  ];
  for (const group of groups) {
    const full = new Map(group.map((task) => [task.name, []]));
    for (const { pkg, tasks, ownFiles, canNarrow, externalTasks } of selected) {
      const checks = group.filter((task) => tasks.includes(task));
      const related =
        canNarrow &&
        checks.every(
          (task) =>
            !externalTasks.has(task.name) &&
            pkg.scripts[task.name].includes(task.runner),
        );
      for (const task of checks) {
        if (!related) {
          full.get(task.name).push(pkg.name);
          continue;
        }
        // Narrowed checks bypass full-suite caches; only package scripts receive
        // file/changed flags. Prerequisite builds still run through Turbo.
        // Import-based selection cannot discover runtime reads; use --all for those.
        prepare(`${pkg.name}#${task.name}`);
        const details = task.suite
          ? {
              label: `${task.suiteLabel} tests · ${pkg.name}`,
              progressLabel: `${pkg.name} · ${task.suiteLabel} tests`,
              args: ["--changed", base, "--passWithNoTests"],
              testSuites: [task.suite],
            }
          : {
              label: `Lint · ${pkg.name} · ${ownFiles.length} file${ownFiles.length === 1 ? "" : "s"}`,
              args: ownFiles.map((file) => `./${relative(pkg.path, file)}`),
            };
        packageChecks.push({
          ...details,
          args: ["--filter", pkg.name, "run", task.name, ...details.args],
          requiresTurbo: true,
        });
      }
    }
    for (const [task, names] of full) schedule(task, names);
  }
  if (targets.size) {
    // One graph lets Turbo deduplicate prerequisite work and schedule compatible
    // checks concurrently. File-specific commands wait for successful preparation.
    const checks = [
      ...new Set(
        checkTasks
          .filter((task) =>
            [...targets].some((target) => target.endsWith(`#${task.name}`)),
          )
          .map((task) => task.label),
      ),
    ];
    const checkPackages = new Set(
      [...targets]
        .filter((target) =>
          checkTasks.some((task) => target.endsWith(`#${task.name}`)),
        )
        .map((target) => target.slice(0, target.lastIndexOf("#"))),
    );
    packageChecks.unshift({
      label: checks.length
        ? `${checks.join(", ")} & dependencies · ${[...checkPackages].join(", ")}`
        : "Dependencies",
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
  const repositoryFormatting =
    options.all ||
    codeFiles.some((file) => /prettier|(^|\/)\.editorconfig$/.test(file));
  const repositoryChecks = [
    {
      component: "format",
      when: repositoryFormatting,
      label: "Formatting · repository-wide",
      args: ["run", "format:check"],
    },
    {
      component: "format",
      when: !repositoryFormatting && formatted.length > 0,
      label: `Formatting · ${formatted.length} file${formatted.length === 1 ? "" : "s"}`,
      args: [
        "exec",
        "prettier",
        "--check",
        "--",
        ...formatted.map((file) => `./${file}`),
      ],
    },
    {
      component: "tests",
      when:
        options.all ||
        files.some((file) =>
          /^scripts\/vitest\/ci-reporter\.(ts|test\.mjs)$/.test(file),
        ),
      label: "Vitest reporter tests",
      args: ["exec", "node", "--test", "scripts/vitest/ci-reporter.test.mjs"],
    },
    {
      component: "knip",
      // Removing an import can orphan unchanged exports anywhere in the graph.
      when:
        options.all ||
        analysisFiles.some((file) =>
          /\.[cm]?[jt]sx?$|\.jsonc?$|\.ya?ml$|knip\./.test(file),
        ),
      label: "Unused code · repository-wide",
      args: [
        "exec",
        "knip",
        "--cache",
        "--cache-location",
        ".turbo/check-knip/cache",
      ],
      isKnip: true,
    },
  ];
  return [
    ...repositoryChecks
      .filter((check) => check.when && checks.has(check.component))
      .map(({ when, component, ...check }) => check),
    ...packageChecks,
  ];
}

function loadWorkspace(base) {
  const workspace = JSON.parse(
    capture("pnpm", [
      "exec",
      "turbo",
      "query",
      `query {
        packages { items { name path directDependencies { items { name } } allDependents { items { name } } } }
        affectedTasks(base: ${JSON.stringify(base)}, head: "HEAD", tasks: ${JSON.stringify(checkTasks.map((task) => task.name))}) {
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
      ...checkTasks.map((task) => task.name),
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
    if (task.command && checkTasks.some((check) => check.name === task.name)) {
      taskGraph.affected.add(task.fullName);
    }
  }
  return { packages, taskGraph };
}

function prepareKnipCache() {
  const files = [
    ...new Set(
      capture("git", [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
      ])
        .split("\0")
        .filter((file) => file && existsSync(resolve(root, file))),
    ),
  ].sort();
  // File topology matters even across commits/branch switches: adding a missing
  // import target can resolve an error in an otherwise unchanged source file.
  const hash = createHash("sha256").update(JSON.stringify(files));
  for (const file of files) {
    if (
      /\.(jsonc?|ya?ml)$|(^|\/)([^/]*config[^/]*|knip[^/]*|\.[^/]*rc[^/]*|\.gitignore|\.storybook)(\/|$)/i.test(
        file,
      ) ||
      file === "scripts/check.mjs"
    ) {
      hash.update(
        JSON.stringify([file, readFileSync(resolve(root, file), "utf8")]),
      );
    }
  }
  const key = hash.digest("hex");
  const directory = resolve(root, ".turbo/check-knip");
  const keyFile = resolve(directory, "key");
  let previousKey;
  try {
    previousKey = readFileSync(keyFile, "utf8");
  } catch {
    // Missing cache metadata must never allow an older cache to be reused.
  }
  if (previousKey === key) return;
  rmSync(resolve(directory, "cache"), { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  writeFileSync(keyFile, key, { mode: 0o600 });
}

async function runCheck(check, outputDirectory, checkIndex) {
  if (check.isKnip) prepareKnipCache();
  const reports = [];
  for (const [stepIndex, command] of (check.steps ?? [check.args]).entries()) {
    const reportFile = check.testSuites
      ? resolve(outputDirectory, `${checkIndex}-${stepIndex}.json`)
      : null;
    const args = reportFile
      ? [
          ...command,
          "--reporter=default",
          "--reporter=json",
          `--outputFile.json=${reportFile}`,
        ]
      : command;
    // Disk-backed capture avoids truncating verbose failures or exhausting a
    // pipe buffer while successful commands remain completely quiet.
    const outputFile = resolve(
      outputDirectory,
      `${checkIndex}-${stepIndex}.log`,
    );
    const output = openSync(outputFile, "w", 0o600);
    let result;
    try {
      result = await new Promise((resolve) => {
        const child = spawn("pnpm", args, {
          cwd: root,
          env: createOutput().childEnv,
          stdio: ["ignore", output, output],
        });
        let error;
        child.on("error", (cause) => {
          error = cause;
        });
        child.on("close", (status, signal) => {
          resolve({ status, signal, error });
        });
      });
    } finally {
      closeSync(output);
    }
    if (reportFile) {
      let files = null;
      try {
        const report = JSON.parse(readFileSync(reportFile, "utf8"));
        files = report.testResults.map((file) => ({
          path: relative(root, file.name),
          passed: file.assertionResults.filter(
            (test) => test.status === "passed",
          ).length,
          failed: file.assertionResults.filter(
            (test) => test.status === "failed",
          ).length,
          skipped: file.assertionResults.filter((test) =>
            ["pending", "skipped", "todo", "disabled"].includes(test.status),
          ).length,
        }));
      } catch {
        // Startup failures can prevent Vitest from writing its report. Never
        // misrepresent a missing report as a successful run with no tests.
      }
      reports.push({ suite: check.testSuites[stepIndex], files, outputFile });
    }
    // Do not run a suite whose prerequisite generation/build failed.
    if (result.error || result.signal || result.status !== 0) {
      return { failure: { ...result, outputFile }, reports };
    }
  }
  return { failure: null, reports };
}

async function* runPlan(plan, outputDirectory) {
  const pending = new Map();
  const hasTurbo = plan.some((check) => check.isTurboBatch);
  let nextIndex = 0;
  let foreground = null;
  let turboFailed = false;
  try {
    while (nextIndex < plan.length || pending.size) {
      if (foreground === null && nextIndex < plan.length) {
        const checkIndex = nextIndex++;
        const check = plan[checkIndex];
        if (check.requiresTurbo && turboFailed) {
          yield { type: "skipped", check, checkIndex };
          continue;
        }
        const promise = (async () => {
          const startedAt = performance.now();
          try {
            const { failure, reports } = await runCheck(
              check,
              outputDirectory,
              checkIndex,
            );
            return {
              type: "completed",
              check,
              checkIndex,
              result: failure,
              reports,
              durationMs: performance.now() - startedAt,
            };
          } catch (error) {
            return { type: "completed", check, checkIndex, error };
          }
        })();
        pending.set(checkIndex, promise);
        if (!check.requiresTurbo && !(check.isKnip && hasTurbo)) {
          foreground = checkIndex;
        }
        yield { type: "started", check, checkIndex };
        continue;
      }
      const outcome = await Promise.race(pending.values());
      pending.delete(outcome.checkIndex);
      if (outcome.checkIndex === foreground) foreground = null;
      if (outcome.check.isTurboBatch && outcome.result) turboFailed = true;
      yield outcome;
    }
  } finally {
    // An interrupted consumer or unexpected error must not delete logs while
    // background checks are still writing to them. Promises capture rejections.
    await Promise.all(pending.values());
  }
}

function collectDiagnostics(outputFile, isTurboBatch) {
  const captured = readFileSync(outputFile, "utf8").trimEnd();
  if (!isTurboBatch) return { captured, tasks: [], complete: true };

  // Read task logs from the summary rather than trying to strip runner
  // banners/progress from mixed output, which can hide real diagnostics.
  const summaryPath = stripVTControlCharacters(captured)
    .match(/^\s*Summary:\s+(.+\.json)\s*$/m)?.[1]
    ?.trim();
  let failedTasks = [];
  if (summaryPath) {
    try {
      const summary = JSON.parse(
        readFileSync(resolve(root, summaryPath), "utf8"),
      );
      failedTasks = summary.tasks.filter(
        (task) =>
          Number.isInteger(task.execution?.exitCode) &&
          task.execution.exitCode !== 0,
      );
    } catch {
      // Runner startup/summary failures must remain failures without
      // dumping orchestration output as if it were a task diagnostic.
    }
  }
  const tasks = failedTasks.map((task) => {
    let diagnostics = "";
    try {
      diagnostics = readFileSync(resolve(root, task.logFile), "utf8").trimEnd();
    } catch {
      // Missing logs must not prevent other failed tasks being shown.
    }
    return {
      taskId: task.taskId,
      exitCode: task.execution.exitCode,
      diagnostics,
    };
  });
  return {
    tasks,
    complete: tasks.length > 0 && tasks.every((task) => task.diagnostics),
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: pnpm check [--branch] [--base <ref>] [--all] [--only <checks> | --skip <checks>] [--dry-run]\n\nDefault: all applicable checks for staged, unstaged, and untracked changes.\n--branch: changes since merge-base with origin/main, plus local changes.\n--base: override branch target (implies --branch).\n--all: check every package within the selected checks.\n--only, -o: run only the comma-separated checks.\n--skip, -s: exclude the comma-separated checks. Cannot combine with --only.\nChecks: format, typecheck, lint, knip, tests. Build/generation prerequisites still run.\n--dry-run: print checks without running them.",
    );
    return;
  }
  const commandStartedAt = performance.now();
  const elapsed = (startedAt) =>
    `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
  const git = (args) => capture("git", args);
  // Compare branch work to the common ancestor, not the target branch's tip.
  // Callers must fetch stale remote refs; missing refs deliberately fail rather
  // than falling back to a comparison that could silently miss changes.
  const base = options.branch
    ? git(["merge-base", "HEAD", options.base]).trim()
    : git(["rev-parse", "HEAD"]).trim();
  const files = collectChanges(git, base);
  const { terminal, paint, indent } = createOutput();
  console.log(
    paint(
      "1",
      `${options.all ? "All packages" : options.branch ? `Branch checks · ${options.base}` : "Local checks"} · ${options.only ? `only ${options.only.join(", ")}` : options.skip ? `skip ${options.skip.join(", ")}` : "all checks"} · ${files.length} changed file${files.length === 1 ? "" : "s"}`,
    ),
  );
  for (const file of files) {
    const parts = file.split("/");
    const display =
      file.length > 100 && parts.length > 5
        ? `${parts.slice(0, 4).join("/")}/…/${parts.at(-1)}`
        : file;
    console.log(`  ${display}`);
  }
  if (!files.length) console.log("  No changed files.");
  console.log("");
  const { packages, taskGraph } = loadWorkspace(base);
  const plan = createPlan(files, packages, options, base, taskGraph);
  if (!plan.length) {
    console.log(`No applicable checks (${elapsed(commandStartedAt)}).`);
    return;
  }
  for (const check of plan) {
    if (check.isTurboBatch) {
      // Keep runner options before any task-argument separator, including in
      // dry-run output so printed commands match the actual invocation.
      check.args.splice(
        3,
        0,
        "--summarize",
        "--output-logs=none",
        "--ui=stream",
        "--log-prefix=none",
      );
    }
  }
  if (options.dryRun) {
    for (const { label, args, steps } of plan) {
      for (const command of steps ?? [args]) {
        console.log(
          `\n${label}: pnpm ${command.map((arg) => JSON.stringify(arg)).join(" ")}`,
        );
      }
    }
    return;
  }
  mkdirSync(resolve(root, ".turbo"), { recursive: true });
  const outputDirectory = mkdtempSync(resolve(root, ".turbo/check-"));
  let retainLogs = false;
  const failed = [];
  let passedChecks = 0;
  let emptyChecks = 0;
  const skipped = [];
  const rowWidth = Math.min(
    100,
    Math.max(60, ...plan.map((check) => check.label.length + 4)),
  );
  const statusLine = (marker, label, duration, code) => {
    const padding = " ".repeat(Math.max(2, rowWidth - label.length));
    return `${paint(code, marker)} ${label}${padding}${paint("2", duration)}`;
  };
  const active = new Map();
  let progressLines = 0;
  const clearProgress = () => {
    if (!progressLines) return;
    process.stdout.write(`\x1b[${progressLines}A\r\x1b[0J`);
    progressLines = 0;
  };
  try {
    for await (const outcome of runPlan(plan, outputDirectory)) {
      clearProgress();
      if (outcome.type === "started") {
        active.set(outcome.checkIndex, outcome.check);
        if (!terminal) {
          console.log(
            `Running: ${outcome.check.progressLabel ?? outcome.check.label}`,
          );
        }
      } else if (outcome.type === "skipped") {
        const { check } = outcome;
        console.error(statusLine("○", `${check.label} · skipped`, "—", "33"));
        console.error(
          indent("Package checks or dependency preparation failed."),
        );
        skipped.push(check.label);
      } else {
        active.delete(outcome.checkIndex);
        if (outcome.error) throw outcome.error;
        const { check, result, reports, durationMs } = outcome;
        const duration = `${(durationMs / 1000).toFixed(1)}s`;
        const { label, isTurboBatch } = check;
        const noTests =
          reports.length > 0 &&
          reports.every((report) => report.files?.length === 0);
        let resultLabel = label;
        if (noTests) {
          resultLabel += " · no related tests";
        } else if (
          reports.length &&
          reports.every((report) => report.files !== null)
        ) {
          const testFiles = reports.flatMap((report) => report.files);
          const passed = testFiles.reduce((sum, file) => sum + file.passed, 0);
          const failures = testFiles.reduce(
            (sum, file) => sum + file.failed,
            0,
          );
          const skippedTests = testFiles.reduce(
            (sum, file) => sum + file.skipped,
            0,
          );
          const counts = [`${passed} passed`];
          if (failures) counts.push(`${failures} failed`);
          if (skippedTests) counts.push(`${skippedTests} skipped`);
          resultLabel += ` · ${counts.join(", ")} across ${testFiles.length} file${testFiles.length === 1 ? "" : "s"}`;
        }
        if (result) {
          console.error(statusLine("✗", resultLabel, duration, "31"));
        } else if (noTests) {
          console.log(statusLine("○", resultLabel, duration, "33"));
          emptyChecks++;
        } else {
          console.log(statusLine("✓", resultLabel, duration, "32"));
          passedChecks++;
        }
        for (const report of reports) {
          if (report.files === null) {
            retainLogs = true;
            console.error(
              indent(
                `${report.suite}: test report unavailable. Details: ${relative(root, report.outputFile)}`,
              ),
            );
            continue;
          }
          for (const file of report.files) {
            const counts = [`${file.passed} passed`];
            if (file.failed) counts.push(`${file.failed} failed`);
            if (file.skipped) counts.push(`${file.skipped} skipped`);
            console.log(indent(`${file.path} — ${counts.join(", ")}`));
          }
        }
        if (result) {
          const { outputFile } = result;
          if (result.error) console.error(indent(result.error.message));
          const diagnostics = collectDiagnostics(outputFile, isTurboBatch);
          if (isTurboBatch) {
            for (const task of diagnostics.tasks) {
              console.error(
                indent(`\n${task.taskId} failed (exit ${task.exitCode}):`),
              );
              if (task.diagnostics) {
                console.error(indent(task.diagnostics));
              } else {
                console.error(
                  indent("No diagnostic output was recorded for this task."),
                );
              }
            }
            if (!diagnostics.complete) {
              retainLogs = true;
              console.error(
                indent(
                  `Some task diagnostics were unavailable. Runner details: ${relative(root, outputFile)}`,
                ),
              );
            }
          } else {
            if (diagnostics.captured)
              console.error(indent(diagnostics.captured));
          }
          failed.push(label);
          console.error("");
          if (result.signal) {
            process.exitCode = 1;
            return;
          }
        }
      }
      if (terminal && active.size) {
        const lines = [
          `Running${active.size > 1 ? " in parallel" : ""}:`,
          ...[...active.values()].map(
            (check) => `  ${check.progressLabel ?? check.label}`,
          ),
        ];
        const width = Math.max(1, (process.stdout.columns ?? 80) - 1);
        const display = lines.map((line) =>
          line.length > width ? `${line.slice(0, width - 1)}…` : line,
        );
        process.stdout.write(`${paint("2", display.join("\n"))}\n`);
        progressLines = display.length;
      }
    }
  } finally {
    clearProgress();
    if (!retainLogs) rmSync(outputDirectory, { recursive: true, force: true });
  }
  const summary = [];
  if (failed.length) summary.push(`${failed.length} failed`);
  if (passedChecks) summary.push(`${passedChecks} passed`);
  if (emptyChecks) summary.push(`${emptyChecks} no related tests`);
  if (skipped.length) summary.push(`${skipped.length} skipped`);
  if (failed.length || skipped.length) {
    console.error(
      `\n${paint("31", "Failed")} · ${summary.join(", ")} · ${elapsed(commandStartedAt)}`,
    );
    for (const label of failed) console.error(`  ${paint("31", "✗")} ${label}`);
    process.exitCode = 1;
  } else
    console.log(
      `\n${paint("32", "Passed")} · ${summary.join(", ")} · ${elapsed(commandStartedAt)}`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(
      createOutput().paint(
        "31",
        error instanceof Error ? error.message : String(error),
      ),
    );
    process.exitCode = 1;
  }
}
