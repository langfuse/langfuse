import { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";

vi.mock("../../env", () => ({
  env: {
    // Nothing listens on port 1, so delivery fails with a connection error.
    SMTP_CONNECTION_URL: "smtp://127.0.0.1:1",
    EMAIL_FROM_ADDRESS: "gateway@example.test",
    NEXTAUTH_URL: "http://localhost:3000",
  },
}));

import { env } from "../../env";
import { notificationQueueProcessor } from "../notificationQueue";

function createGatewayInvitationJob() {
  return {
    id: "job-1",
    data: {
      timestamp: new Date(),
      id: "job-1",
      name: "notification-job",
      payload: {
        type: "AI_GATEWAY_INVITATION",
        orgId: "org-1",
        orgName: "Acme",
        to: "grace@company.com",
        audience: { kind: "member" },
        inviterName: "Ada Lovelace",
        inviterEmail: "ada@company.com",
      },
    },
  } as Job<TQueueJobTypes[QueueName.NotificationQueue]>;
}

describe("notificationQueueProcessor", () => {
  it("fails an AI Gateway invitation job when delivery fails, so it is retried", async () => {
    await expect(
      notificationQueueProcessor(createGatewayInvitationJob()),
    ).rejects.toThrow();
  });

  it("fails an AI Gateway invitation job when the worker has no SMTP configured", async () => {
    const smtpConnectionUrl = env.SMTP_CONNECTION_URL;
    Object.assign(env, { SMTP_CONNECTION_URL: undefined });
    try {
      await expect(
        notificationQueueProcessor(createGatewayInvitationJob()),
      ).rejects.toThrow("Missing SMTP_CONNECTION_URL");
    } finally {
      Object.assign(env, { SMTP_CONNECTION_URL: smtpConnectionUrl });
    }
  });
});
