/**
 * Legacy write-mode coverage for getEnvironmentsForProject: reads come from
 * the legacy traces/observations tables. The write mode is read from the
 * parsed env at module load, so it is forced via process.env BEFORE any module
 * is imported — the dev/CI default is dual, which would route the read to the
 * events tables instead. The events_only tests live in
 * environment-repository-events-only.servertest.ts.
 */
import { vi } from "vitest";

vi.hoisted(() => {
  process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
});

import {
  createTracesCh,
  createTrace,
  getEnvironmentsForProject,
} from "@langfuse/shared/src/server";
import { env } from "@langfuse/shared/src/env";
import { randomUUID } from "crypto";

describe("Clickhouse Project Repository Test", () => {
  it("forces legacy write mode", () => {
    expect(env.LANGFUSE_MIGRATION_V4_WRITE_MODE).toBe("legacy");
  });

  it("should return default if no environments are found", async () => {
    const projectId = randomUUID();
    const environments = await getEnvironmentsForProject({ projectId });
    expect(environments).toHaveLength(1);
    expect(environments[0].environment).toEqual("default");
  });

  it("should return environment from project_environments table after new trace was inserted", async () => {
    const projectId = randomUUID();
    const environmentId1 = randomUUID();
    const environmentId2 = randomUUID();
    await createTracesCh([
      createTrace({
        project_id: projectId,
        environment: environmentId1,
      }),
      createTrace({
        project_id: projectId,
        environment: environmentId1,
      }),
      createTrace({
        project_id: projectId,
        environment: environmentId2,
      }),
    ]);

    const environments = await getEnvironmentsForProject({ projectId });

    expect(environments).toHaveLength(3);
    expect(environments).toEqual(
      expect.arrayContaining([
        { environment: environmentId1 },
        { environment: environmentId2 },
        { environment: "default" },
      ]),
    );
  });
});
