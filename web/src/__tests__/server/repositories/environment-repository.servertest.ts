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
  getEnvironmentsWithCountsForProject,
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

  it("should return environments from the traces table after new traces were inserted", async () => {
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

describe("getEnvironmentsWithCountsForProject (legacy)", () => {
  it("returns the default environment with zero count when the project has no traces", async () => {
    const projectId = randomUUID();
    const rows = await getEnvironmentsWithCountsForProject({ projectId });
    expect(rows).toEqual([{ environment: "default", count: 0 }]);
  });

  it("returns distinct-trace counts per environment, sorted by count desc", async () => {
    const projectId = randomUUID();
    const envA = randomUUID();
    const envB = randomUUID();
    // 3 traces in envA, 1 trace in envB, 2 traces in default
    await createTracesCh([
      createTrace({ project_id: projectId, environment: envA }),
      createTrace({ project_id: projectId, environment: envA }),
      createTrace({ project_id: projectId, environment: envA }),
      createTrace({ project_id: projectId, environment: envB }),
      createTrace({ project_id: projectId }), // default env
      createTrace({ project_id: projectId }), // default env
    ]);

    const rows = await getEnvironmentsWithCountsForProject({ projectId });
    const byEnv = Object.fromEntries(rows.map((r) => [r.environment, r.count]));

    // envA wins, default is second, envB is third.
    expect(rows[0].environment).toBe(envA);
    expect(rows[0].count).toBe(3);
    expect(byEnv.default).toBe(2);
    expect(byEnv[envB]).toBe(1);

    // The default env is always present even if no rows were inserted for it
    // (in this case it IS present because we inserted 2 default-env traces).
    expect(rows.some((r) => r.environment === "default")).toBe(true);
  });
});
