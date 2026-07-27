const mockEnv = vi.hoisted(() => ({
  env: {
    AUTH_DISABLE_SIGNUP: undefined as string | undefined,
    NEXT_PUBLIC_DEMO_PROJECT_ID: "demo-project" as string | undefined,
    NEXT_PUBLIC_SIGN_UP_DISABLED: "false" as "true" | "false",
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

const { getServerAuthSessionMock } = vi.hoisted(() => ({
  getServerAuthSessionMock: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

import { type GetServerSidePropsContext } from "next";
import { getServerSideProps } from "@/src/pages/demo";

const makeCtx = (): GetServerSidePropsContext =>
  ({
    req: {},
    res: {},
  }) as unknown as GetServerSidePropsContext;

describe("demo redirect page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.env.AUTH_DISABLE_SIGNUP = undefined;
    mockEnv.env.NEXT_PUBLIC_DEMO_PROJECT_ID = "demo-project";
    mockEnv.env.NEXT_PUBLIC_SIGN_UP_DISABLED = "false";
  });

  it("redirects authenticated users to the configured regional demo project", async () => {
    getServerAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });

    await expect(getServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: "/project/demo-project/traces",
        permanent: false,
      },
    });
  });

  it("redirects unauthenticated users to sign up with the demo target", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(getServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-up?targetPath=${encodeURIComponent("/demo")}`,
        permanent: false,
      },
    });
  });

  it("redirects unauthenticated users to sign in when sign-up is disabled", async () => {
    mockEnv.env.AUTH_DISABLE_SIGNUP = "true";
    getServerAuthSessionMock.mockResolvedValue(null);

    await expect(getServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: `/auth/sign-in?targetPath=${encodeURIComponent("/demo")}`,
        permanent: false,
      },
    });
  });

  it("falls back to home when no demo project is configured", async () => {
    mockEnv.env.NEXT_PUBLIC_DEMO_PROJECT_ID = undefined;

    await expect(getServerSideProps(makeCtx())).resolves.toEqual({
      redirect: {
        destination: "/",
        permanent: false,
      },
    });
    expect(getServerAuthSessionMock).not.toHaveBeenCalled();
  });
});
