import type { Session } from "next-auth";
import type * as SharedServer from "@langfuse/shared/src/server";
import { v4TransitionRouter } from "@/src/features/v4/server/v4TransitionRouter";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { queryClickhouse } from "@langfuse/shared/src/server";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();

  return {
    ...actual,
    queryClickhouse: vi.fn(),
    systemTableRef: vi.fn(
      (table: "system.processes" | "system.query_log") =>
        `clusterAllReplicas('test-cluster', '${table}')`,
    ),
  };
});

const mockedQueryClickhouse = vi.mocked(queryClickhouse);

const projectId = "project-v4-transition";

const session: Session = {
  expires: "1",
  user: {
    id: "user-v4-transition",
    name: "V4 Transition User",
    email: "v4-transition@example.com",
    canCreateOrganizations: true,
    organizations: [
      {
        id: "org-v4-transition",
        name: "V4 Transition Org",
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: true,
        aiTelemetryEnabled: true,
        projects: [
          {
            id: projectId,
            name: "V4 Transition Project",
            role: "ADMIN",
            deletedAt: null,
            retentionDays: null,
            hasTraces: false,
            metadata: {},
            createdAt: new Date(0).toISOString(),
          },
        ],
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      observationEvals: false,
      templateFlag: false,
      searchBar: false,
      v4BetaToggleVisible: false,
      experimentsV4Enabled: false,
    },
    admin: false,
  },
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: "cloud:hobby",
  },
};

describe("v4TransitionRouter", () => {
  beforeEach(() => {
    mockedQueryClickhouse.mockResolvedValue([
      {
        time: "2026-06-25T12:00:00Z",
        entrypoint: "publicapi: GET /api/public/traces/:id",
        count: "2",
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("queries legacy public API usage with UTC buckets and route classification", async () => {
    const caller = v4TransitionRouter.createCaller(
      createInnerTRPCContext({ session, headers: {} }),
    );

    const rows = await caller.timeSeriesByEntrypoint({
      projectId,
      fromTimestamp: new Date("2026-06-24T00:00:00Z"),
      toTimestamp: new Date("2026-06-25T00:00:00Z"),
      interval: {
        count: 1,
        unit: "day",
      },
    });

    expect(rows).toEqual([
      {
        time: "2026-06-25T12:00:00Z",
        entrypoint: "publicapi: GET /api/public/traces/:id",
        count: 2,
      },
    ]);

    expect(mockedQueryClickhouse).toHaveBeenCalledTimes(1);
    const clickhouseQuery = mockedQueryClickhouse.mock.calls[0]?.[0];
    expect(clickhouseQuery?.query).toContain(
      "FROM clusterAllReplicas('test-cluster', 'system.query_log')",
    );
    expect(clickhouseQuery?.query).toContain(
      "toStartOfInterval(event_time_microseconds, INTERVAL 1 DAY, 'UTC')",
    );
    expect(clickhouseQuery?.query).toContain(
      "splitByChar('?', JSONExtractString(log_comment, 'route'))[1]",
    );
    expect(clickhouseQuery?.query).toContain(
      "JSONExtractString(log_comment, 'tag_schema_version') = '1'",
    );
    expect(clickhouseQuery?.query).toContain(
      "JSONExtractString(log_comment, 'surface') = 'publicapi'",
    );
    expect(clickhouseQuery?.query).toContain(
      "JSONExtractString(log_comment, 'projectId') = {projectId: String}",
    );
    expect(clickhouseQuery?.clickhouseSettings).toEqual({
      skip_unavailable_shards: 1,
    });

    [
      "GET /api/public/spans",
      "GET /api/public/generations",
      "GET /api/public/traces",
      "GET /api/public/sessions",
      "GET /api/public/observations",
      "GET /api/public/scores",
      "GET /api/public/v2/scores",
      "GET /api/public/metrics",
      "GET /api/public/metrics/daily",
    ].forEach((route) => expect(clickhouseQuery?.query).toContain(route));

    [
      "GET /api/public/traces/:id",
      "GET /api/public/sessions/:id",
      "GET /api/public/observations/:id",
      "GET /api/public/scores/:id",
      "GET /api/public/v2/scores/:id",
    ].forEach((route) => expect(clickhouseQuery?.query).toContain(route));
  });
});
