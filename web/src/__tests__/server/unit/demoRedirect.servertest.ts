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

type DemoCtxOverrides = {
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

describe("demo redirect page", () => {
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
    prismaMock.organizationMembership.upsert.mockResolvedValue({});
    getServerAuthSessionMock.mockResolvedValue(null);
  });

  it("redirects authenticated users to the configured regional demo project without changing memberships", async () => {
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
    expect(prismaMock.organizationMembership.upsert).not.toHaveBeenCalled();
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
          resolvedUrl: "/demo",
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

  it("redirects unauthenticated users to sign up with the demo target", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-up?targetPath=${encodeURIComponent("/demo")}`,
        permanent: false,
      },
    });
    expect(prismaMock.project.findUnique).toHaveBeenCalled();
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
