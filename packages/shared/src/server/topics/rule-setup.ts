import { redis } from "../redis/redis";
import type { TopicRun } from "../../topics";
import { enqueueTopicRuleSetup } from "./queue";

// Setup keys expire this long after the start; the nightly refit then takes over.
export const TOPIC_RULE_SETUP_TTL_MS = 60 * 60_000;
export const TOPIC_RULE_SETUP_DEADLINE_MS = 4 * 60_000;

export type TopicRuleSetupFacet = {
  facetId: string;
  facetVersion: number;
  /** has_map: setup leaves the rule's map alone; covered: enough summaries exist; short: traces were seeded. */
  state: "has_map" | "covered" | "short";
  /** Complete summaries in the window, not counting seeded traces. */
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
  /** Start of the fit window: the selection window or a seeded trace's first event, whichever is earlier. */
  from?: string;
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

const expiresAt = (startedAt: string) =>
  Date.parse(startedAt) + TOPIC_RULE_SETUP_TTL_MS;

export async function writeTopicRuleSetup(setup: TopicRuleSetup) {
  await redis?.set(
    setupKey(setup.projectId, setup.ruleId),
    JSON.stringify(setup),
    "PXAT",
    expiresAt(setup.startedAt),
  );
}

/** Seeded trace IDs, kept only to count their summaries; they expire with the setup. */
export async function writeTopicRuleSetupTraces(
  setup: TopicRuleSetup,
  traceIds: string[],
) {
  await redis?.set(
    tracesKey(setup.projectId, setup.ruleId),
    JSON.stringify(traceIds),
    "PXAT",
    expiresAt(setup.startedAt),
  );
}

export async function readTopicRuleSetupTraces(
  projectId: string,
  ruleId: string,
): Promise<string[]> {
  const value = await redis?.get(tracesKey(projectId, ruleId));
  return value ? (JSON.parse(value) as string[]) : [];
}

// Claims the record unless an active setup holds it; a new setup drops the old trace IDs.
// KEYS: record, traces. ARGV: new record, expiry (ms). Returns [created, record].
const CLAIM_SCRIPT = `
  local current = redis.call('GET', KEYS[1])
  if current then
    local phase = cjson.decode(current).phase
    if phase ~= 'done' and phase ~= 'failed' then return {0, current} end
  end
  redis.call('SET', KEYS[1], ARGV[1], 'PXAT', ARGV[2])
  redis.call('DEL', KEYS[2])
  return {1, ARGV[1]}
`;
// Drops a claimed record whose job could not be enqueued. KEYS: record. ARGV: the claimed record.
const RELEASE_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end
`;

/** Claims a new setup record unless an active one exists, which is returned with `created: false`. */
export async function claimTopicRuleSetup(
  projectId: string,
  ruleId: string,
  now = new Date(),
): Promise<{ created: boolean; setup: TopicRuleSetup }> {
  if (!redis) throw new Error("Topics setup requires Redis.");
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
  const keys = [setupKey(projectId, ruleId), tracesKey(projectId, ruleId)];
  const [created, record] = (await redis.eval(
    CLAIM_SCRIPT,
    keys.length,
    ...keys,
    JSON.stringify(setup),
    expiresAt(setup.startedAt),
  )) as [number, string];
  return { created: created === 1, setup: JSON.parse(record) };
}

/** Starts a rule's setup unless one is active, which is returned instead. */
export async function startTopicRuleSetup(
  projectId: string,
  ruleId: string,
  now = new Date(),
): Promise<TopicRuleSetup> {
  const { created, setup } = await claimTopicRuleSetup(projectId, ruleId, now);
  if (!created) return setup;
  try {
    await enqueueTopicRuleSetup(projectId, ruleId, setup.startedAt);
  } catch (error) {
    await redis?.eval(
      RELEASE_SCRIPT,
      1,
      setupKey(projectId, ruleId),
      JSON.stringify(setup),
    );
    throw error;
  }
  return setup;
}
