const mockEnv = vi.hoisted(() => ({
  env: {
    NEXTAUTH_URL: "https://us.cloud.langfuse.com",
    NEXTAUTH_COOKIE_DOMAIN: "langfuse.com",
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "US",
    VERCEL: undefined as string | undefined,
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

const { getServerAuthSessionMock } = vi.hoisted(() => ({
  getServerAuthSessionMock: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

import handler from "@/src/pages/api/last-project";
import { type NextApiRequest, type NextApiResponse } from "next";

const makeSession = (projectIds: string[]) => ({
  user: {
    organizations: [
      { id: "org-1", projects: projectIds.map((id) => ({ id })) },
    ],
  },
});

const makeReqRes = (opts: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}) => {
  const setHeader = vi.fn();
  const json = vi.fn();
  const end = vi.fn();
  const status = vi.fn().mockReturnValue({ json, end });
  const req = {
    method: opts.method ?? "POST",
    body: opts.body,
    headers: opts.headers ?? { host: "us.cloud.langfuse.com" },
  } as unknown as NextApiRequest;
  const res = { setHeader, status } as unknown as NextApiResponse;
  return { req, res, setHeader, status, json, end };
};

describe("POST /api/last-project", () => {
  beforeEach(() => vi.clearAllMocks());

  it("non-POST method: returns 405 without setting a cookie", async () => {
    const { req, res, status, setHeader } = makeReqRes({ method: "GET" });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(405);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it("unauthenticated: returns 401 without setting a cookie", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);
    const { req, res, status, setHeader } = makeReqRes({
      body: { projectId: "proj-abc" },
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(401);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it("member project: sets cookie with server-derived origin", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));
    const { req, res, status, setHeader } = makeReqRes({
      body: { projectId: "proj-abc" },
      headers: {
        host: "us.cloud.langfuse.com",
        "x-forwarded-proto": "https",
      },
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(204);
    expect(setHeader).toHaveBeenCalledTimes(1);
    const [header, value] = setHeader.mock.calls[0];
    expect(header).toBe("Set-Cookie");
    expect(value).toContain("langfuse.last-project=");
    const cookieJson = JSON.parse(
      decodeURIComponent((value as string).split("=")[1].split(";")[0]),
    );
    expect(cookieJson).toEqual({
      origin: "https://us.cloud.langfuse.com",
      projectId: "proj-abc",
    });
    expect(value).toContain("Domain=langfuse.com");
    expect(value).toContain("HttpOnly");
  });

  it("server-derived origin ignores client-supplied origin in body", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));
    const { req, res, setHeader } = makeReqRes({
      body: { projectId: "proj-abc", origin: "https://evil.example.com" },
      headers: {
        host: "us.cloud.langfuse.com",
        "x-forwarded-proto": "https",
      },
    });

    await handler(req, res);

    const value = setHeader.mock.calls[0][1] as string;
    const cookieJson = JSON.parse(
      decodeURIComponent(value.split("=")[1].split(";")[0]),
    );
    expect(cookieJson.origin).toBe("https://us.cloud.langfuse.com");
  });

  it("non-member project: no-op (no cookie), returns 204", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));
    const { req, res, status, setHeader } = makeReqRes({
      body: { projectId: "proj-other" },
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(204);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it("invalid body: returns 400", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));
    const { req, res, status, setHeader } = makeReqRes({ body: {} });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(setHeader).not.toHaveBeenCalled();
  });
});
