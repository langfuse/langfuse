/** @jest-environment node */
import { type NextApiRequest, type NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

jest.mock("@langfuse/shared/src/server", () => {
  const { eventTypes } = jest.requireActual("@langfuse/shared/src/server");

  return {
    eventTypes,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    QueueJobs: {
      IngestionJob: "ingestion-job",
      OtelIngestionJob: "otel-ingestion-job",
    },
    SecondaryIngestionQueue: {
      getInstance: jest.fn(),
    },
    OtelIngestionQueue: {
      getInstance: jest.fn(),
    },
  };
});

import handler from "../../pages/api/admin/ingestion-replay";
import { AdminApiAuthService } from "../../ee/features/admin-api/server/adminApiAuth";
import {
  OtelIngestionQueue,
  QueueJobs,
  SecondaryIngestionQueue,
} from "@langfuse/shared/src/server";

describe("/api/admin/ingestion-replay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AdminApiAuthService, "handleAdminAuth").mockReturnValue(true);
  });

  it("groups replay jobs by shard-aware queue instance before addBulk", async () => {
    const standardQueueA = {
      name: "secondary-ingestion-queue",
      addBulk: jest.fn(),
    };
    const standardQueueB = {
      name: "secondary-ingestion-queue-1",
      addBulk: jest.fn(),
    };
    const otelQueueA = { name: "otel-ingestion-queue", addBulk: jest.fn() };
    const otelQueueB = { name: "otel-ingestion-queue-1", addBulk: jest.fn() };

    (SecondaryIngestionQueue.getInstance as jest.Mock).mockImplementation(
      ({ shardingKey }: { shardingKey?: string }) => {
        if (shardingKey === "project-1-event-body-1") {
          return standardQueueA;
        }

        if (shardingKey === "project-2-event-body-2") {
          return standardQueueB;
        }

        return null;
      },
    );

    (OtelIngestionQueue.getInstance as jest.Mock).mockImplementation(
      ({ shardingKey }: { shardingKey?: string }) => {
        if (
          shardingKey ===
          "project-1-otel/project-1/2026/03/16/10/00/file-a.json"
        ) {
          return otelQueueA;
        }

        if (
          shardingKey ===
          "project-2-otel/project-2/2026/03/16/10/00/file-b.json"
        ) {
          return otelQueueB;
        }

        return null;
      },
    );

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: {
        keys: [
          "project-1/trace/event-body-1/file-a.json",
          "project-2/trace/event-body-2/file-b.json",
          "otel/project-1/2026/03/16/10/00/file-a.json",
          "otel/project-2/2026/03/16/10/00/file-b.json",
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchObject({
      queued: 4,
      skipped: 0,
      errors: [],
    });

    expect(SecondaryIngestionQueue.getInstance).toHaveBeenNthCalledWith(1, {
      shardingKey: "project-1-event-body-1",
    });
    expect(SecondaryIngestionQueue.getInstance).toHaveBeenNthCalledWith(2, {
      shardingKey: "project-2-event-body-2",
    });
    expect(OtelIngestionQueue.getInstance).toHaveBeenNthCalledWith(1, {
      shardingKey: "project-1-otel/project-1/2026/03/16/10/00/file-a.json",
    });
    expect(OtelIngestionQueue.getInstance).toHaveBeenNthCalledWith(2, {
      shardingKey: "project-2-otel/project-2/2026/03/16/10/00/file-b.json",
    });

    expect(standardQueueA.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: QueueJobs.IngestionJob,
        data: expect.objectContaining({
          payload: expect.objectContaining({
            data: expect.objectContaining({
              type: "trace-create",
              eventBodyId: "event-body-1",
            }),
            authCheck: expect.objectContaining({
              scope: { projectId: "project-1" },
            }),
          }),
        }),
      }),
    ]);
    expect(standardQueueB.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: QueueJobs.IngestionJob,
      }),
    ]);
    expect(otelQueueA.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: QueueJobs.OtelIngestionJob,
        data: expect.objectContaining({
          payload: expect.objectContaining({
            data: expect.objectContaining({
              fileKey: "otel/project-1/2026/03/16/10/00/file-a.json",
            }),
            authCheck: expect.objectContaining({
              scope: expect.objectContaining({
                projectId: "project-1",
              }),
            }),
          }),
        }),
      }),
    ]);
    expect(otelQueueB.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: QueueJobs.OtelIngestionJob,
      }),
    ]);
  });

  it("skips unsupported standard replay types", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: {
        keys: ["project-1/sdk-log/event-body-1/file-a.json"],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchObject({
      queued: 0,
      skipped: 1,
      errors: ["Unsupported replay type: sdk-log"],
    });
    expect(SecondaryIngestionQueue.getInstance).not.toHaveBeenCalled();
    expect(OtelIngestionQueue.getInstance).not.toHaveBeenCalled();
  });
});
