import { EvaluatorBlockReason } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendEvaluatorBlockedEmail } from "./sendEvaluatorBlockedEmail";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock("nodemailer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nodemailer")>();
  return { ...actual, createTransport: () => ({ sendMail }) };
});

describe("sendEvaluatorBlockedEmail", () => {
  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({ rejected: [], pending: [] });
  });

  it("names the cloud data region of the project", async () => {
    await sendEvaluatorBlockedEmail({
      env: {
        EMAIL_FROM_ADDRESS: "noreply@langfuse.com",
        SMTP_CONNECTION_URL: "smtp://user:pass@localhost:25",
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
      },
      projectName: "langfuse-docs",
      evaluatorName: "completeness",
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
      blockMessage: "No LLM connection found.",
      resolutionUrl: "https://cloud.langfuse.com/project/p1/settings",
      receiverEmail: "admin@acme.com",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const { html } = sendMail.mock.calls[0][0] as { html: string };
    const text = html.replaceAll("<!-- -->", "");
    expect(text).toContain(
      "in project &quot;langfuse-docs&quot; (EU data region) was automatically paused",
    );
  });
});
