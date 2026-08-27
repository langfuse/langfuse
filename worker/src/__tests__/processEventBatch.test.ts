import { beforeEach, describe, it, expect, assert, vi } from "vitest";
import { eventTypes } from "../../../packages/shared/src/server/ingestion/types";
import { processEventBatch } from "../../../packages/shared/src/server/ingestion/processEventBatch";
import {
  createUnknownSdkIngestionAttribution,
  UNKNOWN_INGESTION_SDK_VALUE,
} from "../../../packages/shared/src/server/ingestion/ingestionAttribution";

const { getQueueInstanceMock, queueAddMock, uploadJsonMock } = vi.hoisted(
  () => ({
    getQueueInstanceMock: vi.fn(),
    queueAddMock: vi.fn(),
    uploadJsonMock: vi.fn(),
  }),
);

vi.mock("../../../packages/shared/src/server/redis/redis", () => ({
  redis: {},
}));

vi.mock("../../../packages/shared/src/env", () => ({
  env: {
    LANGFUSE_INGESTION_PROCESSING_SAMPLED_PROJECTS: new Map(),
    LANGFUSE_INGESTION_QUEUE_DELAY_MS: 5000,
    LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "event-upload",
    LANGFUSE_S3_EVENT_UPLOAD_PREFIX: "",
    LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "false",
    LANGFUSE_SKIP_S3_LIST_FOR_OBSERVATIONS_PROJECT_IDS: "",
  },
}));

vi.mock("../../../packages/shared/src/server/redis/ingestionQueue", () => ({
  IngestionQueue: {
    getInstance: getQueueInstanceMock,
  },
}));

vi.mock("../../../packages/shared/src/server/services/StorageService", () => ({
  StorageService: undefined,
  StorageServiceFactory: {
    getInstance: () => ({
      uploadJson: uploadJsonMock,
    }),
  },
}));

const createTraceCreateEvent = () => {
  const timestamp = "2024-10-12T12:13:14.123Z";

  return {
    id: "event-id",
    timestamp,
    type: eventTypes.TRACE_CREATE,
    body: {
      id: "trace-id",
      timestamp,
      name: "trace",
      environment: "default",
    },
  };
};

describe("processEventBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueueInstanceMock.mockReturnValue({ add: queueAddMock });
    queueAddMock.mockResolvedValue(undefined);
    uploadJsonMock.mockResolvedValue(undefined);
  });

  it("returns early on empty input", async () => {
    // Auth check with missing projectId will cause an exception unless
    // there is an early return in processEventBatch
    const authCheck = {
      validKey: true as const,
      scope: {
        projectId: null,
        accessLevel: "project" as const,
      },
    };

    const attribution = createUnknownSdkIngestionAttribution({ authCheck });

    assert.doesNotThrow(
      async () => await processEventBatch([], authCheck, { attribution }),
      "UnauthorizedError",
    );

    const res = await processEventBatch([], authCheck, { attribution });
    expect(res.successes).toEqual([]);
    expect(res.errors).toEqual([]);
  });

  it("adds request attribution to ingestion queue payloads", async () => {
    const authCheck = {
      validKey: true as const,
      scope: {
        projectId: "project-id",
        accessLevel: "project" as const,
        publicKey: "pk-lf-public",
      },
    };

    const result = await processEventBatch(
      [createTraceCreateEvent()],
      authCheck,
      {
        delay: 0,
        attribution: {
          ingestionApiKey: "pk-lf-attributed",
          ingestionSdkName: "python",
          ingestionSdkVersion: "3.4.0",
        },
      },
    );

    expect(result).toEqual({
      successes: [{ id: "event-id", status: 201 }],
      errors: [],
    });
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    expect(queueAddMock.mock.calls[0][1].payload.data).toMatchObject({
      ingestionApiKey: "pk-lf-attributed",
      ingestionSdkName: "python",
      ingestionSdkVersion: "3.4.0",
    });
  });

  it("forwards explicit unknown SDK attribution", async () => {
    const authCheck = {
      validKey: true as const,
      scope: {
        projectId: "project-id",
        accessLevel: "project" as const,
        publicKey: "pk-lf-public",
      },
    };

    await processEventBatch([createTraceCreateEvent()], authCheck, {
      delay: 0,
      attribution: createUnknownSdkIngestionAttribution({ authCheck }),
    });

    expect(queueAddMock.mock.calls[0][1].payload.data).toMatchObject({
      ingestionApiKey: "pk-lf-public",
      ingestionSdkName: UNKNOWN_INGESTION_SDK_VALUE,
      ingestionSdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
    });
  });
});
