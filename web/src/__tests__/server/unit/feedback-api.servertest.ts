import { ServiceUnavailableError } from "@langfuse/shared/src/errors";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRateLimitRequest, mockSubmitFeedback, mockVerifyAuth } = vi.hoisted(
  () => ({
    mockRateLimitRequest: vi.fn(),
    mockSubmitFeedback: vi.fn(),
    mockVerifyAuth: vi.fn(),
  }),
);

vi.mock("@/src/features/feedback/server/FeedbackService", () => ({
  submitFeedback: mockSubmitFeedback,
}));

vi.mock("@/src/features/public-api/server/apiAuth", () => {
  function ApiAuthService() {
    return {
      verifyAuthHeaderAndReturnScope: mockVerifyAuth,
    };
  }

  return { ApiAuthService };
});

vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({
      rateLimitRequest: mockRateLimitRequest,
    }),
  },
}));

import handler from "@/src/pages/api/public/feedback";

const validScope = {
  projectId: "project-1",
  orgId: "org-1",
  plan: "oss",
  rateLimitOverrides: [],
  apiKeyId: "api-key-1",
  publicKey: "pk-test",
  accessLevel: "project",
  isIngestionSuspended: false,
  isInAppAgentKey: false,
};

const validBody = {
  targetType: "docs",
  target: "skill-feedback.md",
  feedback: "Please mention the MCP feedback tool.",
  goal: "I wanted to send feedback after using a Langfuse skill.",
  referenceUrl: "https://langfuse.com/docs",
};

const createRequest = (body: unknown) =>
  createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    headers: {
      authorization: "Basic test",
      "content-type": "application/json",
    },
    body,
  });

describe("POST /api/public/feedback", () => {
  beforeEach(() => {
    mockRateLimitRequest.mockReset();
    mockSubmitFeedback.mockReset();
    mockVerifyAuth.mockReset();

    mockRateLimitRequest.mockResolvedValue(undefined);
    mockSubmitFeedback.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    mockVerifyAuth.mockResolvedValue({
      validKey: true,
      scope: validScope,
    });
  });

  it("posts feedback and returns a correlation id", async () => {
    const { req, res } = createRequest(validBody);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(JSON.parse(res._getData())).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(mockSubmitFeedback).toHaveBeenCalledWith({
      input: validBody,
      authScope: validScope,
    });
  });

  it("returns 400 for a null body", async () => {
    const { req, res } = createRequest(null);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Invalid request data",
    });
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });

  it("returns 503 when the feedback sink is unavailable", async () => {
    mockSubmitFeedback.mockRejectedValueOnce(
      new ServiceUnavailableError("Feedback Slack sink rejected message"),
    );
    const { req, res } = createRequest(validBody);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(503);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Feedback Slack sink rejected message",
      error: "ServiceUnavailableError",
    });
  });
});
