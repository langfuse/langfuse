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

import {
  lastProjectCookieName,
  type LastProjectCookie,
} from "@/src/server/utils/cookies";
import { getServerSideProps } from "@/src/pages/project/~/[[...path]]";
import { type GetServerSidePropsContext } from "next";

const makeCtx = (
  params?: Record<string, string | string[]>,
  resolvedUrl = "/project/~/",
  req: {
    host?: string;
    proto?: string;
    cookie?: LastProjectCookie;
  } = {},
): GetServerSidePropsContext =>
  ({
    req: {
      headers: {
        host: req.host ?? "us.cloud.langfuse.com",
        "x-forwarded-proto": req.proto ?? "https",
      },
      cookies: req.cookie
        ? { [lastProjectCookieName]: JSON.stringify(req.cookie) }
        : {},
    },
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

  it("path segment with reserved chars: encodes each segment", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-abc"]));

    const result = await getServerSideProps(
      makeCtx({ path: ["prompts", "What is X?"] }),
    );

    expect(result).toEqual({
      redirect: {
        destination: "/project/proj-abc/prompts/What%20is%20X%3F",
        permanent: false,
      },
    });
  });

  it("same-origin cookie, member project: redirects to cookie project", async () => {
    getServerAuthSessionMock.mockResolvedValue(
      makeSession(["proj-first", "proj-last"]),
    );

    const result = await getServerSideProps(
      makeCtx({ path: ["traces"] }, "/project/~/traces", {
        host: "us.cloud.langfuse.com",
        cookie: {
          origin: "https://us.cloud.langfuse.com",
          projectId: "proj-last",
        },
      }),
    );

    expect(result).toEqual({
      redirect: { destination: "/project/proj-last/traces", permanent: false },
    });
  });

  it("same-origin cookie, non-member project: falls back to first project", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-first"]));

    const result = await getServerSideProps(
      makeCtx({ path: ["traces"] }, "/project/~/traces", {
        host: "us.cloud.langfuse.com",
        cookie: {
          origin: "https://us.cloud.langfuse.com",
          projectId: "proj-gone",
        },
      }),
    );

    expect(result).toEqual({
      redirect: { destination: "/project/proj-first/traces", permanent: false },
    });
  });

  it("cross-region cookie, same parent domain: bounces to cookie origin sentinel", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-first"]));

    const result = await getServerSideProps(
      makeCtx({ path: ["traces"] }, "/project/~/traces", {
        host: "us.cloud.langfuse.com",
        cookie: {
          origin: "https://eu.cloud.langfuse.com",
          projectId: "proj-eu",
        },
      }),
    );

    expect(result).toEqual({
      redirect: {
        destination: "https://eu.cloud.langfuse.com/project/~/traces",
        permanent: false,
      },
    });
  });

  it("cross-origin cookie, different parent domain: falls back to first project", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-first"]));

    const result = await getServerSideProps(
      makeCtx({ path: ["traces"] }, "/project/~/traces", {
        host: "us.cloud.langfuse.com",
        cookie: {
          origin: "https://evil.example.com",
          projectId: "proj-evil",
        },
      }),
    );

    expect(result).toEqual({
      redirect: { destination: "/project/proj-first/traces", permanent: false },
    });
  });

  it("same-origin cookie: preserves query string on local redirect", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-last"]));

    const result = await getServerSideProps(
      makeCtx({ path: ["traces"] }, "/project/~/traces?foo=bar&baz=1", {
        host: "us.cloud.langfuse.com",
        cookie: {
          origin: "https://us.cloud.langfuse.com",
          projectId: "proj-last",
        },
      }),
    );

    expect(result).toEqual({
      redirect: {
        destination: "/project/proj-last/traces?foo=bar&baz=1",
        permanent: false,
      },
    });
  });

  it("cross-region bounce: preserves query string on cross-host redirect", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-first"]));

    const result = await getServerSideProps(
      makeCtx({ path: ["traces"] }, "/project/~/traces?foo=bar", {
        host: "us.cloud.langfuse.com",
        cookie: {
          origin: "https://eu.cloud.langfuse.com",
          projectId: "proj-eu",
        },
      }),
    );

    expect(result).toEqual({
      redirect: {
        destination: "https://eu.cloud.langfuse.com/project/~/traces?foo=bar",
        permanent: false,
      },
    });
  });

  it("first-project fallback: preserves query string", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["proj-first"]));

    const result = await getServerSideProps(
      makeCtx({ path: ["traces"] }, "/project/~/traces?foo=bar"),
    );

    expect(result).toEqual({
      redirect: {
        destination: "/project/proj-first/traces?foo=bar",
        permanent: false,
      },
    });
  });
});
