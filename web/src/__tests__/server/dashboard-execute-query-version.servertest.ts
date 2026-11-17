/**
 * Contract tests for dashboard.executeQuery's `version` input:
 * - `version` is required — there is no implicit v1 default a client can
 *   fall into while its session is still resolving.
 * - Both versions serve regardless of the USER's read path: saved v1 widgets
 *   render for v4 users, and monitors previews / shared v2 widgets query v2
 *   for users whose own read path is still v3. Only a legacy deployment
 *   (events tables not written) rejects v2 — not covered here because the
 *   test env boots in dual mode.
 */
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type QueryType } from "@langfuse/shared/query";
import {
  createOrgProjectAndApiKey,
  createEvent,
  createEventsCh,
  createTraceScore,
  createSessionScore,
  createDatasetRunScore,
  createScoresCh,
} from "@langfuse/shared/src/server";
import { StudioWidgetConfigSchema } from "@langfuse/shared";
import { randomUUID } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type { Session } from "next-auth";

describe("dashboard.executeQuery version contract", () => {
  let projectId: string;
  let orgId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
    orgId = org.orgId;
  });

  function makeCaller(options: {
    v4BetaEnabled: boolean;
    project?: { projectId: string; orgId: string };
  }) {
    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Test User",
        v4BetaEnabled: options.v4BetaEnabled,
        organizations: [
          {
            id: options.project?.orgId ?? orgId,
            name: "Test Organization",
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            aiTelemetryEnabled: true,
            projects: [
              {
                id: options.project?.projectId ?? projectId,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: "Test Project",
                hasTraces: true,
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
        featureFlags: testFeatureFlags(),
      },
      environment: {} as any,
    };
    const ctx = createInnerTRPCContext({ session, headers: {} });
    return appRouter.createCaller({ ...ctx, prisma });
  }

  const query: QueryType = {
    view: "traces",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: [],
    timeDimension: null,
    fromTimestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    toTimestamp: new Date().toISOString(),
    orderBy: null,
  };

  it("rejects a missing version instead of defaulting to v1", async () => {
    const caller = makeCaller({ v4BetaEnabled: true });
    await expect(
      caller.dashboard.executeQuery({ projectId, query } as any),
    ).rejects.toThrow();
  });

  it("serves v1 and v2 to a v4 session (saved v1 widgets still render)", async () => {
    const caller = makeCaller({ v4BetaEnabled: true });
    await expect(
      caller.dashboard.executeQuery({ projectId, query, version: "v1" }),
    ).resolves.toBeDefined();
    await expect(
      caller.dashboard.executeQuery({ projectId, query, version: "v2" }),
    ).resolves.toBeDefined();
  });

  it("serves v2 to a v3-read-path session (monitors previews, shared v2 widgets)", async () => {
    const caller = makeCaller({ v4BetaEnabled: false });
    await expect(
      caller.dashboard.executeQuery({ projectId, query, version: "v2" }),
    ).resolves.toBeDefined();
  });

  it("builds each formula only from its referenced query or expression domains", async () => {
    const project = await createOrgProjectAndApiKey();
    const fixtureProjectId = project.projectId;
    const caller = makeCaller({ v4BetaEnabled: true, project });
    const timestamp = new Date();
    const marker = randomUUID();
    await createEventsCh(
      ["model-a", "model-b"].map((model) =>
        createEvent({
          project_id: fixtureProjectId,
          provided_model_name: model,
          metadata_names: ["fixture"],
          metadata_values: [marker],
          start_time: timestamp,
        }),
      ),
    );
    const filters = [
      {
        column: "metadata",
        type: "stringObject",
        key: "fixture",
        operator: "=",
        value: marker,
      },
    ];
    const config = StudioWidgetConfigSchema.parse({
      version: 1,
      title: "Formula domain",
      description: "",
      queries: [
        {
          id: "a",
          label: "All records",
          hidden: true,
          view: "observations",
          metrics: [{ id: "count", measure: "count", aggregation: "count" }],
          dimensions: [],
          filters,
        },
        {
          id: "models",
          label: "By model",
          view: "observations",
          metrics: [{ id: "count", measure: "count", aggregation: "count" }],
          dimensions: [{ field: "providedModelName" }],
          filters,
        },
      ],
      expressions: [
        { id: "twice", label: "Twice", formula: "a.count * 2", hidden: true },
        { id: "fourTimes", label: "Four times", formula: "twice * 2" },
        {
          id: "share",
          label: "Share",
          formula: "a.count / a.count",
          unit: "percent",
        },
      ],
      display: {
        chartType: "VERTICAL_BAR",
        showHeadline: true,
        activeQueryIds: ["models"],
      },
    });
    config.queries.push({
      ...config.queries[0],
      id: "notRun",
      label: "Not executed",
    });
    const result = await caller.dashboardStudio.execute({
      projectId: fixtureProjectId,
      config,
      version: "v2",
      fromTimestamp: new Date(timestamp.getTime() - 60000).toISOString(),
      toTimestamp: new Date(timestamp.getTime() + 60000).toISOString(),
    });
    expect(result.status, JSON.stringify(result.diagnostics)).toBe("complete");
    expect(result.rows.find((row) => row.queryId === "a")?.value).toBe(2);
    expect(result.summaries.find((row) => row.queryId === "a")?.value).toBe(2);
    expect(result.series.find((series) => series.queryId === "a")?.unit).toBe(
      "observations",
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.queryId)).toEqual([
      "a",
      "models",
    ]);
    expect(
      result.diagnostics.every(
        (diagnostic) =>
          diagnostic.queryCount === 1 || diagnostic.queryId === "models",
      ),
    ).toBe(true);
    expect(result.rows.some((row) => row.queryId === "notRun")).toBe(false);
    expect(
      result.rows
        .filter((row) => row.queryId === "twice")
        .map((row) => ({ value: row.value, dimensions: row.dimensions })),
    ).toEqual([{ value: 4, dimensions: {} }]);
    expect(
      result.rows
        .filter((row) => row.queryId === "fourTimes")
        .map((row) => row.value),
    ).toEqual([8]);
    expect(
      result.summaries
        .filter((row) => row.queryId === "fourTimes")
        .map((row) => row.value),
    ).toEqual([8]);
    expect(
      result.series.find((series) => series.queryId === "share"),
    ).toMatchObject({ unit: "percent", rawUnit: "ratio" });
    const constant = caller.dashboardStudio.execute({
      projectId: fixtureProjectId,
      config: {
        ...config,
        expressions: [{ id: "constant", label: "Constant", formula: "2 * 3" }],
      },
      version: "v2",
      fromTimestamp: new Date(timestamp.getTime() - 60000).toISOString(),
      toTimestamp: new Date(timestamp.getTime() + 60000).toISOString(),
    });
    await expect(constant).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Expressions must reference a query measure or an earlier expression",
    });
  });

  it("keeps same-name score attachments separate without joining trace or observation data", async () => {
    const caller = makeCaller({ v4BetaEnabled: true });
    const timestamp = new Date();
    const name = `attachment-${randomUUID()}`;
    const traceId = randomUUID();
    await createScoresCh([
      createTraceScore({
        project_id: projectId,
        name,
        timestamp,
        trace_id: traceId,
      }),
      createTraceScore({
        project_id: projectId,
        name,
        timestamp,
        trace_id: traceId,
        observation_id: randomUUID(),
      }),
      createSessionScore({ project_id: projectId, name, timestamp }),
      createDatasetRunScore({ project_id: projectId, name, timestamp }),
      createTraceScore({
        project_id: projectId,
        name,
        timestamp,
        trace_id: null,
      }),
    ]);
    const config = StudioWidgetConfigSchema.parse({
      version: 1,
      title: "Score targets",
      description: "",
      expressions: [],
      queries: ["all", "trace", "observation", "session", "experiment"].map(
        (scoreTarget) => ({
          id: scoreTarget,
          label: scoreTarget,
          view: "scores-numeric",
          scoreTarget,
          metrics: [{ id: "count", measure: "count", aggregation: "count" }],
          dimensions: [],
          filters: [
            { column: "name", type: "string", operator: "=", value: name },
          ],
        }),
      ),
      display: { chartType: "VERTICAL_BAR" },
    });
    for (const version of ["v1", "v2"] as const) {
      const result = await caller.dashboardStudio.execute({
        projectId,
        config,
        version,
        fromTimestamp: new Date(timestamp.getTime() - 60000).toISOString(),
        toTimestamp: new Date(timestamp.getTime() + 60000).toISOString(),
      });
      expect(result.status, JSON.stringify(result.diagnostics)).toBe(
        "complete",
      );
      expect(
        Object.fromEntries(result.rows.map((row) => [row.queryId, row.value])),
      ).toEqual({
        all: 5,
        trace: 2,
        observation: 1,
        session: 1,
        experiment: 1,
      });
      expect(
        result.diagnostics.every(
          (diagnostic) => !/\bjoin\b/i.test(diagnostic.compiledSql ?? ""),
        ),
      ).toBe(true);
    }
    expect(
      StudioWidgetConfigSchema.safeParse({
        ...config,
        queries: [
          { ...config.queries[0], view: "observations", scoreTarget: "trace" },
        ],
      }).success,
    ).toBe(false);
  });

  it("executes independently filtered series and a null-safe formula without crossing project authorization", async () => {
    const caller = makeCaller({ v4BetaEnabled: true });
    const timestamp = new Date();
    await createEventsCh(
      [["abc"], ["bbc"], ["abc", "bbc"], []].map((keys, index) =>
        createEvent({
          project_id: projectId,
          metadata_names: keys,
          metadata_values: keys.map(() => ""),
          start_time: timestamp,
          end_time: new Date(timestamp.getTime() + [50, 100, 999, 1000][index]),
        }),
      ),
    );
    const config = StudioWidgetConfigSchema.parse({
      version: 1,
      title: "Presence",
      description: "",
      expressions: [
        { id: "ratio", label: "Ratio", formula: "a.count / b.count" },
      ],
      queries: ["abc", "bbc"].map((key, index) => ({
        id: index === 0 ? "a" : "b",
        label: key,
        view: "observations",
        metrics: [{ id: "count", measure: "count", aggregation: "count" }],
        dimensions: [],
        filters: [
          {
            column: "metadata",
            type: "stringObject",
            key,
            operator: "is set",
            value: "",
          },
        ],
      })),
      display: { chartType: "VERTICAL_BAR", showHeadline: true },
    });
    const input = {
      projectId,
      config,
      version: "v2" as const,
      fromTimestamp: new Date(timestamp.getTime() - 60000).toISOString(),
      toTimestamp: new Date(timestamp.getTime() + 60000).toISOString(),
    };
    const result = await caller.dashboardStudio.execute(input);
    expect(result.status, JSON.stringify(result.diagnostics)).toBe("complete");
    expect(
      Object.fromEntries(result.rows.map((row) => [row.seriesId, row.value])),
    ).toEqual({ "a.count": 2, "b.count": 2, ratio: 1 });
    expect(
      result.summaries.find((row) => row.seriesId === "a.count")?.value,
    ).toBe(2);
    expect(result.diagnostics.every((entry) => entry.queryCount === 1)).toBe(
      true,
    );
    const percentile = await caller.dashboardStudio.execute({
      ...input,
      config: {
        ...config,
        queries: [
          {
            id: "latency",
            label: "Custom p10",
            view: "observations",
            metrics: [
              {
                id: "p10",
                measure: "latency",
                aggregation: "p50",
                percentile: 10,
              },
            ],
            dimensions: [],
            filters: [],
          },
        ],
        expressions: [],
        display: { chartType: "NUMBER" },
      },
    });
    expect(percentile.status, JSON.stringify(percentile.diagnostics)).toBe(
      "complete",
    );
    expect(percentile.rows[0].value).toBeLessThan(100);
    const histogram = await caller.dashboardStudio.execute({
      ...input,
      config: {
        ...config,
        queries: [
          {
            id: "latency",
            label: "Fixed latency bands",
            view: "observations",
            metrics: [
              { id: "bands", measure: "latency", aggregation: "histogram" },
            ],
            dimensions: [],
            filters: [],
          },
        ],
        expressions: [],
        display: { chartType: "HISTOGRAM", histogramEdges: [0, 100, 1000] },
      },
    });
    expect(histogram.status, JSON.stringify(histogram.diagnostics)).toBe(
      "complete",
    );
    expect(
      Object.fromEntries(
        histogram.rows.map((row) => [row.dimension, row.value]),
      ),
    ).toEqual({
      "< 0": 0,
      "[0, 100)": 1,
      "[100, 1000)": 2,
      "≥ 1000": 1,
      "No value": 0,
    });
    const invalidPredicate = caller.dashboardStudio.execute({
      ...input,
      config: {
        ...config,
        queries: [
          {
            id: "invalid",
            label: "Invalid local predicate",
            view: "scores-boolean",
            metrics: [{ id: "count", measure: "count", aggregation: "count" }],
            dimensions: [],
            filters: [
              { column: "value", type: "number", operator: "=", value: 1 },
            ],
          },
        ],
        expressions: [],
      },
    });
    await expect(invalidPredicate).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("value"),
    });
    const costByType = await caller.dashboardStudio.execute({
      ...input,
      config: {
        ...config,
        queries: [
          {
            id: "cost",
            label: "Cost by type",
            view: "observations",
            metrics: [
              {
                id: "cost",
                measure: "costByType",
                aggregation: "sum",
                summary: { measure: "totalCost", aggregation: "sum" },
              },
            ],
            dimensions: [{ field: "costType" }],
            filters: [],
          },
        ],
        expressions: [],
        display: { chartType: "HORIZONTAL_BAR", showHeadline: true },
      },
    });
    expect(costByType.status, JSON.stringify(costByType.diagnostics)).toBe(
      "complete",
    );
    expect(
      costByType.rows.reduce((sum, row) => sum + (row.value ?? 0), 0),
    ).toBe(2400);
    expect(costByType.summaries.map((row) => row.value)).toEqual([1200]);
    const limitedFormula = caller.dashboardStudio.execute({
      ...input,
      config: {
        ...config,
        queries: config.queries.map((source) => ({
          ...source,
          dimensions: [{ field: "name" }],
        })),
      },
    });
    await expect(limitedFormula).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("shared breakdown domain"),
    });
    await expect(
      caller.dashboardStudio.execute({ ...input, projectId: randomUUID() }),
    ).rejects.toThrow("not a member");
  });
});
