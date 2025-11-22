import { describe, it, expect, vi, beforeEach } from "vitest";

// Set up mocks first
const mockClickhouseClient = {
  query: vi.fn().mockResolvedValue({
    json: () => Promise.resolve([]),
    response_headers: {},
    query_id: "mock-query-id",
  }),
  insert: vi.fn(),
};

vi.mock("../../env", () => ({
  env: {
    LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE: 10,
    LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS: 1000,
    LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS: 3,
    LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "test-bucket",
    CLICKHOUSE_URL: "http://localhost:8123",
    CLICKHOUSE_USER: "default",
    CLICKHOUSE_PASSWORD: "",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
  },
}));

vi.mock("@langfuse/shared/src/server", async () => {
  return {
    clickhouseClient: () => mockClickhouseClient,
    getCurrentSpan: vi.fn(),
    recordGauge: vi.fn(),
    recordHistogram: vi.fn(),
    recordIncrement: vi.fn(),
    instrumentAsync: vi.fn((_, fn) =>
      fn({
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
        addEvent: vi.fn(),
        end: vi.fn(),
      }),
    ),
    eventTypes: {
      TRACE_CREATE: "trace-create",
      SCORE_CREATE: "score-create",
      EVENT_CREATE: "event-create",
      SPAN_CREATE: "span-create",
      SPAN_UPDATE: "span-update",
      GENERATION_CREATE: "generation-create",
      GENERATION_UPDATE: "generation-update",
      OBSERVATION_CREATE: "observation-create",
      OBSERVATION_UPDATE: "observation-update",
    },
    convertTraceReadToInsert: (x: any) => x,
    convertScoreReadToInsert: (x: any) => x,
    convertObservationReadToInsert: (x: any) => x,
    convertTraceToStagingObservation: (x: any) => x,
    observationRecordInsertSchema: {
      parse: (x: any) => ({ ...x, environment: x.environment ?? "default" }),
    },
    scoreRecordInsertSchema: {
      parse: (x: any) => ({ ...x, environment: x.environment ?? "default" }),
    },
    traceRecordInsertSchema: {
      parse: (x: any) => ({ ...x, environment: x.environment ?? "default" }),
    },
    traceRecordReadSchema: { parse: (x: any) => x },
    scoreRecordReadSchema: { parse: (x: any) => x },
    observationRecordReadSchema: { parse: (x: any) => x },
    traceException: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    flattenJsonToPathArrays: () => ({ names: [], values: [] }),
    hasNoJobConfigsCache: vi.fn().mockResolvedValue(true),
    PromptService: class {
      constructor() {}
      getPrompt() {
        return Promise.resolve(null);
      }
    },
    QueueJobs: { IngestionJob: "ingestion-job" },
    TraceUpsertQueue: { getInstance: () => ({ add: vi.fn() }) },
    validateAndInflateScore: vi.fn((x) => x),
    findModel: vi.fn(() => ({ model: null, prices: [] })),
  };
});

// Import after mocks
import { IngestionService } from "../../services/IngestionService";
import { TableName } from "../../services/ClickhouseWriter";
import { v4 as uuidv4 } from "uuid";
import { eventTypes } from "@langfuse/shared/src/server";

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  scanStream: vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      yield [];
    },
  })),
} as any;

const mockPrisma = {
  datasetRuns: { findFirst: vi.fn() },
  datasetItem: { findFirst: vi.fn() },
  $executeRaw: vi.fn(),
} as any;

// Mock ClickhouseWriter to capture writes
class MockClickhouseWriter {
  queue: any = {
    [TableName.Traces]: [],
    [TableName.Scores]: [],
    [TableName.Observations]: [],
    [TableName.ObservationsBatchStaging]: [],
  };

  addToQueue(table: any, data: any) {
    this.queue[table].push({ data });
  }
}

describe("Issue #10436: Environment ingestion bug", () => {
  let ingestionService: IngestionService;
  let mockClickhouseWriter: any;

  beforeEach(() => {
    mockClickhouseWriter = new MockClickhouseWriter();
    ingestionService = new IngestionService(
      mockRedis,
      mockPrisma,
      mockClickhouseWriter,
      mockClickhouseClient,
    );
  });

  it("should update environment from 'default' to 'staging' when explicitly set", async () => {
    const traceId = uuidv4();
    const projectId = "project-123";
    const now = new Date();

    // Event 1: Trace create with default environment
    const traceCreate = {
      id: uuidv4(),
      type: eventTypes.TRACE_CREATE,
      timestamp: now.toISOString(),
      body: {
        id: traceId,
        name: "trace-1",
        environment: "default",
      },
    };

    // Event 2: Trace update with explicit staging environment
    const traceUpdate = {
      id: uuidv4(),
      type: eventTypes.TRACE_CREATE,
      timestamp: new Date(now.getTime() + 100).toISOString(),
      body: {
        id: traceId,
        environment: "staging",
      },
    };

    await ingestionService.mergeAndWrite(
      "trace",
      projectId,
      traceId,
      now,
      [traceCreate, traceUpdate] as any[],
      false,
    );

    const traces = mockClickhouseWriter.queue[TableName.Traces];
    expect(traces).toHaveLength(1);

    // After fix: environment should be updated to "staging"
    expect(traces[0].data.environment).toBe("staging");
  });

  it("should default to 'default' environment when not specified", async () => {
    const traceId = uuidv4();
    const projectId = "project-123";
    const now = new Date();

    // Event without environment field
    const traceCreate = {
      id: uuidv4(),
      type: eventTypes.TRACE_CREATE,
      timestamp: now.toISOString(),
      body: {
        id: traceId,
        name: "trace-without-env",
      },
    };

    await ingestionService.mergeAndWrite(
      "trace",
      projectId,
      traceId,
      now,
      [traceCreate] as any[],
      false,
    );

    const traces = mockClickhouseWriter.queue[TableName.Traces];
    expect(traces).toHaveLength(1);

    // Should default to "default" when not specified
    expect(traces[0].data.environment).toBe("default");
  });

  it("should preserve non-default environment when explicitly set from the start", async () => {
    const traceId = uuidv4();
    const projectId = "project-123";
    const now = new Date();

    // Event with explicit staging environment from the start
    const traceCreate = {
      id: uuidv4(),
      type: eventTypes.TRACE_CREATE,
      timestamp: now.toISOString(),
      body: {
        id: traceId,
        name: "trace-staging",
        environment: "staging",
      },
    };

    await ingestionService.mergeAndWrite(
      "trace",
      projectId,
      traceId,
      now,
      [traceCreate] as any[],
      false,
    );

    const traces = mockClickhouseWriter.queue[TableName.Traces];
    expect(traces).toHaveLength(1);

    // Should preserve the explicitly set staging environment
    expect(traces[0].data.environment).toBe("staging");
  });

  it("should preserve production environment when explicitly set", async () => {
    const traceId = uuidv4();
    const projectId = "project-123";
    const now = new Date();

    // Event with explicit production environment
    const traceCreate = {
      id: uuidv4(),
      type: eventTypes.TRACE_CREATE,
      timestamp: now.toISOString(),
      body: {
        id: traceId,
        name: "trace-production",
        environment: "production",
      },
    };

    await ingestionService.mergeAndWrite(
      "trace",
      projectId,
      traceId,
      now,
      [traceCreate] as any[],
      false,
    );

    const traces = mockClickhouseWriter.queue[TableName.Traces];
    expect(traces).toHaveLength(1);

    // Should preserve the explicitly set production environment
    expect(traces[0].data.environment).toBe("production");
  });

  it("should preserve early environment when later events have undefined environment (Steffen911 concern)", async () => {
    const traceId = uuidv4();
    const projectId = "project-123";
    const now = new Date();

    // Event 1: Early event with explicit staging environment
    const traceCreate = {
      id: uuidv4(),
      type: eventTypes.TRACE_CREATE,
      timestamp: now.toISOString(),
      body: {
        id: traceId,
        name: "trace-early-env",
        environment: "staging",
      },
    };

    // Event 2: Later event without environment field (undefined)
    const traceUpdate1 = {
      id: uuidv4(),
      type: eventTypes.TRACE_CREATE,
      timestamp: new Date(now.getTime() + 100).toISOString(),
      body: {
        id: traceId,
        name: "trace-early-env-updated",
        // environment is undefined here
      },
    };

    // Event 3: Another update without environment
    const traceUpdate2 = {
      id: uuidv4(),
      type: eventTypes.TRACE_CREATE,
      timestamp: new Date(now.getTime() + 200).toISOString(),
      body: {
        id: traceId,
        output: { result: "done" },
        // environment is undefined here too
      },
    };

    await ingestionService.mergeAndWrite(
      "trace",
      projectId,
      traceId,
      now,
      [traceCreate, traceUpdate1, traceUpdate2] as any[],
      false,
    );

    const traces = mockClickhouseWriter.queue[TableName.Traces];
    expect(traces).toHaveLength(1);

    // Should preserve the original "staging" environment from the early event
    // because later events have undefined environment (not explicit "default")
    expect(traces[0].data.environment).toBe("staging");
  });
});
