import { LangfuseNotFoundError, UnauthorizedError } from "@langfuse/shared";
import { env } from "@langfuse/shared/src/env";
import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import {
  buildTraceExport,
  TraceDownloadTooLargeError,
  type TraceExportSession,
} from "@/src/features/traces/server/buildTraceExport";

const {
  mockGetTraceByIdFromEventsTable,
  mockGetObservationsCountFromEventsTable,
  mockGetObservationsForTraceFromEventsTable,
  mockGetScoresAndCorrectionsForTraces,
  mockTraceSessionFindFirst,
  mockProjectFindFirst,
  mockSendAdminAccessWebhook,
} = vi.hoisted(() => ({
  mockGetTraceByIdFromEventsTable: vi.fn(),
  mockGetObservationsCountFromEventsTable: vi.fn(),
  mockGetObservationsForTraceFromEventsTable: vi.fn(),
  mockGetScoresAndCorrectionsForTraces: vi.fn(),
  mockTraceSessionFindFirst: vi.fn(),
  mockProjectFindFirst: vi.fn(),
  mockSendAdminAccessWebhook: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async () => ({
  ...(await vi.importActual("@langfuse/shared/src/server")),
  getTraceByIdFromEventsTable: (...args: unknown[]) =>
    mockGetTraceByIdFromEventsTable(...args),
  getObservationsCountFromEventsTable: (...args: unknown[]) =>
    mockGetObservationsCountFromEventsTable(...args),
  getObservationsForTraceFromEventsTable: (...args: unknown[]) =>
    mockGetObservationsForTraceFromEventsTable(...args),
  getScoresAndCorrectionsForTraces: (...args: unknown[]) =>
    mockGetScoresAndCorrectionsForTraces(...args),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    traceSession: {
      findFirst: (...args: unknown[]) => mockTraceSessionFindFirst(...args),
    },
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
  },
}));

vi.mock("../../server/adminAccessWebhook", () => ({
  sendAdminAccessWebhook: (...args: unknown[]) =>
    mockSendAdminAccessWebhook(...args),
}));

const projectId = "project-1";
const traceId = "trace-1";
const traceTimestamp = new Date("2024-01-01T00:00:00.000Z");
const observationStartTimeFilter = new Date(
  traceTimestamp.getTime() - 60 * 60 * 1000,
);

const makeSession = (overrides?: {
  admin?: boolean;
  projects?: Array<{ id: string }>;
}): TraceExportSession => ({
  user: {
    email: "test@example.com",
    admin: overrides?.admin ?? false,
    organizations: [
      {
        projects: overrides?.projects ?? [{ id: projectId }],
      },
    ],
  },
});

const makeTrace = (overrides?: Record<string, unknown>) => ({
  id: traceId,
  name: "Trace 1",
  timestamp: traceTimestamp,
  environment: "default",
  tags: [],
  bookmarked: false,
  public: false,
  release: null,
  version: null,
  input: '{"prompt":"hello"}',
  output: '{"answer":"world"}',
  metadata: { foo: "bar" },
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  sessionId: null,
  userId: null,
  projectId,
  ...overrides,
});

const makeObservation = (overrides?: Record<string, unknown>) => ({
  id: "obs-1",
  traceId,
  projectId,
  userId: null,
  sessionId: null,
  environment: "default",
  type: "SPAN",
  startTime: new Date("2024-01-01T00:00:01.000Z"),
  endTime: new Date("2024-01-01T00:00:02.000Z"),
  name: "Observation 1",
  metadata: { key: "value" },
  parentObservationId: null,
  level: "DEFAULT",
  statusMessage: null,
  version: null,
  createdAt: new Date("2024-01-01T00:00:01.000Z"),
  updatedAt: new Date("2024-01-01T00:00:02.000Z"),
  model: null,
  internalModelId: null,
  modelParameters: null,
  input: '{"input":"secret"}',
  output: '{"output":"secret"}',
  completionStartTime: null,
  promptId: null,
  promptName: null,
  promptVersion: null,
  usageDetails: { input: 90, output: 45, total: 135 },
  costDetails: { total: 1.23 },
  providedCostDetails: { total: 1.5 },
  providedUsageDetails: { input: 100, output: 50, total: 150 },
  totalCost: null,
  usagePricingTierId: null,
  usagePricingTierName: null,
  toolDefinitions: null,
  toolCalls: null,
  toolCallNames: null,
  ...overrides,
});

const makeScore = (overrides?: Record<string, unknown>) => ({
  id: "score-1",
  projectId,
  environment: "default",
  name: "politeness",
  value: 1,
  source: "EVAL",
  authorUserId: null,
  comment: "helpful",
  metadata: { target_trace_id: traceId },
  configId: null,
  queueId: null,
  executionTraceId: "exec-1",
  createdAt: new Date("2024-01-01T00:00:03.000Z"),
  updatedAt: new Date("2024-01-01T00:00:04.000Z"),
  timestamp: new Date("2024-01-01T00:00:05.000Z"),
  traceId,
  sessionId: null,
  datasetRunId: null,
  observationId: null,
  longStringValue: "",
  stringValue: null,
  dataType: "NUMERIC",
  ...overrides,
});

describe("buildTraceExport", () => {
  const originalObservationLimit =
    env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES;

  beforeEach(() => {
    vi.clearAllMocks();
    env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES =
      originalObservationLimit;
    mockGetTraceByIdFromEventsTable.mockResolvedValue(makeTrace());
    mockGetObservationsCountFromEventsTable.mockResolvedValue(1);
    mockGetObservationsForTraceFromEventsTable.mockResolvedValue({
      observations: [makeObservation()],
      totalCount: 1,
    });
    mockGetScoresAndCorrectionsForTraces.mockResolvedValue([makeScore()]);
    mockTraceSessionFindFirst.mockResolvedValue(null);
    mockProjectFindFirst.mockResolvedValue({ orgId: "org-1" });
  });

  afterAll(() => {
    env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES =
      originalObservationLimit;
  });

  it("builds an export using full observation data for smaller traces", async () => {
    const result = await buildTraceExport({
      traceId,
      projectId,
      session: makeSession(),
    });

    expect(mockGetTraceByIdFromEventsTable).toHaveBeenCalledWith({
      traceId,
      projectId,
      renderingProps: {
        truncated: true,
        shouldJsonParse: false,
      },
      clickhouseFeatureTag: "tracing-download",
    });
    expect(mockGetObservationsCountFromEventsTable).toHaveBeenCalledWith({
      projectId,
      filter: [
        { type: "string", operator: "=", column: "traceId", value: traceId },
        {
          type: "datetime",
          operator: ">=",
          column: "startTime",
          value: observationStartTimeFilter,
        },
      ],
    });
    expect(mockGetObservationsForTraceFromEventsTable).toHaveBeenCalledWith({
      traceId,
      projectId,
      timestamp: traceTimestamp,
      selectIOAndMetadata: true,
      selectToolData: true,
    });
    expect(mockGetObservationsForTraceFromEventsTable).toHaveBeenCalledTimes(1);
    expect(mockGetScoresAndCorrectionsForTraces).toHaveBeenCalledWith({
      projectId,
      traceIds: [traceId],
      timestamp: traceTimestamp,
    });
    expect(result.scores[0]).not.toHaveProperty("longStringValue");
    expect(result.scores[0]).not.toHaveProperty("queueId");
    expect(result.scores[0]).not.toHaveProperty("executionTraceId");
    expect(result).toMatchObject({
      scores: [
        expect.objectContaining({
          id: "score-1",
          traceId,
          value: 1,
          dataType: "NUMERIC",
        }),
      ],
      observations: [
        expect.objectContaining({
          id: "obs-1",
          traceId,
          traceName: "Trace 1",
          tags: [],
          bookmarked: false,
          public: false,
        }),
      ],
    });
  });

  it("maps correction score text into stringValue without leaking internal fields", async () => {
    mockGetScoresAndCorrectionsForTraces.mockResolvedValue([
      makeScore({
        dataType: "CORRECTION",
        value: 0,
        stringValue: null,
        longStringValue: "corrected output",
        queueId: "queue-1",
        executionTraceId: "exec-1",
      }),
    ]);

    const result = await buildTraceExport({
      traceId,
      projectId,
      session: makeSession(),
    });

    expect(result.scores).toEqual([
      expect.objectContaining({
        id: "score-1",
        traceId,
        dataType: "CORRECTION",
        value: 0,
        stringValue: "corrected output",
      }),
    ]);
    expect(result.scores[0]).not.toHaveProperty("longStringValue");
    expect(result.scores[0]).not.toHaveProperty("queueId");
    expect(result.scores[0]).not.toHaveProperty("executionTraceId");
  });

  it("keeps text score content in stringValue", async () => {
    mockGetScoresAndCorrectionsForTraces.mockResolvedValue([
      makeScore({
        dataType: "TEXT",
        value: 0,
        stringValue: "helpful response",
      }),
    ]);

    const result = await buildTraceExport({
      traceId,
      projectId,
      session: makeSession(),
    });

    expect(result.scores).toEqual([
      expect.objectContaining({
        id: "score-1",
        traceId,
        dataType: "TEXT",
        stringValue: "helpful response",
      }),
    ]);
    expect(result.scores[0]).not.toHaveProperty("value");
    expect(result.scores[0]).not.toHaveProperty("longStringValue");
  });

  it("omits IO, metadata, toolDefinitions, and toolCalls for large trace exports", async () => {
    mockGetObservationsCountFromEventsTable.mockResolvedValue(350);
    mockGetObservationsForTraceFromEventsTable.mockResolvedValue({
      observations: Array.from({ length: 350 }, (_, idx) => ({
        ...makeObservation(),
        id: `obs-${idx + 1}`,
        toolCallNames: ["read_file", "write_file"],
      })),
      totalCount: 350,
    });

    const result = await buildTraceExport({
      traceId,
      projectId,
      session: makeSession(),
    });

    expect(mockGetObservationsForTraceFromEventsTable).toHaveBeenCalledWith({
      traceId,
      projectId,
      timestamp: traceTimestamp,
      selectIOAndMetadata: false,
      selectToolData: false,
    });
    expect(result.observations).toHaveLength(350);
    expect(result.observations[0]).not.toHaveProperty("input");
    expect(result.observations[0]).not.toHaveProperty("output");
    expect(result.observations[0]).not.toHaveProperty("metadata");
    expect(result.observations[0]).not.toHaveProperty("toolDefinitions");
    expect(result.observations[0]).not.toHaveProperty("toolCalls");
    expect(result.observations[0]).toHaveProperty("toolCallNames", [
      "read_file",
      "write_file",
    ]);
  });

  it("reemits the observation payload limit error as a download-safe error", async () => {
    mockGetObservationsCountFromEventsTable.mockResolvedValue(10);
    env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES = 100;
    mockGetObservationsForTraceFromEventsTable.mockResolvedValue({
      observations: [
        makeObservation({
          input: "x".repeat(60),
          output: "y".repeat(60),
          metadata: { key: "z".repeat(60) },
        }),
      ],
      totalCount: 1,
    });

    await expect(
      buildTraceExport({
        traceId,
        projectId,
        session: makeSession(),
      }),
    ).rejects.toBeInstanceOf(TraceDownloadTooLargeError);
  });

  it("throws a not-found error when the trace is missing", async () => {
    mockGetTraceByIdFromEventsTable.mockResolvedValue(null);

    await expect(
      buildTraceExport({
        traceId,
        projectId,
        session: makeSession(),
      }),
    ).rejects.toBeInstanceOf(LangfuseNotFoundError);
  });

  it("throws an unauthorized error when the user cannot read the trace", async () => {
    await expect(
      buildTraceExport({
        traceId,
        projectId,
        session: makeSession({ projects: [{ id: "other-project" }] }),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("allows unauthenticated access to public traces", async () => {
    mockGetTraceByIdFromEventsTable.mockResolvedValue(
      makeTrace({ public: true }),
    );

    const result = await buildTraceExport({
      traceId,
      projectId,
      session: null,
    });

    expect(result).toMatchObject({
      observations: [
        expect.objectContaining({
          id: "obs-1",
          traceId,
          public: true,
        }),
      ],
    });
  });

  it("allows unauthenticated access to traces in public sessions", async () => {
    mockGetTraceByIdFromEventsTable.mockResolvedValue(
      makeTrace({ public: false, sessionId: "trace-session-1" }),
    );
    mockTraceSessionFindFirst.mockResolvedValue({ public: true });

    const result = await buildTraceExport({
      traceId,
      projectId,
      session: null,
    });

    expect(mockTraceSessionFindFirst).toHaveBeenCalledWith({
      where: {
        id: "trace-session-1",
        projectId,
      },
      select: {
        public: true,
      },
    });
    expect(result).toMatchObject({
      observations: [expect.objectContaining({ id: "obs-1", traceId })],
    });
  });

  it("denies unauthenticated access to private traces", async () => {
    await expect(
      buildTraceExport({
        traceId,
        projectId,
        session: null,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("notifies on admin access", async () => {
    await buildTraceExport({
      traceId,
      projectId,
      session: makeSession({ admin: true, projects: [] }),
    });

    expect(mockSendAdminAccessWebhook).toHaveBeenCalledWith({
      email: "test@example.com",
      projectId,
      orgId: "org-1",
    });
  });
});
