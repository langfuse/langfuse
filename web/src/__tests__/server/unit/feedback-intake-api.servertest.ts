import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "@/src/env.mjs";

const { mockSubmitFeedback } = vi.hoisted(() => ({
  mockSubmitFeedback: vi.fn(),
}));

vi.mock("@/src/features/feedback/server/FeedbackService", () => ({
  submitFeedback: mockSubmitFeedback,
}));

import handler from "@/src/pages/api/feedback/docs-mcp";

const token = "a".repeat(32);
const body = {
  targetType: "docs",
  target: "/docs/mcp",
  feedback: "Please clarify setup.",
};

const createRequest = (authorization = `Bearer ${token}`) =>
  createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body,
  });

describe("POST /api/feedback/docs-mcp", () => {
  const originalToken = (env as any).LANGFUSE_FEEDBACK_INTAKE_TOKEN;

  beforeEach(() => {
    (env as any).LANGFUSE_FEEDBACK_INTAKE_TOKEN = token;
    mockSubmitFeedback.mockReset();
    mockSubmitFeedback.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
  });

  afterAll(() => {
    (env as any).LANGFUSE_FEEDBACK_INTAKE_TOKEN = originalToken;
  });

  it("accepts docs MCP feedback with the source credential", async () => {
    const { req, res } = createRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(JSON.parse(res._getData())).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(mockSubmitFeedback).toHaveBeenCalledWith({
      input: body,
      source: "langfuse-docs-mcp",
    });
  });

  it("rejects an invalid source credential", async () => {
    const { req, res } = createRequest("Bearer wrong-token");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });
});
