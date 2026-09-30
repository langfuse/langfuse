/**
 * Langfuse seed CLI — one-shot local test data for humans and coding agents.
 *
 * Usage:
 *   pnpm run seed -- doctor [--json]
 *   pnpm run seed -- list [--json]
 *   pnpm run seed -- <scenario> [flags]
 *   pnpm run seed -- apply <config> [--dry-run] [--json]
 *
 * Scenario names, flag names, and JSON output keys are a stable, additive-only
 * contract. See ./README.md and ./AGENTS.md.
 */
import { parseArgs } from "node:util";
import { prisma } from "../../src/db";
import { logger, redis } from "../../src/server";
import { loadSeedConfig } from "./config";
import { preflight, runDoctor } from "./doctor";
import { scenarios } from "./scenarios";
import {
  ScenarioContext,
  ScenarioDefinition,
  ScenarioFlag,
  SeedError,
  SeedSummary,
} from "./scenarios/types";

const DEFAULT_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const COMMON_FLAGS: ScenarioFlag[] = [
  {
    flag: "project",
    type: "string",
    default: DEFAULT_PROJECT_ID,
    description: "target project id (default: seed project)",
  },
  {
    flag: "environment",
    type: "string",
    default: "default",
    description: "langfuse environment written on rows",
  },
  {
    flag: "seed",
    type: "number",
    default: 42,
    description: "RNG seed — identical seed and flags produce identical data",
  },
  {
    flag: "id-prefix",
    type: "string",
    default: "",
    description: "prefix for generated ids (default: <scenario>-s<seed>)",
  },
  {
    flag: "dry-run",
    type: "boolean",
    default: false,
    description: "print planned counts and links, write nothing",
  },
  {
    flag: "json",
    type: "boolean",
    default: false,
    description: "machine mode: only the final JSON summary on stdout",
  },
];

// CLI script, not a turbo task — reads the dev env directly.
// eslint-disable-next-line turbo/no-undeclared-env-vars
const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

const truncateDescription = (text: string, maxLen = 100): string => {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  // Keep at least 60% of the budget before bailing on the word boundary, so
  // we don't return a useless 3-character stub if a single word is huge.
  const wordEnd = lastSpace > maxLen * 0.6 ? lastSpace : maxLen;
  return `${cut.slice(0, wordEnd).trimEnd()}…`;
};

const usage = (): string => {
  const lines = [
    "Langfuse seed CLI — one-shot local test data.",
    "",
    "Usage:",
    "  pnpm run seed -- doctor [--json] [--project <id>]   check the local stack, print fixes",
    "  pnpm run seed -- list [--json]          list scenarios and flags",
    "  pnpm run seed -- <scenario> [flags]     seed one scenario",
    "  pnpm run seed -- apply <config>         seed every scenario listed in a JSON config",
    "",
    "Scenarios:",
  ];
  for (const scenario of Object.values(scenarios)) {
    lines.push(
      `  ${scenario.name.padEnd(14)} ${scenario.description.split(":")[0]}`,
    );
  }
  lines.push("");
  lines.push("Common flags:");
  for (const flag of COMMON_FLAGS) {
    lines.push(`  --${flag.flag.padEnd(12)} ${flag.description}`);
  }
  lines.push("");
  lines.push("Examples:");
  lines.push(
    "  pnpm run seed -- trace-tree --observations 5000 --breadth 500 --v4",
  );
  lines.push(
    "  pnpm run seed -- long-session --traces 300 --observations-per-trace 8",
  );
  lines.push("  pnpm run seed -- many-traces --count 100000 --days 14");
  lines.push("  pnpm run seed -- apply admin-issues-demo");
  return lines.join("\n");
};

const buildParseOptions = (flags: ScenarioFlag[]) => {
  const options: Record<string, { type: "string" | "boolean" }> = {};
  for (const flag of flags) {
    options[flag.flag] = {
      type: flag.type === "boolean" ? "boolean" : "string",
    };
  }
  return options;
};

/**
 * Validates flag values from the command line (strings/booleans) or a seed
 * config (typed JSON) and fills in defaults.
 */
const coerceValues = (
  flags: ScenarioFlag[],
  values: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> => {
  const known = new Set(flags.map((flag) => flag.flag));
  const unknown = Object.keys(values).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new SeedError(
      `unknown flags: ${unknown.join(", ")}`,
      "run `pnpm run seed -- list` to see supported flags",
    );
  }

  const params: Record<string, string | number | boolean> = {};
  for (const flag of flags) {
    const raw = values[flag.flag];
    if (raw === undefined) {
      params[flag.flag] = flag.default;
      continue;
    }
    if (flag.type === "number") {
      const parsed = typeof raw === "number" ? raw : Number(raw);
      if (
        raw === "" ||
        typeof raw === "boolean" ||
        !Number.isFinite(parsed) ||
        !Number.isInteger(parsed)
      ) {
        throw new SeedError(
          `--${flag.flag} expects an integer, got "${raw}"`,
          `pass an integer, e.g. --${flag.flag} ${String(flag.default)}`,
        );
      }
      params[flag.flag] = parsed;
    } else if (typeof raw !== flag.type) {
      throw new SeedError(
        `--${flag.flag} expects a ${flag.type}, got ${JSON.stringify(raw)}`,
      );
    } else {
      params[flag.flag] = raw;
    }
  }
  return params;
};

const runScenario = async (
  scenario: ScenarioDefinition,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const jsonOnly = params["json"] === true;
  const seed = params["seed"] as number;
  const ctx: ScenarioContext = {
    projectId: params["project"] as string,
    environment: params["environment"] as string,
    seed,
    idPrefix: (params["id-prefix"] as string) || `${scenario.name}-s${seed}`,
    dryRun: params["dry-run"] === true,
    baseUrl,
    log: (message) => {
      if (!jsonOnly) console.error(`[seed:${scenario.name}] ${message}`);
    },
  };

  if (!ctx.dryRun && scenario.target !== "api") {
    await preflight({
      projectId: ctx.projectId,
      needV4: scenario.supportsV4 && params["v4"] === true,
      log: ctx.log,
    });
  }

  const summary = await scenario.run(ctx, params);
  if (!jsonOnly) {
    console.error(
      `[seed:${scenario.name}] ${summary.dryRun ? "dry-run" : "done"} in ${summary.durationMs}ms`,
    );
    for (const link of summary.links) {
      console.error(`[seed:${scenario.name}] open: ${link}`);
    }
  }
  return summary;
};

const findScenario = (name: string): ScenarioDefinition => {
  const scenario = Object.hasOwn(scenarios, name) ? scenarios[name] : undefined;
  if (!scenario) {
    throw new SeedError(
      `unknown scenario "${name}" — available: ${Object.keys(scenarios).join(", ")}, apply, doctor, list`,
      "run `pnpm run seed -- list` to see scenarios and flags",
    );
  }
  return scenario;
};

/** Flags that belong to the `apply` invocation, not to a config step. */
const RUN_LEVEL_FLAGS = new Set(["dry-run", "json"]);

const applyConfig = async (argv: string[]): Promise<number> => {
  let positionals: string[];
  let values: { "dry-run"?: boolean; json?: boolean };
  try {
    ({ positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { "dry-run": { type: "boolean" }, json: { type: "boolean" } },
    }));
  } catch (error) {
    throw new SeedError(
      (error as Error).message,
      "supported usage: apply <config> [--dry-run] [--json]",
    );
  }
  if (positionals.length !== 1) {
    throw new SeedError(
      "apply expects exactly one config",
      "e.g. pnpm run seed -- apply admin-issues-demo",
    );
  }

  const { path: configPath, config } = loadSeedConfig(positionals[0]);
  const dryRun = values["dry-run"] === true;
  const jsonOnly = values.json === true;

  // Resolve every step before writing anything, so a typo in the last step
  // fails the run up front.
  const steps = config.scenarios.map((step, index) => {
    const scenario = findScenario(step.name);
    const raw = { ...config.defaults, ...step.params };
    const runLevel = Object.keys(raw).filter((key) => RUN_LEVEL_FLAGS.has(key));
    if (runLevel.length > 0) {
      throw new SeedError(
        `scenarios[${index}] (${step.name}) sets ${runLevel.join(", ")} — these apply to the whole run`,
        "pass --dry-run / --json to `apply` instead",
      );
    }
    try {
      return {
        scenario,
        params: coerceValues([...scenario.flags, ...COMMON_FLAGS], {
          ...raw,
          "dry-run": dryRun,
          json: jsonOnly,
        }),
      };
    } catch (error) {
      if (!(error instanceof SeedError)) throw error;
      throw new SeedError(
        `scenarios[${index}] (${step.name}): ${error.message}`,
        error.fix,
      );
    }
  });

  const summaries: SeedSummary[] = [];
  for (const step of steps) {
    summaries.push(await runScenario(step.scenario, step.params));
  }
  console.log(JSON.stringify({ config: configPath, dryRun, summaries }));
  return 0;
};

const printDoctor = (
  result: Awaited<ReturnType<typeof runDoctor>>,
  json: boolean,
): void => {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  for (const check of result.checks) {
    const icon = (() => {
      if (check.status === "pass") {
        return "PASS";
      }
      if (check.status === "warn") {
        return "WARN";
      }
      return "FAIL";
    })();
    console.log(`${icon}  ${check.name.padEnd(22)} ${check.detail}`);
    if (check.fix && check.status !== "pass") {
      console.log(`      fix: ${check.fix}`);
    }
  }
  console.log(
    result.ok
      ? "\nStack is ready for seeding."
      : "\nFix the FAIL items above, then re-run: pnpm run seed -- doctor",
  );
};

const main = async (): Promise<number> => {
  // winston's console transport writes to stdout; --json promises a pure
  // stdout (only the final summary line), so silence it in machine mode.
  if (process.argv.includes("--json")) {
    logger.transports.forEach((transport) => {
      transport.silent = true;
    });
  }

  // pnpm forwards the "--" separator itself; strip leading occurrences.
  let argv = process.argv.slice(2);
  while (argv[0] === "--") argv = argv.slice(1);
  const command = argv[0];

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    console.log(usage());
    return 0;
  }

  if (command === "doctor") {
    let values: { json?: boolean; project?: string };
    try {
      values = parseArgs({
        args: argv.slice(1),
        options: { json: { type: "boolean" }, project: { type: "string" } },
      }).values;
    } catch (error) {
      throw new SeedError(
        (error as Error).message,
        "supported usage: doctor [--json] [--project <id>]",
      );
    }
    const result = await runDoctor(
      baseUrl,
      values.project ?? DEFAULT_PROJECT_ID,
    );
    printDoctor(result, values.json === true);
    return result.ok ? 0 : 1;
  }

  if (command === "list") {
    let values: { json?: boolean };
    try {
      values = parseArgs({
        args: argv.slice(1),
        options: { json: { type: "boolean" } },
      }).values;
    } catch (error) {
      throw new SeedError(
        (error as Error).message,
        "supported usage: list [--json]",
      );
    }
    const listed = Object.values(scenarios).map((scenario) => ({
      name: scenario.name,
      description: scenario.description,
      supportsV4: scenario.supportsV4,
      flags: [...scenario.flags, ...COMMON_FLAGS],
    }));
    if (values.json) {
      console.log(JSON.stringify({ scenarios: listed }));
    } else {
      for (const scenario of listed) {
        const v4Marker = scenario.supportsV4 ? "  [v4]" : "";
        console.log(
          `${scenario.name}${v4Marker}\n  ${truncateDescription(scenario.description)}`,
        );
        for (const flag of scenario.flags) {
          console.log(
            `    --${flag.flag.padEnd(24)} default: ${String(flag.default) || '""'}  ${flag.description}`,
          );
        }
        console.log("");
      }
    }
    return 0;
  }

  if (command === "apply") {
    return applyConfig(argv.slice(1));
  }

  const scenario = findScenario(command);
  const allFlags = [...scenario.flags, ...COMMON_FLAGS];
  let params: Record<string, string | number | boolean>;
  try {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: buildParseOptions(allFlags),
    });
    params = coerceValues(allFlags, values);
  } catch (error) {
    if (error instanceof SeedError) throw error;
    throw new SeedError(
      (error as Error).message,
      "run `pnpm run seed -- list` to see supported flags",
    );
  }

  const summary = await runScenario(scenario, params);
  console.log(JSON.stringify(summary));
  return 0;
};

export const run = async (): Promise<void> => {
  try {
    const code = await main();
    process.exitCode = code;
  } catch (error) {
    if (error instanceof SeedError) {
      console.error(`error: ${error.message}`);
      if (error.fix) console.error(`fix:   ${error.fix}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
    redis?.disconnect();
  }
};
