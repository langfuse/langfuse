import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFileContents, shadowAuth } = vi.hoisted(() => ({
  getFileContents: vi.fn(),
  shadowAuth: vi.fn(),
}));

vi.mock("@/src/features/skills/server", () => ({
  SkillService: class {
    getFileContents = getFileContents;
  },
}));

vi.mock("@/src/features/public-api/server/shadowAuth", () => ({ shadowAuth }));

vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({
      rateLimitRequest: async () => ({ isRateLimited: () => false }),
    }),
  },
}));

vi.mock("@/src/features/ai-gateway/server", () => ({
  verifyGatewayIngestionAuthorization: vi.fn(),
}));

vi.mock("@/src/features/public-api/server", async () => {
  const { createAuthedProjectAPIRoute } =
    await import("@/src/features/public-api/server/createAuthedProjectAPIRoute");
  const { withMiddlewares } =
    await import("@/src/features/public-api/server/withMiddlewares");
  return { createAuthedProjectAPIRoute, withMiddlewares };
});

import handler from "@/src/pages/api/public/unstable/skills/files/content";

const hashes = [
  Buffer.alloc(32, 251).toString("base64"),
  Buffer.alloc(32, 255).toString("base64"),
];

async function request(sha256Hashes?: string, method: "GET" | "POST" = "GET") {
  const params = new URLSearchParams();
  if (sha256Hashes !== undefined) params.set("sha256Hashes", sha256Hashes);
  const url = `/api/public/unstable/skills/files/content?${params}`;
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    url,
    headers: { authorization: "Basic test" },
    query: Object.fromEntries(new URL(url, "http://localhost").searchParams),
    ...(method === "POST" ? { body: { sha256Hashes: hashes } } : {}),
  });
  await handler(req, res);
  return res;
}

describe("GET /api/public/unstable/skills/files/content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shadowAuth.mockResolvedValue({
      success: true,
      scope: {
        projectId: "project-1",
        orgId: "org-1",
        accessLevel: "project",
      },
    });
    getFileContents.mockResolvedValue({ data: [] });
  });

  it("decodes comma-separated base64 hashes and retrieves content with read authorization", async () => {
    const data = hashes.map((sha256Hash) => ({ sha256Hash, content: "text" }));
    getFileContents.mockResolvedValue({ data });

    const res = await request(hashes.join(","));

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ data });
    expect(res.getHeader("cache-control")).toBe("no-store");
    expect(getFileContents).toHaveBeenCalledWith({
      projectId: "project-1",
      sha256Hashes: hashes,
    });
    expect(shadowAuth).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skills:read" }),
    );
  });

  it("accepts 50 hashes and rejects 51 before invoking the service", async () => {
    const batch = Array.from({ length: 51 }, (_, index) =>
      Buffer.alloc(32, index).toString("base64"),
    );
    expect((await request(batch.slice(0, 50).join(","))).statusCode).toBe(200);
    expect(getFileContents).toHaveBeenCalledWith({
      projectId: "project-1",
      sha256Hashes: batch.slice(0, 50),
    });

    getFileContents.mockClear();
    expect((await request(batch.join(","))).statusCode).toBe(400);
    expect(getFileContents).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "not-a-sha256-hash", `${hashes[0]},`])(
    "rejects an invalid hash query: %s",
    async (query) => {
      expect((await request(query)).statusCode).toBe(400);
      expect(getFileContents).not.toHaveBeenCalled();
    },
  );

  it("does not accept POST", async () => {
    expect((await request(undefined, "POST")).statusCode).toBe(405);
    expect(getFileContents).not.toHaveBeenCalled();
  });
});
