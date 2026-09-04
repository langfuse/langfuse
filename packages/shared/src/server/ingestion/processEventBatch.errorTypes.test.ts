import { describe, expect, it, vi, beforeEach } from "vitest";
import { eventTypes } from "./types";
import { processEventBatch } from "./processEventBatch";
import { BaseError } from "../../errors/BaseError";
import { InternalServerError } from "../../errors/InternalServerError";
import { ServiceUnavailableError } from "../../errors/ServiceUnavailableError";

const { getQueueInstanceMock, queueAddMock, uploadJsonMock } = vi.hoisted(
  () => ({
    getQueueInstanceMock: vi.fn(),
    queueAddMock: vi.fn(),
    uploadJsonMock: vi.fn(),
  }),
);

vi.mock("../../redis/redis", () => ({
  redis: {},
}));

vi.mock("../../env", () => ({
  env: {
    LANGFUSE_INGESTION_PROCESSING_SAMPLED_PROJECTS: new Map(),
    LANGFUSE_INGESTION_QUEUE_DELAY_MS: 5000,
    LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "event-upload",
    LANGFUSE_S3_EVENT_UPLOAD_PREFIX: "",
    LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "false",
    LANGFUSE_SKIP_S3_LIST_FOR_OBSERVATIONS_PROJECT_IDS: "",
  },
}));

vi.mock("../../redis/ingestionQueue", () => ({
  IngestionQueue: {
    getInstance: getQueueInstanceMock,
  },
}));

vi.mock("../services/StorageService", () => ({
  StorageService: undefined,
  StorageServiceFactory: {
    getInstance: () => ({
      uploadJson: uploadJsonMock,
    }),
  },
}));

const createTraceCreateEvent = () => ({
  id: "event-id",
  timestamp: "2024-10-12T12:13:14.123Z",
  type: eventTypes.TRACE_CREATE,
  body: {
    id: "trace-id",
    timestamp: "2024-10-12T12:13:14.123Z",
    name: "trace",
    environment: "default",
  },
});

describe("processEventBatch error types (906 parity)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueueInstanceMock.mockReturnValue({ add: queueAddMock });
    queueAddMock.mockResolvedValue(undefined);
    uploadJsonMock.mockResolvedValue(undefined);
  });

  it("typed errors are BaseError subclasses with correct httpCode", () => {
    const internal = new InternalServerError("x");
    const unavailable = new ServiceUnavailableError("y");
    expect(internal).toBeInstanceOf(BaseError);
    expect(internal.httpCode).toBe(500);
    expect(unavailable).toBeInstanceOf(BaseError);
    expect(unavailable.httpCode).toBe(503);
    // Not confused with programming errors
    expect(new TypeError("x")).not.toBeInstanceOf(BaseError);
  });

  it("throws InternalServerError when S3 upload fails (not bare Error)", async () => {
    uploadJsonMock.mockRejectedValue(new Error("S3 SlowDown"));
    const authCheck = {
      validKey: true as const,
      scope: {
        projectId: "project-id",
        accessLevel: "project" as const,
      },
    };
    const attribution = {
      ingestionApiKey: "pk-lf",
      ingestionSdkName: "python",
      ingestionSdkVersion: "1.0",
    };
    await expect(
      processEventBatch([createTraceCreateEvent()], authCheck, {
        delay: 0,
        attribution,
      }),
    ).rejects.toBeInstanceOf(InternalServerError);
    await expect(
      processEventBatch([createTraceCreateEvent()], authCheck, {
        delay: 0,
        attribution,
      }),
    ).rejects.toBeInstanceOf(BaseError);
    // Ensure bare Error would not satisfy this — demonstrates fix
    await expect(
      processEventBatch([createTraceCreateEvent()], authCheck, {
        delay: 0,
        attribution,
      }),
    ).rejects.not.toBeInstanceOf(TypeError);
  });
});
