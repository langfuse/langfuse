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

import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
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

  it("requires authentication", async () => {
    mockVerifyAuth.mockResolvedValueOnce({
      validKey: false,
      error: "Invalid authorization header",
    });

    const { req, res } = createRequest({
      targetType: "docs",
      target: "skill-feedback.md",
      feedback: "Please mention the MCP feedback tool.",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Invalid authorization header",
    });
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });

  it("posts feedback and returns a correlation id", async () => {
    const body = {
      targetType: "docs",
      target: "skill-feedback.md",
      feedback: "Please mention the MCP feedback tool.",
      goal: "I wanted to send feedback after using a Langfuse skill.",
      referenceUrl: "https://langfuse.com/docs",
    };
    const { req, res } = createRequest(body);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(JSON.parse(res._getData())).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(mockSubmitFeedback).toHaveBeenCalledWith({
      input: body,
      authScope: validScope,
    });
  });

  it("validates the request body before submitting feedback", async () => {
    const { req, res } = createRequest({
      targetType: "docs",
      target: "skill-feedback.md",
      feedback: "",
      metadata: { unexpected: true },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Invalid request data",
    });
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });
});
