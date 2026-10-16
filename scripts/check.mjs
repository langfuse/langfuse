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
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
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
  // Root mappings describe consumers outside the workspace dependency graph.
  // They control selection, not cache validity: external resources consumed by
  // tasks must also be declared as Turbo inputs, preserving $TURBO_DEFAULT$.
  // Metadata skips below do not validate workflow/editor configuration syntax.
  let broad = options.all;
  const direct = new Set();
  const fullPackages = new Set();
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
      // The generated worker's consistency test formats its output using the
      // root config, so a formatting change can invalidate the committed bundle.
      for (const consumer of packages) {
        if (consumer.path === "web") fullPackages.add(consumer.name);
      }
      continue;
    }
    analysisFiles.push(file);
    if (/^knip\.[^/]+$/.test(file)) continue;
    if (/^scripts\/vitest\/ci-reporter\.(ts|test\.mjs)$/.test(file)) {
      for (const consumer of packages) {
        if (consumer.path === "web" || consumer.path === "worker")
          fullPackages.add(consumer.name);
      }
      continue;
    }
    if (
      /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.nvmrc|tsconfig(?:\.[^/]+)?\.json|eslint\.config\.[cm]?js|vitest\.workspace\.[cm]?[jt]s)$/.test(
        file,
      ) ||
      file.startsWith("patches/")
    ) {
      for (const consumer of packages) {
        // These packages expose Cargo tasks through pnpm, not JS/TS checks.
        if (
          consumer.path !== "ai-gateway" &&
          consumer.path !== "packages/native"
        )
          fullPackages.add(consumer.name);
      }
      continue;
    }
    // New root files remain conservative until their consumers are mapped.
    broad = true;
  }
  const affected = new Set(
    broad ? packages.map((pkg) => pkg.name) : [...direct, ...fullPackages],
  );
  let previousSize;
  let previousFullSize;
  do {
    previousSize = affected.size;
    previousFullSize = fullPackages.size;
    for (const pkg of packages) {
      if (pkg.dependencies.some((dependency) => affected.has(dependency)))
        affected.add(pkg.name);
      if (pkg.dependencies.some((dependency) => fullPackages.has(dependency)))
        fullPackages.add(pkg.name);
    }
  } while (
    affected.size !== previousSize ||
    fullPackages.size !== previousFullSize
  );

  const add = (label, args) => commands.push({ label, args });
  const turbo = (task, names, extra = []) => {
    if (names.length)
      add(task, [
        "exec",
        "turbo",
        "run",
        task,
        ...names.map((name) => `--filter=${name}`),
        "--continue=dependencies-successful",
        ...extra,
      ]);
  };
  const selected = packages.filter((pkg) => affected.has(pkg.name));
  // File-only TypeScript checks miss downstream errors. Keep project-wide
  // incremental checks and let Turbo run prerequisite builds/code generation;
  // those prerequisites can compile native code even without Rust checks.
  turbo(
    "typecheck",
    selected.filter((pkg) => pkg.scripts.typecheck).map((pkg) => pkg.name),
  );

  const fullLint = [];
  for (const pkg of selected) {
    if (!pkg.scripts.lint) continue;
    const ownFiles = codeFiles.filter((file) => owner(file)?.name === pkg.name);
    const sourceOnly =
      ownFiles.length > 0 &&
      ownFiles.every(
        (file) =>
          file.startsWith(`${pkg.path}/src/`) &&
          /\.[cm]?[jt]sx?$/.test(file) &&
          exists(resolve(root, file)),
      );
    if (
      !broad &&
      direct.has(pkg.name) &&
      !fullPackages.has(pkg.name) &&
      !pkg.dependencies.some((dependency) => affected.has(dependency)) &&
      sourceOnly &&
      pkg.scripts.lint.includes("eslint")
    ) {
      // ESLint's flat-config CLI defaults to the package directory when no
      // paths are supplied, so the same script supports full and file-only lint.
      turbo(
        "lint",
        [pkg.name],
        ["--", ...ownFiles.map((file) => `./${relative(pkg.path, file)}`)],
      );
    } else fullLint.push(pkg.name);
  }
  turbo("lint", fullLint);

  const fullTests = [];
  const clientTests = [];
  for (const pkg of selected) {
    if (!pkg.scripts.test) continue;
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
    // Import-based selection cannot discover computed imports or runtime file
    // reads. Use --all when changing resources whose consumers are unknown.
    const related =
      !broad &&
      direct.has(pkg.name) &&
      !fullPackages.has(pkg.name) &&
      !dependencyChanged &&
      sourceOnly &&
      pkg.scripts.test.includes("vitest");
    if (related) {
      // Prepare through Turbo, but run the existing test scripts directly:
      // selection depends on Git state and must not populate full-suite caches.
      // Keeping preparation separate also prevents Vitest flags from reaching
      // generation/build tasks or running unrelated upstream test suites.
      const steps = [
        ["exec", "turbo", "run", "db:generate", `--filter=${pkg.name}`],
        ["exec", "turbo", "run", "build", `--filter=${pkg.name}^...`],
        [
          "--filter",
          pkg.name,
          "run",
          "test",
          "--changed",
          base,
          "--passWithNoTests",
        ],
      ];
      if (pkg.scripts["test-client"]) {
        steps.push([
          "--filter",
          pkg.name,
          "run",
          "test-client",
          "--changed",
          base,
          "--passWithNoTests",
        ]);
      }
      commands.push({ label: `related tests (${pkg.name})`, steps });
    } else {
      fullTests.push(pkg.name);
      if (pkg.scripts["test-client"]) clientTests.push(pkg.name);
    }
  }
  turbo("test", fullTests);
  turbo("test-client", clientTests);

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
    capture("pnpm", ["exec", "turbo", "ls", "--output=json"]),
  );
  const packages = workspace.packages.items
    .map((pkg) => {
      const manifest = JSON.parse(
        readFileSync(resolve(root, pkg.path, "package.json"), "utf8"),
      );
      return {
        ...pkg,
        scripts: manifest.scripts ?? {},
        dependencies: Object.keys({
          ...manifest.dependencies,
          ...manifest.devDependencies,
          ...manifest.peerDependencies,
          ...manifest.optionalDependencies,
        }),
      };
    })
    .sort((a, b) => b.path.length - a.path.length);
  const plan = createPlan(files, packages, options, base);
  if (!plan.length) {
    console.log("No applicable checks.");
    return;
  }
  const failed = [];
  for (const { label, args, steps } of plan) {
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
