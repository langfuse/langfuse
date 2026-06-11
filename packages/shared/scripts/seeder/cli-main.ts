/**
 * Langfuse seed CLI — one-shot local test data for humans and coding agents.
 *
 * Usage:
 *   pnpm run seed -- doctor [--json]
 *   pnpm run seed -- list [--json]
 *   pnpm run seed -- <scenario> [flags]
 *
 * Scenario names, flag names, and JSON output keys are a stable, additive-only
 * contract. See ./seeder-2-0-rfc.md and ./AGENTS.md.
 */
import { parseArgs } from "node:util";
import { prisma } from "../../src/db";
import { logger, redis } from "../../src/server";
import { preflight, runDoctor } from "./doctor";
import { scenarios } from "./scenarios";
import { ScenarioContext, ScenarioFlag, SeedError } from "./scenarios/types";

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

const usage = (): string => {
  const lines = [
    "Langfuse seed CLI — one-shot local test data.",
    "",
    "Usage:",
    "  pnpm run seed -- doctor [--json] [--project <id>]   check the local stack, print fixes",
    "  pnpm run seed -- list [--json]          list scenarios and flags",
    "  pnpm run seed -- <scenario> [flags]     seed one scenario",
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

const coerceValues = (
  flags: ScenarioFlag[],
  values: Record<string, string | boolean | undefined>,
): Record<string, string | number | boolean> => {
  const params: Record<string, string | number | boolean> = {};
  for (const flag of flags) {
    const raw = values[flag.flag];
    if (raw === undefined) {
      params[flag.flag] = flag.default;
      continue;
    }
    if (flag.type === "number") {
      const parsed = Number(raw);
      if (raw === "" || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        throw new SeedError(
          `--${flag.flag} expects an integer, got "${raw}"`,
          `pass an integer, e.g. --${flag.flag} ${String(flag.default)}`,
        );
      }
      params[flag.flag] = parsed;
    } else {
      params[flag.flag] = raw;
    }
  }
  return params;
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
    const icon =
      check.status === "pass"
        ? "PASS"
        : check.status === "warn"
          ? "WARN"
          : "FAIL";
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
        console.log(`${scenario.name}\n  ${scenario.description}`);
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

  const scenario = Object.hasOwn(scenarios, command)
    ? scenarios[command]
    : undefined;
  if (!scenario) {
    throw new SeedError(
      `unknown scenario "${command}" — available: ${Object.keys(scenarios).join(", ")}, doctor, list`,
      "run `pnpm run seed -- list` to see scenarios and flags",
    );
  }

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

  if (!ctx.dryRun) {
    await preflight({
      projectId: ctx.projectId,
      needV4: scenario.supportsV4 && params["v4"] === true,
      log: ctx.log,
    });
  }

  const summary = await scenario.run(ctx, params);
  console.log(JSON.stringify(summary));
  if (!jsonOnly) {
    console.error(
      `[seed:${scenario.name}] ${summary.dryRun ? "dry-run" : "done"} in ${summary.durationMs}ms`,
    );
    for (const link of summary.links) {
      console.error(`[seed:${scenario.name}] open: ${link}`);
    }
  }
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
