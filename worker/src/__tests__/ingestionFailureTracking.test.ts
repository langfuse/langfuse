import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { env } from "@langfuse/shared/src/env";
import {
  INGESTION_FAILURE_ACTIVE_PROJECTS_KEY,
  markProjectIngestFailure,
  redis,
  updateActiveIngestFailureProjectsMetric,
} from "@langfuse/shared/src/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

async function waitForActiveProjectCount(expected: number): Promise<void> {
  if (!redis) throw new Error("Redis must be configured");

  for (let attempt = 0; attempt < 100; attempt++) {
    const count = await redis.zcard(INGESTION_FAILURE_ACTIVE_PROJECTS_KEY);
    if (count === expected) return;
    await sleep(10);
  }

  expect(await redis.zcard(INGESTION_FAILURE_ACTIVE_PROJECTS_KEY)).toBe(
    expected,
  );
}

describe("ingestion failure tracking", () => {
  beforeAll(async () => {
    if (!redis) {
      throw new Error("Redis must be configured for worker integration tests");
    }

    await redis.del(INGESTION_FAILURE_ACTIVE_PROJECTS_KEY);
  });

  afterAll(async () => {
    await redis?.del(INGESTION_FAILURE_ACTIVE_PROJECTS_KEY);
  });

  it("tracks active projects in Redis, caps distinct local projects per minute, and prunes expired projects", async () => {
    if (!redis) throw new Error("Redis must be configured");
    expect(env.LANGFUSE_INGEST_FAILURE_PROJECT_TTL_SECONDS).toBeGreaterThan(60);

    const projectPrefix = `project-${randomUUID()}`;
    const startedAt = Date.now();

    for (let i = 0; i < 650; i++) {
      markProjectIngestFailure(`${projectPrefix}-noisy`, {
        source: "otel_ingestion_queue",
        reason: "processing_error",
      });
    }

    for (let i = 0; i < 150; i++) {
      markProjectIngestFailure(`${projectPrefix}-${i}`, {
        source: "otel_ingestion_queue",
        reason: "processing_error",
      });
    }

    await waitForActiveProjectCount(100);

    const firstScore = await redis.zscore(
      INGESTION_FAILURE_ACTIVE_PROJECTS_KEY,
      `${projectPrefix}-noisy`,
    );
    expect(Number(firstScore)).toBeGreaterThanOrEqual(
      startedAt + env.LANGFUSE_INGEST_FAILURE_PROJECT_TTL_SECONDS * 1000,
    );
    await expect(
      redis.zscore(
        INGESTION_FAILURE_ACTIVE_PROJECTS_KEY,
        `${projectPrefix}-98`,
      ),
    ).resolves.not.toBeNull();
    await expect(
      redis.zscore(
        INGESTION_FAILURE_ACTIVE_PROJECTS_KEY,
        `${projectPrefix}-99`,
      ),
    ).resolves.toBeNull();

    await redis.zadd(
      INGESTION_FAILURE_ACTIVE_PROJECTS_KEY,
      Date.now() - 1,
      `${projectPrefix}-expired`,
    );

    await expect(updateActiveIngestFailureProjectsMetric()).resolves.toBe(100);
    await expect(
      redis.zscore(
        INGESTION_FAILURE_ACTIVE_PROJECTS_KEY,
        `${projectPrefix}-expired`,
      ),
    ).resolves.toBeNull();
    expect(
      await redis.ttl(INGESTION_FAILURE_ACTIVE_PROJECTS_KEY),
    ).toBeGreaterThan(0);
  });
});
