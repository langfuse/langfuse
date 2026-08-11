/** @vitest-environment node */
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import handler from "@/src/pages/api/project/[projectId]/members";

const { getServerAuthSessionMock, getProjectMemberNamesMock } = vi.hoisted(
  () => ({
    getServerAuthSessionMock: vi.fn(),
    getProjectMemberNamesMock: vi.fn(),
  }),
);

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

vi.mock("@/src/features/rbac/server/getProjectMemberNames", () => ({
  getProjectMemberNames: getProjectMemberNamesMock,
}));

const createRequest = ({
  method = "GET",
  projectId = "project-1",
}: {
  method?: string;
  projectId?: string | string[];
} = {}) =>
  createMocks<NextApiRequest, NextApiResponse>({
    method,
    query: { projectId },
  });

const projectMemberSession = {
  user: {
    organizations: [
      {
        id: "organization-1",
        projects: [{ id: "project-1" }],
      },
    ],
  },
};

describe("GET /api/project/[projectId]/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerAuthSessionMock.mockResolvedValue(projectMemberSession);
    getProjectMemberNamesMock.mockResolvedValue([
      { id: "user-1", name: "Ada Lovelace" },
      { id: "user-2", name: "Grace Hopper" },
    ]);
  });

  it("returns all project member names", async () => {
    const { req, res } = createRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      members: [
        { id: "user-1", name: "Ada Lovelace" },
        { id: "user-2", name: "Grace Hopper" },
      ],
    });
    expect(getProjectMemberNamesMock).toHaveBeenCalledWith({
      projectId: "project-1",
      orgId: "organization-1",
    });
  });

  it("rejects unauthenticated requests", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);
    const { req, res } = createRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(getProjectMemberNamesMock).not.toHaveBeenCalled();
  });

  it("rejects access to projects outside the session", async () => {
    const { req, res } = createRequest({ projectId: "project-2" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(getProjectMemberNamesMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid project id", async () => {
    const { req, res } = createRequest({ projectId: [] });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(getProjectMemberNamesMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods", async () => {
    const { req, res } = createRequest({ method: "POST" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(getServerAuthSessionMock).not.toHaveBeenCalled();
  });
});
