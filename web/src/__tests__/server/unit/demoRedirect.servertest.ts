const mockEnv = vi.hoisted(() => ({
  env: {
    AUTH_DISABLE_SIGNUP: undefined as string | undefined,
    NEXT_PUBLIC_DEMO_ORG_ID: "demo-org" as string | undefined,
    NEXT_PUBLIC_DEMO_PROJECT_ID: "demo-project" as string | undefined,
    NEXT_PUBLIC_SIGN_UP_DISABLED: "false" as "true" | "false",
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

const { getServerAuthSessionMock, prismaMock } = vi.hoisted(() => ({
  getServerAuthSessionMock: vi.fn(),
  prismaMock: {
    project: {
      findUnique: vi.fn(),
    },
    organizationMembership: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

vi.mock("@langfuse/shared/src/db", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, prisma: prismaMock };
});

import { type GetServerSidePropsContext } from "next";
import { getServerSideProps as getDemoServerSideProps } from "@/src/pages/demo";
import { getServerSideProps as getDemoTraceServerSideProps } from "@/src/pages/demo/traces/[traceId]";

const makeCtx = (
  overrides: Partial<GetServerSidePropsContext> = {},
): GetServerSidePropsContext =>
  ({
    req: {},
    res: {},
    ...overrides,
  }) as unknown as GetServerSidePropsContext;

describe("demo redirect page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.env.AUTH_DISABLE_SIGNUP = undefined;
    mockEnv.env.NEXT_PUBLIC_DEMO_ORG_ID = "demo-org";
    mockEnv.env.NEXT_PUBLIC_DEMO_PROJECT_ID = "demo-project";
    mockEnv.env.NEXT_PUBLIC_SIGN_UP_DISABLED = "false";
    prismaMock.project.findUnique.mockResolvedValue({ orgId: "demo-org" });
    prismaMock.organizationMembership.upsert.mockResolvedValue({});
  });

  it("ensures demo access before redirecting authenticated users to the configured regional demo project", async () => {
    getServerAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: "/project/demo-project/traces",
        permanent: false,
      },
    });
    expect(prismaMock.project.findUnique).toHaveBeenCalledWith({
      where: {
        orgId: "demo-org",
        id: "demo-project",
      },
      select: {
        orgId: true,
      },
    });
    expect(prismaMock.organizationMembership.upsert).toHaveBeenCalledWith({
      where: {
        orgId_userId: { orgId: "demo-org", userId: "user-1" },
      },
      update: {},
      create: {
        userId: "user-1",
        orgId: "demo-org",
        role: "VIEWER",
      },
    });
  });

  it("redirects unauthenticated users to sign up with the demo target", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-up?targetPath=${encodeURIComponent("/demo")}`,
        permanent: false,
      },
    });
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.organizationMembership.upsert).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to sign in when sign-up is disabled", async () => {
    mockEnv.env.AUTH_DISABLE_SIGNUP = "true";
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-in?targetPath=${encodeURIComponent("/demo")}`,
        permanent: false,
      },
    });
  });

  it("falls back to home when no demo project is configured", async () => {
    mockEnv.env.NEXT_PUBLIC_DEMO_PROJECT_ID = undefined;

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: "/",
        permanent: false,
      },
    });
    expect(getServerAuthSessionMock).not.toHaveBeenCalled();
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.organizationMembership.upsert).not.toHaveBeenCalled();
  });

  it("falls back to home when no demo organization is configured", async () => {
    mockEnv.env.NEXT_PUBLIC_DEMO_ORG_ID = undefined;

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: "/",
        permanent: false,
      },
    });
    expect(getServerAuthSessionMock).not.toHaveBeenCalled();
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.organizationMembership.upsert).not.toHaveBeenCalled();
  });

  it("falls back to home when the configured demo project does not exist", async () => {
    getServerAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.project.findUnique.mockResolvedValue(null);

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: "/",
        permanent: false,
      },
    });
    expect(prismaMock.organizationMembership.upsert).not.toHaveBeenCalled();
  });
});

describe("demo trace redirect page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.env.AUTH_DISABLE_SIGNUP = undefined;
    mockEnv.env.NEXT_PUBLIC_DEMO_ORG_ID = "demo-org";
    mockEnv.env.NEXT_PUBLIC_DEMO_PROJECT_ID = "demo-project";
    mockEnv.env.NEXT_PUBLIC_SIGN_UP_DISABLED = "false";
    prismaMock.project.findUnique.mockResolvedValue({ orgId: "demo-org" });
    prismaMock.organizationMembership.upsert.mockResolvedValue({});
  });

  it("ensures demo access before redirecting authenticated users to the regional demo trace", async () => {
    getServerAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });

    await expect(
      getDemoTraceServerSideProps(
        makeCtx({
          params: { traceId: "trace-1" },
          query: {
            traceId: "trace-1",
            observation: "obs-1",
            timestamp: "2026-03-08T18:27:00.703Z",
          },
        }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination:
          "/project/demo-project/traces/trace-1?observation=obs-1&timestamp=2026-03-08T18%3A27%3A00.703Z",
        permanent: false,
      },
    });
    expect(prismaMock.project.findUnique).toHaveBeenCalledWith({
      where: {
        orgId: "demo-org",
        id: "demo-project",
      },
      select: {
        orgId: true,
      },
    });
    expect(prismaMock.organizationMembership.upsert).toHaveBeenCalledWith({
      where: {
        orgId_userId: { orgId: "demo-org", userId: "user-1" },
      },
      update: {},
      create: {
        userId: "user-1",
        orgId: "demo-org",
        role: "VIEWER",
      },
    });
  });

  it("redirects unauthenticated users to sign up with the regional demo trace target", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    const targetPath =
      "/demo/traces/trace-1?observation=obs-1&timestamp=2026-03-08T18%3A27%3A00.703Z";

    await expect(
      getDemoTraceServerSideProps(
        makeCtx({
          params: { traceId: "trace-1" },
          query: {
            traceId: "trace-1",
            observation: "obs-1",
            timestamp: "2026-03-08T18:27:00.703Z",
          },
        }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-up?targetPath=${encodeURIComponent(
          targetPath,
        )}`,
        permanent: false,
      },
    });
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.organizationMembership.upsert).not.toHaveBeenCalled();
  });

  it("falls back to home when the configured demo trace project does not exist", async () => {
    getServerAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.project.findUnique.mockResolvedValue(null);

    await expect(
      getDemoTraceServerSideProps(
        makeCtx({
          params: { traceId: "trace-1" },
          query: { traceId: "trace-1" },
        }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: "/",
        permanent: false,
      },
    });
    expect(prismaMock.organizationMembership.upsert).not.toHaveBeenCalled();
  });
});
