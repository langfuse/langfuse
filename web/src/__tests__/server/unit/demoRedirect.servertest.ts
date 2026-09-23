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

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: prismaMock,
}));

import { type GetServerSidePropsContext } from "next";
import { getServerSideProps as getDemoServerSideProps } from "@/src/pages/demo/[[...path]]";

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
    });
    getServerAuthSessionMock.mockResolvedValue(null);
  });

  it("redirects authenticated users with demo project access to the configured regional demo project", async () => {
    getServerAuthSessionMock.mockResolvedValue({
      user: {
        id: "user-1",
        organizations: [
          {
            projects: [{ id: "demo-project" }],
          },
        ],
      },
    });

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
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
  });

  it("falls back home for authenticated users without demo project access", async () => {
    getServerAuthSessionMock.mockResolvedValue({
      user: {
        id: "user-1",
        organizations: [
          {
            projects: [{ id: "other-project" }],
          },
        ],
      },
    });

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: "/",
        permanent: false,
      },
    });
  });

  it("falls back home when the session has no database user", async () => {
    getServerAuthSessionMock.mockResolvedValue({
      user: null,
    });

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: "/",
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
  });

  it("redirects authenticated users from demo subpaths to the same demo project subpath", async () => {
    getServerAuthSessionMock.mockResolvedValue({
      user: {
        id: "user-1",
        organizations: [
          {
            projects: [{ id: "demo-project" }],
          },
        ],
      },
    });

    await expect(
      getDemoServerSideProps(
        makeCtx({
          resolvedUrl: "/demo/datasets/dataset-1/items?foo=bar",
        }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: "/project/demo-project/datasets/dataset-1/items?foo=bar",
        permanent: false,
      },
    });
  });

  it("redirects unauthenticated users to sign up with the demo subpath target", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(
      getDemoServerSideProps(
        makeCtx({
          resolvedUrl: "/demo/datasets/dataset-1/items?foo=bar",
        }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-up?targetPath=${encodeURIComponent(
          "/demo/datasets/dataset-1/items?foo=bar",
        )}`,
        permanent: false,
      },
    });
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

  it("redirects unauthenticated users to sign in with the demo subpath target when sign-up is disabled", async () => {
    mockEnv.env.AUTH_DISABLE_SIGNUP = "true";
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(
      getDemoServerSideProps(
        makeCtx({
          resolvedUrl: "/demo/datasets/dataset-1/items?foo=bar",
        }),
      ),
    ).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-in?targetPath=${encodeURIComponent(
          "/demo/datasets/dataset-1/items?foo=bar",
        )}`,
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

  it("falls back to home when the deployment is not Langfuse Cloud", async () => {
    mockEnv.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

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
    getServerAuthSessionMock.mockResolvedValue({
      user: {
        id: "user-1",
        organizations: [
          {
            projects: [{ id: "demo-project" }],
          },
        ],
      },
    });
    prismaMock.project.findUnique.mockResolvedValue(null);

    await expect(getDemoServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: "/",
        permanent: false,
      },
    });
  });
});
