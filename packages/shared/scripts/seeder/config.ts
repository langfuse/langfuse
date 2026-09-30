import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SeedError } from "./scenarios/types";

const CONFIG_DIR = path.join(__dirname, "configs");

const ParamValue = z.union([z.string(), z.number(), z.boolean()]);
const Params = z.record(z.string(), ParamValue);

/**
 * One file that declares a whole seed run: flag defaults shared by every
 * step (project, environment, seed, ...) and the scenarios to run in order.
 * Step params use the scenario's CLI flag names.
 */
const SeedConfigSchema = z
  .object({
    description: z.string().optional(),
    defaults: Params.default({}),
    scenarios: z
      .array(
        z.object({ name: z.string(), params: Params.default({}) }).strict(),
      )
      .min(1),
  })
  .strict();

export type SeedConfig = z.infer<typeof SeedConfigSchema>;

/**
 * Resolves `ref` as a path (relative to the directory pnpm was invoked
 * from) or, failing that, as the name of a bundled config in ./configs.
 */
export const loadSeedConfig = (
  ref: string,
): { path: string; config: SeedConfig } => {
  // pnpm runs the script from packages/shared; INIT_CWD is the caller's cwd.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const fromCwd = path.resolve(process.env.INIT_CWD ?? process.cwd(), ref);
  const bundled = path.join(CONFIG_DIR, `${ref.replace(/\.json$/, "")}.json`);
  const file = [fromCwd, bundled].find((candidate) => existsSync(candidate));
  if (!file) {
    throw new SeedError(
      `seed config "${ref}" not found (looked at ${fromCwd} and ${bundled})`,
      "pass a path to a JSON config or the name of a file in packages/shared/scripts/seeder/configs",
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new SeedError(
      `seed config ${file} is not valid JSON: ${(error as Error).message}`,
    );
  }
  const parsed = SeedConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SeedError(
      `seed config ${file} is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ")}`,
      "see the config format in packages/shared/scripts/seeder/README.md",
    );
  }
  return { path: file, config: parsed.data };
};
