/**
 * Shared contracts for seeder scenarios.
 *
 * Scenario names, flag names, and SeedSummary JSON keys are a public,
 * additive-only contract consumed by agents and scripts. Do not rename or
 * remove fields; add new ones instead. See ../README.md.
 */

export type ScenarioFlagType = "string" | "number" | "boolean";

export type ScenarioFlag = {
  /** kebab-case CLI flag name, e.g. "observations-per-trace" */
  flag: string;
  type: ScenarioFlagType;
  default: string | number | boolean;
  description: string;
};

export type SeedSummary = {
  scenario: string;
  target: "clickhouse" | "greptime";
  params: Record<string, string | number | boolean>;
  projectId: string;
  environment: string;
  traceIds: string[];
  sessionIds: string[];
  /** rows written per logical entity, e.g. { traces: 1, observations: 5000 } */
  counts: Record<string, number>;
  /** post-write readback counts from the target store; mismatches fail the run */
  verified: Record<string, number>;
  /** UI deep links to inspect the seeded state */
  links: string[];
  dryRun: boolean;
  durationMs: number;
};

export type ScenarioContext = {
  projectId: string;
  environment: string;
  seed: number;
  idPrefix: string;
  dryRun: boolean;
  baseUrl: string;
  log: (message: string) => void;
};

export type ScenarioDefinition = {
  name: string;
  description: string;
  flags: ScenarioFlag[];
  /** true if the scenario supports mirroring rows into v4 events tables */
  supportsV4: boolean;
  run: (
    ctx: ScenarioContext,
    params: Record<string, string | number | boolean>,
  ) => Promise<SeedSummary>;
};

export class SeedError extends Error {
  public readonly fix?: string;

  constructor(message: string, fix?: string) {
    super(message);
    this.name = "SeedError";
    this.fix = fix;
  }
}

export const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};
