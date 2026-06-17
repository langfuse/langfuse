const { getServerAuthSessionMock } = vi.hoisted(() => ({
  getServerAuthSessionMock: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

import { getServerSideProps } from "@/src/pages/project/~/[[...path]]";
import { type GetServerSidePropsContext } from "next";

const makeCtx = (
  params?: Record<string, string | string[]>,
  resolvedUrl = "/project/~/",
): GetServerSidePropsContext =>
  ({
    req: {},
    res: {},
    params,
    resolvedUrl,
  }) as unknown as GetServerSidePropsContext;

const makeSession = (projectIds: string[]) => ({
  user: {
    organizations: [
      {
        id: "org-1",
        projects: projectIds.map((id) => ({ id })),
      },
    ],
  },
});

describe("sentinel redirect /project/~/", () => {
  beforeEach(() => vi.clearAllMocks());

  it("unauthenticated: redirects to sign-in with callbackUrl", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    const result = await getServerSideProps(
      makeCtx(undefined, "/project/~/traces"),
    );

    expect(result).toEqual({
      redirect: {
        destination: `/auth/sign-in?callbackUrl=${encodeURIComponent("/project/~/traces")}`,
        permanent: false,
      },
    });
  });

  it("no accessible projects: redirects to /", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession([]));

    const result = await getServerSideProps(makeCtx());

    expect(result).toEqual({
      redirect: { destination: "/", permanent: false },
    });
  });

  it("first project, no sub-path: redirects to /project/{id}", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));

    const result = await getServerSideProps(makeCtx());

    expect(result).toEqual({
      redirect: { destination: "/project/proj-abc", permanent: false },
    });
  });

  it("single path segment: rewrites correctly", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));

    const result = await getServerSideProps(makeCtx({ path: ["traces"] }));

    expect(result).toEqual({
      redirect: { destination: "/project/proj-abc/traces", permanent: false },
    });
  });

  it("nested path: rewrites all segments", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));

    const result = await getServerSideProps(
      makeCtx({ path: ["traces", "trace-123"] }),
    );

    expect(result).toEqual({
      redirect: {
        destination: "/project/proj-abc/traces/trace-123",
        permanent: false,
      },
    });
  });

  it("deeply nested path: rewrites all segments", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));

    const result = await getServerSideProps(
      makeCtx({ path: ["settings", "models", "model-456"] }),
    );

    expect(result).toEqual({
      redirect: {
        destination: "/project/proj-abc/settings/models/model-456",
        permanent: false,
      },
    });
  });

  it("multiple accessible projects: uses the first", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession(["proj-first", "proj-second"]),
    );

    const result = await getServerSideProps(makeCtx({ path: ["traces"] }));

    expect(result).toEqual({
      redirect: {
        destination: "/project/proj-first/traces",
        permanent: false,
      },
    });
  });
});
