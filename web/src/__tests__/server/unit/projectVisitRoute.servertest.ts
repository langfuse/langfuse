import { ServerResponse, type IncomingMessage } from "http";
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

const { getServerAuthSessionMock, recordLastVisitedProjectMock } = vi.hoisted(
  () => ({
    getServerAuthSessionMock: vi.fn(),
    recordLastVisitedProjectMock: vi.fn(),
  }),
);

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

vi.mock("@/src/features/projects/server/lastVisitedProject", () => ({
  recordLastVisitedProject: recordLastVisitedProjectMock,
}));

import handler from "@/src/pages/api/project/[projectId]/visit";
import { type NextApiRequest, type NextApiResponse } from "next";

const makeSession = (projectIds: string[]) => ({
  user: {
    id: "user-1",
    organizations: [
      { id: "org-1", projects: projectIds.map((id) => ({ id })) },
    ],
  },
});

const makeReqRes = (opts: {
  method?: string;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
}) => {
  const json = vi.fn();
  const end = vi.fn();
  const status = vi.fn().mockReturnValue({ json, end });
  const req = {
    method: opts.method ?? "POST",
    query: opts.query ?? {},
    headers: opts.headers ?? { host: "us.cloud.langfuse.com" },
  } as unknown as NextApiRequest;
  const res = Object.assign(
    new ServerResponse(req as unknown as IncomingMessage),
    { status },
  ) as unknown as NextApiResponse;
  const setHeader = vi.spyOn(res, "setHeader");
  return { req, res, setHeader, status, json, end };
};

describe("POST /api/project/visit", () => {
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
      query: { projectId: "proj-abc" },
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(401);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it("member project: sets cookie with server-derived origin", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));
    const { req, res, status, setHeader } = makeReqRes({
      query: { projectId: "proj-abc" },
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
    expect(value).toContain("langfuse.project=");
    const cookieJson = JSON.parse(
      decodeURIComponent((value as string).split("=")[1].split(";")[0]),
    );
    expect(cookieJson).toEqual({
      origin: "https://us.cloud.langfuse.com",
      projectId: "proj-abc",
      userId: "user-1",
    });
    expect(value).toContain("Domain=langfuse.com");
    expect(value).toContain("HttpOnly");
  });

  it("preserves refreshed session cookies when recording a member project", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));
    const { req, res } = makeReqRes({ query: { projectId: "proj-abc" } });
    res.setHeader("Set-Cookie", ["session-token=refreshed; HttpOnly"]);

    await handler(req, res);

    expect(res.getHeader("Set-Cookie")).toEqual([
      "session-token=refreshed; HttpOnly",
      expect.stringContaining("langfuse.project="),
    ]);
  });

  it("non-member project: no-op (no cookie), returns 204", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));
    const { req, res, status, setHeader } = makeReqRes({
      query: { projectId: "proj-other" },
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(204);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it("missing project id: returns 400", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));
    const { req, res, status, setHeader } = makeReqRes({ query: {} });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it("array project id: returns 400", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));
    const { req, res, status, setHeader } = makeReqRes({
      query: { projectId: ["proj-abc", "proj-xyz"] },
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(setHeader).not.toHaveBeenCalled();
  });
});
