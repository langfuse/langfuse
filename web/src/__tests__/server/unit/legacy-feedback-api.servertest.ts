import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendToSlack } = vi.hoisted(() => ({
  mockSendToSlack: vi.fn(),
}));

vi.mock("@/src/features/slack/server/slack-webhook", () => ({
  sendToSlack: mockSendToSlack,
}));

import handler from "@/src/pages/api/feedback";

describe("legacy /api/feedback", () => {
  beforeEach(() => {
    mockSendToSlack.mockReset();
    mockSendToSlack.mockResolvedValue({ status: 200 });
  });

  it("forwards the historical self-hosted payload unchanged", async () => {
    const body = {
      type: "feedback",
      feedback: "Please improve this workflow.",
      url: "https://self-hosted.example.com/project/example",
      user: { email: "user@example.com" },
    };
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ status: "OK" });
    expect(mockSendToSlack).toHaveBeenCalledWith(body);
  });

  it("preserves the historical GET behavior", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendToSlack).toHaveBeenCalledWith({});
  });
});
