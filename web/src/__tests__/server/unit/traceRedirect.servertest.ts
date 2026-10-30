const { getServerAuthSessionMock, getTracesByIdsForAnyProjectMock } =
  vi.hoisted(() => ({
    getServerAuthSessionMock: vi.fn(),
    getTracesByIdsForAnyProjectMock: vi.fn(),
  }));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

vi.mock("@langfuse/shared/src/server", () => ({
  getTracesByIdsForAnyProject: getTracesByIdsForAnyProjectMock,
}));

import { type GetServerSidePropsContext } from "next";
import { type Role } from "@langfuse/shared/src/db";
import { getServerSideProps } from "@/src/features/traces/server/getTraceRedirectPageServerSideProps";

const makeCtx = (
  params?: Record<string, string | string[]>,
  resolvedUrl = "/trace/trace-123",
): GetServerSidePropsContext =>
  ({
    params,
    req: {
      headers: {
        host: "cloud.langfuse.com",
        "x-forwarded-proto": "https",
      },
      cookies: {},
    },
    res: {},
    resolvedUrl,
  }) as unknown as GetServerSidePropsContext;

const makeSession = (
  projects: Array<{ id: string; role?: Role }>,
  options: { admin?: boolean } = {},
) => ({
  user: {
    admin: options.admin ?? false,
    organizations: [
      {
        id: "org-1",
        projects: projects.map((p) => ({
          id: p.id,
          role: p.role ?? ("MEMBER" as Role),
        })),
      },
    ],
  },
});

describe("trace redirect /trace/[traceId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unauthenticated: redirects to sign-in and does not query traces", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);
    getTracesByIdsForAnyProjectMock.mockResolvedValue([
      { id: "trace-123", projectId: "proj-secret" },
    ]);

    const result = await getServerSideProps(
      makeCtx({ traceId: "trace-123" }, "/trace/trace-123"),
    );

    expect(result).toEqual({
      redirect: {
        destination: `/auth/sign-in?targetPath=${encodeURIComponent("/trace/trace-123")}`,
        permanent: false,
      },
    });
    expect(getTracesByIdsForAnyProjectMock).not.toHaveBeenCalled();
  });

  it("missing or empty traceId: returns notFound", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession([{ id: "proj-abc" }]),
    );

    const resultWithoutParams = await getServerSideProps(makeCtx(undefined));
    expect(resultWithoutParams).toEqual({
      props: { notFound: true },
    });

    const resultWithEmptyTraceId = await getServerSideProps(
      makeCtx({ traceId: "" }),
    );
    expect(resultWithEmptyTraceId).toEqual({
      props: { notFound: true },
    });

    expect(getTracesByIdsForAnyProjectMock).not.toHaveBeenCalled();
  });

  it("trace does not exist in ClickHouse: returns notFound", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession([{ id: "proj-abc" }]),
    );
    getTracesByIdsForAnyProjectMock.mockResolvedValue([]);

    const result = await getServerSideProps(
      makeCtx({ traceId: "trace-nonexistent" }),
    );

    expect(result).toEqual({
      props: { notFound: true },
    });
    expect(getTracesByIdsForAnyProjectMock).toHaveBeenCalledWith([
      "trace-nonexistent",
    ]);
  });

  it("trace exists in project user does not have access to: returns notFound without leaking projectId", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession([{ id: "proj-user" }]),
    );
    getTracesByIdsForAnyProjectMock.mockResolvedValue([
      { id: "trace-other", projectId: "proj-other" },
    ]);

    const result = await getServerSideProps(
      makeCtx({ traceId: "trace-other" }),
    );

    expect(result).toEqual({
      props: { notFound: true },
    });
  });

  it("trace exists in project user has access to: redirects to project trace URL", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession([{ id: "proj-abc", role: "VIEWER" }]),
    );
    getTracesByIdsForAnyProjectMock.mockResolvedValue([
      { id: "trace-123", projectId: "proj-abc" },
    ]);

    const result = await getServerSideProps(makeCtx({ traceId: "trace-123" }));

    expect(result).toEqual({
      redirect: {
        destination: "/project/proj-abc/traces/trace-123",
        permanent: false,
      },
    });
  });

  it("admin user: can redirect to trace in any project", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession([], { admin: true }),
    );
    getTracesByIdsForAnyProjectMock.mockResolvedValue([
      { id: "trace-any", projectId: "proj-any" },
    ]);

    const result = await getServerSideProps(makeCtx({ traceId: "trace-any" }));

    expect(result).toEqual({
      redirect: {
        destination: "/project/proj-any/traces/trace-any",
        permanent: false,
      },
    });
  });

  it("duplicate traces exist across projects, but only one is accessible: redirects to accessible project", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession([{ id: "proj-my", role: "MEMBER" }]),
    );
    getTracesByIdsForAnyProjectMock.mockResolvedValue([
      { id: "trace-shared", projectId: "proj-other" },
      { id: "trace-shared", projectId: "proj-my" },
    ]);

    const result = await getServerSideProps(
      makeCtx({ traceId: "trace-shared" }),
    );

    expect(result).toEqual({
      redirect: {
        destination: "/project/proj-my/traces/trace-shared",
        permanent: false,
      },
    });
  });

  it("duplicate traces exist across accessible projects: returns duplicatesFound", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession([
        { id: "proj-1", role: "MEMBER" },
        { id: "proj-2", role: "VIEWER" },
      ]),
    );
    getTracesByIdsForAnyProjectMock.mockResolvedValue([
      { id: "trace-dup", projectId: "proj-1" },
      { id: "trace-dup", projectId: "proj-2" },
    ]);

    const result = await getServerSideProps(makeCtx({ traceId: "trace-dup" }));

    expect(result).toEqual({
      props: { duplicatesFound: true },
    });
  });

  it("user has role NONE in project: returns notFound", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession([{ id: "proj-none", role: "NONE" as Role }]),
    );
    getTracesByIdsForAnyProjectMock.mockResolvedValue([
      { id: "trace-restricted", projectId: "proj-none" },
    ]);

    const result = await getServerSideProps(
      makeCtx({ traceId: "trace-restricted" }),
    );

    expect(result).toEqual({
      props: { notFound: true },
    });
  });
});
