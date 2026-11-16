import type { Cluster, Redis } from "ioredis";

// JSON array of project ids, written daily by the cloud usage metering job.
// Absent on deployments that do not run that job.
const LARGE_PROJECT_IDS_REDIS_KEY = "project-size:large-project-ids";

let classifiedLargeProjectIds = new Set<string>();

// The redis client is passed in because importing the redis module here would
// form a cycle through the logger and instrumentation, which reads project
// sizes from this module.
export const saveLargeProjectIds = async (
  redis: Redis | Cluster,
  projectIds: string[],
): Promise<void> => {
  await redis.set(LARGE_PROJECT_IDS_REDIS_KEY, JSON.stringify(projectIds));
};

// Called once per web and worker process at startup. Processes are replaced
// within days, so they pick up the daily refresh without polling.
export const loadLargeProjectIds = async (
  redis: Redis | Cluster | null,
): Promise<void> => {
  if (!redis) return;
  try {
    const value = await redis.get(LARGE_PROJECT_IDS_REDIS_KEY);
    classifiedLargeProjectIds = new Set(
      value ? (JSON.parse(value) as string[]) : [],
    );
  } catch {
    // Without the classified set, every project reports as unknown.
  }
};

export const getProjectSize = (projectId: string): "large" | "unknown" =>
  classifiedLargeProjectIds.has(projectId) ? "large" : "unknown";
