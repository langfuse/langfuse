/** @jest-environment node */

import { createMocks } from "node-mocks-http";
import handler from "@/src/pages/api/admin/bullmq/metrics";
import { type NextApiRequest, type NextApiResponse } from "next";
import {
  IngestionQueue,
  TraceUpsertQueue,
  OtelIngestionQueue,
  getQueue,
  logger,
} from "@langfuse/shared/src/server";

type QueueMock = {
  exportPrometheusMetrics: jest.Mock<Promise<string | undefined>, []>;
};

const buildQueue = (metric?: string): QueueMock => ({
  exportPrometheusMetrics: jest.fn().mockResolvedValue(metric),
});

jest.mock("@langfuse/shared/src/server", () => {
  const QueueName = {
    IngestionQueue: "ingestion-queue",
    TraceUpsert: "trace-upsert",
    OtelIngestionQueue: "otel-ingestion-queue",
    BatchExport: "batch-export-queue",
  } as const;

  return {
    __esModule: true,
    QueueName,
    logger: { error: jest.fn() },
    IngestionQueue: { getInstance: jest.fn() },
    TraceUpsertQueue: { getInstance: jest.fn() },
    OtelIngestionQueue: { getInstance: jest.fn() },
    getQueue: jest.fn(),
  };
});

describe("/api/admin/bullmq/metrics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns aggregated metrics while filtering undefined values", async () => {
    (IngestionQueue.getInstance as jest.Mock).mockReturnValue(
      buildQueue("ingestion metrics"),
    );
    (TraceUpsertQueue.getInstance as jest.Mock).mockReturnValue(
      buildQueue(undefined),
    );
    (OtelIngestionQueue.getInstance as jest.Mock).mockReturnValue(
      buildQueue("otel metrics"),
    );
    (getQueue as jest.Mock).mockReturnValue(buildQueue("batch metrics"));

    const { req, res } = createMocks({ method: "GET" });

    await handler(
      req as unknown as NextApiRequest,
      res as unknown as NextApiResponse,
    );

    expect(res._getStatusCode()).toBe(200);
    const body = res._getData();
    expect(body).toBe("ingestion metrics\notel metrics\nbatch metrics");
    const headers = res._getHeaders();
    expect(headers["content-type"]).toBe("text/plain");
    expect(headers["content-length"]).toBe(
      Buffer.byteLength(body, "utf-8").toString(),
    );
  });

  it("rejects non-GET requests", async () => {
    const { req, res } = createMocks({ method: "POST" });

    await handler(
      req as unknown as NextApiRequest,
      res as unknown as NextApiResponse,
    );

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({ error: "Method Not Allowed" });
  });

  it("logs and returns 500 when queue resolution fails", async () => {
    (IngestionQueue.getInstance as jest.Mock).mockImplementation(() => {
      throw new Error("boom");
    });

    const { req, res } = createMocks({ method: "GET" });

    await handler(
      req as unknown as NextApiRequest,
      res as unknown as NextApiResponse,
    );

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: "Internal Server Error" });
    expect((logger.error as jest.Mock).mock.calls[0][0]).toBe(
      "Error fetching BullMQ metrics",
    );
    expect((logger.error as jest.Mock).mock.calls[0][1]).toBeInstanceOf(Error);
  });
});
