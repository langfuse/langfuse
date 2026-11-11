import { redis } from "../redis/redis";
import type { TopicRun } from "../../topics";
import { enqueueTopicRuleSetup } from "./queue";

const SETUP_TTL_SECONDS = 24 * 60 * 60;
export const TOPIC_RULE_SETUP_DEADLINE_MS = 4 * 60_000;

export type TopicRuleSetupFacet = {
  facetId: string;
  facetVersion: number;
  /** has_map: setup leaves the rule's map alone; covered: enough summaries exist; short: traces were seeded. */
  state: "has_map" | "covered" | "short";
  existingCount: number;
  /** Seeded traces with a final result for this facet, and how many of them are complete. */
  settledCount: number;
  completeCount: number;
  /** When settledCount last grew. */
  grewAt: string | null;
  fit: "standard" | "small_sample" | null;
  runId: string | null;
  runStatus: TopicRun["status"] | null;
};

export type TopicRuleSetup = {
  projectId: string;
  ruleId: string;
  phase: "selecting" | "summarizing" | "fitting" | "done" | "failed";
  startedAt: string;
  deadlineAt: string;
  /** The window the reuse check and selection ended on. */
  days: number | null;
  seededCount: number;
  /** The last tick's error; the setup fails after a few failed ticks in a row. */
  error: string | null;
  failedTicks?: number;
  facets: TopicRuleSetupFacet[];
};

// The project hash tag spreads projects over cluster slots and keeps a setup's keys in one slot.
const setupKey = (projectId: string, ruleId: string) =>
  `topics:rule-setup:{${projectId}}:${ruleId}`;
const tracesKey = (projectId: string, ruleId: string) =>
  `${setupKey(projectId, ruleId)}:traces`;

export const isTopicRuleSetupActive = (setup: TopicRuleSetup | null) =>
  !!setup && setup.phase !== "done" && setup.phase !== "failed";

export async function readTopicRuleSetup(
  projectId: string,
  ruleId: string,
): Promise<TopicRuleSetup | null> {
  const value = await redis?.get(setupKey(projectId, ruleId));
  return value ? (JSON.parse(value) as TopicRuleSetup) : null;
}

export async function writeTopicRuleSetup(setup: TopicRuleSetup) {
  await redis?.set(
    setupKey(setup.projectId, setup.ruleId),
    JSON.stringify(setup),
    "EX",
    SETUP_TTL_SECONDS,
  );
}

/** Seeded trace IDs, kept only to count their summaries; they expire with the setup. */
export async function writeTopicRuleSetupTraces(
  projectId: string,
  ruleId: string,
  traceIds: string[],
) {
  await redis?.set(
    tracesKey(projectId, ruleId),
    JSON.stringify(traceIds),
    "EX",
    SETUP_TTL_SECONDS,
  );
}

export async function readTopicRuleSetupTraces(
  projectId: string,
  ruleId: string,
): Promise<string[]> {
  const value = await redis?.get(tracesKey(projectId, ruleId));
  return value ? (JSON.parse(value) as string[]) : [];
}

/** Starts a rule's setup unless one is active, which is returned instead. */
export async function startTopicRuleSetup(
  projectId: string,
  ruleId: string,
  now = new Date(),
): Promise<TopicRuleSetup> {
  if (!redis) throw new Error("Topics setup requires Redis.");
  const existing = await readTopicRuleSetup(projectId, ruleId);
  if (isTopicRuleSetupActive(existing)) return existing!;
  const setup: TopicRuleSetup = {
    projectId,
    ruleId,
    phase: "selecting",
    startedAt: now.toISOString(),
    deadlineAt: new Date(
      now.getTime() + TOPIC_RULE_SETUP_DEADLINE_MS,
    ).toISOString(),
    days: null,
    seededCount: 0,
    error: null,
    facets: [],
  };
  await redis.set(
    setupKey(projectId, ruleId),
    JSON.stringify(setup),
    "EX",
    SETUP_TTL_SECONDS,
  );
  await enqueueTopicRuleSetup(projectId, ruleId, setup.startedAt);
  return setup;
}
