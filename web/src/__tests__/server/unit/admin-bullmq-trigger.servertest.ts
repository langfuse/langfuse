import { type NextApiRequest, type NextApiResponse } from "next";
import type * as SharedServer from "@langfuse/shared/src/server";

const { getQueueMock } = vi.hoisted(() => ({
  getQueueMock: vi.fn(),
}));

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    env: {
      ...actual.env,
      ADMIN_API_KEY: "test-admin-key",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    },
  };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return {
    ...actual,
    getQueue: getQueueMock,
  };
});

import handler from "@/src/pages/api/admin/bullmq";
import { QueueJobs, QueueName } from "@langfuse/shared/src/server";

const makeReqRes = (opts: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}) => {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const req = {
    method: opts.method ?? "POST",
    headers: opts.headers ?? { authorization: "Bearer test-admin-key" },
    body: opts.body,
  } as unknown as NextApiRequest;
  const res = { status } as unknown as NextApiResponse;
  return { req, res, status, json };
};

describe("POST /api/admin/bullmq action=trigger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enqueues a one-off core data export job", async () => {
    const add = vi.fn().mockResolvedValue({ id: "job-1" });
    getQueueMock.mockReturnValue({ add });

    const { req, res, status, json } = makeReqRes({
      body: {
        action: "trigger",
        queueName: QueueName.CoreDataS3ExportQueue,
      },
    });

    await handler(req, res);

    expect(getQueueMock).toHaveBeenCalledWith(QueueName.CoreDataS3ExportQueue);
    expect(add).toHaveBeenCalledWith(QueueJobs.CoreDataS3ExportJob, {});
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1" }),
    );
  });

  it("returns 400 when the queue is not instantiated on this container", async () => {
    getQueueMock.mockReturnValue(null);

    const { req, res, status, json } = makeReqRes({
      body: {
        action: "trigger",
        queueName: QueueName.CoreDataS3ExportQueue,
      },
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("not available"),
      }),
    );
  });

  it("rejects queues outside the trigger allowlist", async () => {
    const { req, res, status } = makeReqRes({
      body: {
        action: "trigger",
        queueName: QueueName.IngestionQueue,
      },
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(getQueueMock).not.toHaveBeenCalled();
  });

  it("rejects requests without a valid admin token", async () => {
    const { req, res, status } = makeReqRes({
      headers: { authorization: "Bearer wrong-key" },
      body: {
        action: "trigger",
        queueName: QueueName.CoreDataS3ExportQueue,
      },
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(401);
    expect(getQueueMock).not.toHaveBeenCalled();
  });
});
