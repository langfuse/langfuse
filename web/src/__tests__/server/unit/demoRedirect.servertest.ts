const mockEnv = vi.hoisted(() => ({
  env: {
    AUTH_DISABLE_SIGNUP: undefined as string | undefined,
    NEXT_PUBLIC_DEMO_ORG_ID: "demo-org" as string | undefined,
    NEXT_PUBLIC_DEMO_PROJECT_ID: "demo-project" as string | undefined,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU" as
      | "EU"
      | "US"
      | "JP"
      | "HIPAA"
      | "DEV"
      | "STAGING"
      | undefined,
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
import { getServerSideProps as getDemoServerSideProps } from "@/src/pages/demo/index";
import { getServerSideProps as getDemoTraceServerSideProps } from "@/src/pages/demo/[traceId]";

type DemoCtxOverrides = {
  params?: GetServerSidePropsContext["params"];
  resolvedUrl?: string;
  req?: {
    cookies?: Partial<Record<string, string>>;
    headers?: Partial<Record<string, string>>;
  };
};

const makeCtx = (overrides: DemoCtxOverrides = {}): GetServerSidePropsContext =>
  ({
    req: {
      cookies: {},
      headers: {
        host: "cloud.langfuse.com",
        "x-forwarded-proto": "https",
      },
    },
    res: {},
    resolvedUrl: "/demo",
    ...overrides,
  }) as unknown as GetServerSidePropsContext;

describe("demo redirect pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.env.AUTH_DISABLE_SIGNUP = undefined;
    mockEnv.env.NEXT_PUBLIC_DEMO_ORG_ID = "demo-org";
    mockEnv.env.NEXT_PUBLIC_DEMO_PROJECT_ID = "demo-project";
    mockEnv.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
    mockEnv.env.NEXT_PUBLIC_SIGN_UP_DISABLED = "false";
    prismaMock.project.findUnique.mockResolvedValue({
      id: "demo-project",
      orgId: "demo-org",
    });
    getServerAuthSessionMock.mockResolvedValue(null);
  });

  it("redirects authenticated users from /demo to the configured demo project", async () => {
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
        id: true,
      },
    });
  });

  it("bounces to the project-cookie region before resolving demo redirects", async () => {
    await expect(
      getDemoServerSideProps(
        makeCtx({
          req: {
            cookies: {
              "langfuse.project": JSON.stringify({
                origin: "https://us.cloud.langfuse.com",
                projectId: "project-1",
              }),
            },
            headers: {
              host: "cloud.langfuse.com",
              "x-forwarded-proto": "https",
            },
          },
          resolvedUrl: "/demo/trace-123",
        }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: "https://us.cloud.langfuse.com/demo/trace-123",
        permanent: false,
      },
    });

    expect(getServerAuthSessionMock).not.toHaveBeenCalled();
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
  });

  it("bounces to the first detected session-cookie region when current host is unauthenticated", async () => {
    await expect(
      getDemoServerSideProps(
        makeCtx({
          req: {
            cookies: {
              "__Secure-next-auth.session-token.US": "token",
              "__Secure-next-auth.session-token.EU": "token",
            },
            headers: {
              host: "jp.cloud.langfuse.com",
              "x-forwarded-proto": "https",
            },
          },
        }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: "https://us.cloud.langfuse.com/demo",
        permanent: false,
      },
    });

    expect(getServerAuthSessionMock).not.toHaveBeenCalled();
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
  });

  it("stays on the current host when it already has a matching session cookie", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(
      getDemoServerSideProps(
        makeCtx({
          req: {
            cookies: {
              "__Secure-next-auth.session-token.EU": "token",
            },
            headers: {
              host: "cloud.langfuse.com",
              "x-forwarded-proto": "https",
            },
          },
        }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-up?targetPath=${encodeURIComponent("/demo")}`,
        permanent: false,
      },
    });
  });

  it("redirects authenticated users from /demo/[traceId] to the demo trace page", async () => {
    getServerAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });

    await expect(
      getDemoTraceServerSideProps(makeCtx({ params: { traceId: "trace-1" } })),
    ).resolves.toEqual({
      redirect: {
        destination: "/project/demo-project/traces/trace-1",
        permanent: false,
      },
    });
  });

  it("redirects unauthenticated users from /demo to sign up with demo targetPath", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-up?targetPath=${encodeURIComponent("/demo")}`,
        permanent: false,
      },
    });
    expect(prismaMock.project.findUnique).toHaveBeenCalled();
  });

  it("redirects unauthenticated users from /demo/[traceId] to sign up with trace targetPath", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(
      getDemoTraceServerSideProps(
        makeCtx({ params: { traceId: "trace-for-demo" } }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-up?targetPath=${encodeURIComponent("/demo/trace-for-demo")}`,
        permanent: false,
      },
    });
  });

  it("redirects unauthenticated users from /demo/[traceId] to sign in when sign-up is disabled", async () => {
    mockEnv.env.AUTH_DISABLE_SIGNUP = "true";
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(
      getDemoTraceServerSideProps(
        makeCtx({ params: { traceId: "trace-for-demo" } }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-in?targetPath=${encodeURIComponent("/demo/trace-for-demo")}`,
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
  });

  it("falls back to home when /demo/[traceId] is called without a valid trace id", async () => {
    await expect(
      getDemoTraceServerSideProps(
        makeCtx({ params: { traceId: ["trace-a", "trace-b"] } }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: "/",
        permanent: false,
      },
    });
    expect(getServerAuthSessionMock).not.toHaveBeenCalled();
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
  });
});
