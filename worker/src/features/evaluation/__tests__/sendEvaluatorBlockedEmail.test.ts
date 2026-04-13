import { EvaluatorBlockReason } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateTransport, mockParseConnectionUrl, mockSendMail } =
  vi.hoisted(() => ({
    mockCreateTransport: vi.fn(),
    mockParseConnectionUrl: vi.fn(),
    mockSendMail: vi.fn(),
  }));

vi.mock("nodemailer", () => ({
  createTransport: mockCreateTransport,
}));

vi.mock("nodemailer/lib/shared/index.js", () => ({
  parseConnectionUrl: mockParseConnectionUrl,
}));

import { sendEvaluatorBlockedEmail } from "@langfuse/shared/src/server/services/email/evaluatorBlocked/sendEvaluatorBlockedEmail";

describe("sendEvaluatorBlockedEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseConnectionUrl.mockReturnValue({});
    mockCreateTransport.mockReturnValue({
      sendMail: mockSendMail,
    });
    mockSendMail.mockResolvedValue(undefined);
  });

  it("includes the project name in the rendered email html", async () => {
    await sendEvaluatorBlockedEmail({
      env: {
        EMAIL_FROM_ADDRESS: "noreply@example.com",
        SMTP_CONNECTION_URL: "smtp://langfuse",
      },
      evaluatorName: "Hallucination judge",
      projectName: "Customer Support",
      blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
      blockMessage: "LLM connection missing",
      resolutionUrl: "https://cloud.langfuse.com/project/cs/evals",
      receiverEmail: "admin@example.com",
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0]?.[0]?.html).toContain("Customer Support");
  });
});
