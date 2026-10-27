const mockEnv = vi.hoisted(() => ({
  env: {
    NEXTAUTH_URL: "https://us.cloud.langfuse.com",
    NEXTAUTH_COOKIE_DOMAIN: "langfuse.com",
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "US",
    NEXT_PUBLIC_DEMO_ORG_ID: "demo-org" as string | undefined,
    VERCEL: undefined as string | undefined,
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

const {
  getServerAuthSessionMock,
  readLastVisitedProjectMock,
  forgetLastVisitedProjectMock,
  getSignupOnboardingStatusMock,
} = vi.hoisted(() => ({
  getServerAuthSessionMock: vi.fn(),
  readLastVisitedProjectMock: vi.fn(),
  forgetLastVisitedProjectMock: vi.fn(),
  getSignupOnboardingStatusMock: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

vi.mock("@/src/features/projects/server/lastVisitedProject", () => ({
  readLastVisitedProject: readLastVisitedProjectMock,
  forgetLastVisitedProject: forgetLastVisitedProjectMock,
}));

vi.mock("@/src/features/onboarding/server", () => ({
  getSignupOnboardingStatus: getSignupOnboardingStatusMock,
}));

import { type GetServerSidePropsContext } from "next";
import { getLandingServerSideProps } from "@/src/features/projects/server/getLandingServerSideProps";
import {
  resolveLandingDestination,
  type LandingInput,
} from "@/src/features/projects/server/resolveLandingDestination";
import {
  projectCookieName,
  type ProjectCookie,
} from "@/src/server/utils/cookies";

const project = (id: string, hasTraces = true) => ({ id, hasTraces });

const acme = {
  id: "acme",
  projects: [project("acme-api"), project("acme-web")],
  canCreateProjects: true,
};

const resolve = (overrides: Partial<LandingInput>) =>
  resolveLandingDestination({
    organizations: [],
    rememberedProjectIds: [],
    canCreateOrganizations: true,
    demoOrganizationId: "demo-org",
    hasPendingSignupOnboarding: async () => false,
    ...overrides,
  });

describe("resolveLandingDestination", () => {
  describe("with a remembered project", () => {
    it("opens it while it is still readable", async () => {
      expect(
        await resolve({
          organizations: [acme],
          rememberedProjectIds: [null, "acme-web"],
        }),
      ).toEqual({
        destination: "/project/acme-web",
        shouldForgetRememberedProject: false,
      });
    });

    it("opens a project that never received data on its tracing setup", async () => {
      const { destination } = await resolve({
        organizations: [
          { ...acme, projects: [...acme.projects, project("fresh", false)] },
        ],
        rememberedProjectIds: ["fresh"],
      });
      expect(destination).toBe("/project/fresh/traces");
    });

    it("shows the overview with a note and forgets it once it was deleted or access was removed", async () => {
      expect(
        await resolve({
          organizations: [acme],
          rememberedProjectIds: ["gone"],
        }),
      ).toEqual({
        destination: "/organization/acme?notice=last-project-unavailable",
        shouldForgetRememberedProject: true,
      });
    });
  });

  describe("without a remembered project", () => {
    it("opens the only project", async () => {
      const { destination } = await resolve({
        organizations: [{ ...acme, projects: [project("solo", false)] }],
      });
      expect(destination).toBe("/project/solo/traces");
    });

    it("opens the only project that has data", async () => {
      const { destination } = await resolve({
        organizations: [
          {
            ...acme,
            projects: [project("empty", false), project("busy")],
          },
        ],
      });
      expect(destination).toBe("/project/busy");
    });

    it("welcomes a user with several candidates on the overview of their organization", async () => {
      const { destination } = await resolve({ organizations: [acme] });
      expect(destination).toBe("/organization/acme?notice=welcome");
    });

    it("uses the cross-organization overview when projects span organizations", async () => {
      const { destination } = await resolve({
        organizations: [
          acme,
          {
            id: "globex",
            projects: [project("chat")],
            canCreateProjects: false,
          },
        ],
      });
      expect(destination).toBe("/organizations?notice=welcome");
    });

    it("does not count the shared demo project as one of the user's own", async () => {
      const { destination } = await resolve({
        organizations: [
          {
            id: "demo-org",
            projects: [project("demo")],
            canCreateProjects: false,
          },
          {
            id: "acme",
            projects: [project("mine", false)],
            canCreateProjects: true,
          },
        ],
      });
      expect(destination).toBe("/project/mine/traces");
    });
  });

  describe("without any project", () => {
    it("starts project creation where the user may create one", async () => {
      const { destination } = await resolve({
        organizations: [
          { id: "viewer-org", projects: [], canCreateProjects: false },
          { id: "owner-org", projects: [], canCreateProjects: true },
        ],
      });
      expect(destination).toBe(
        "/organization/owner-org/setup?orgstep=create-project",
      );
    });

    it("opens the organization when the user cannot create projects", async () => {
      const { destination } = await resolve({
        organizations: [
          { id: "viewer-org", projects: [], canCreateProjects: false },
        ],
      });
      expect(destination).toBe("/organization/viewer-org");
    });

    it("sends a brand-new user without an organization through signup onboarding first", async () => {
      const { destination } = await resolve({
        hasPendingSignupOnboarding: async () => true,
      });
      expect(destination).toBe("/onboarding");
    });

    it("then to organization setup, the demo project, or the overview", async () => {
      expect((await resolve({})).destination).toBe("/setup");
      expect(
        (
          await resolve({
            canCreateOrganizations: false,
            organizations: [
              {
                id: "demo-org",
                projects: [project("demo")],
                canCreateProjects: false,
              },
            ],
          })
        ).destination,
      ).toBe("/project/demo");
      expect(
        (await resolve({ canCreateOrganizations: false })).destination,
      ).toBe("/organizations");
    });

    it("still forgets a remembered project that is gone", async () => {
      expect(
        (await resolve({ rememberedProjectIds: ["gone"] }))
          .shouldForgetRememberedProject,
      ).toBe(true);
    });
  });
});

describe("getLandingServerSideProps for /", () => {
  const makeCtx = ({
    cookie,
    resolvedUrl = "/",
  }: { cookie?: ProjectCookie; resolvedUrl?: string } = {}) => {
    const setHeader = vi.fn();
    const ctx = {
      req: {
        headers: {
          host: "us.cloud.langfuse.com",
          "x-forwarded-proto": "https",
        },
        cookies: cookie ? { [projectCookieName]: JSON.stringify(cookie) } : {},
      },
      res: { setHeader },
      resolvedUrl,
    } as unknown as GetServerSidePropsContext;
    return { ctx, setHeader };
  };

  const makeSession = (projectIds: string[]) => ({
    user: {
      id: "user-1",
      admin: false,
      canCreateOrganizations: true,
      organizations: [
        {
          id: "org-1",
          role: "OWNER",
          projects: projectIds.map((id) => ({ id, hasTraces: true })),
        },
      ],
    },
  });

  const redirectTo = (destination: string) => ({
    redirect: { destination, permanent: false },
  });

  const cookieFor = (projectId: string, userId = "user-1") => ({
    origin: "https://us.cloud.langfuse.com",
    projectId,
    userId,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    readLastVisitedProjectMock.mockResolvedValue(null);
    getSignupOnboardingStatusMock.mockResolvedValue({ completed: true });
  });

  it("renders the page for signed-out users so the client guard handles sign-in", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    expect(await getLandingServerSideProps(makeCtx().ctx)).toEqual({
      props: {},
    });
  });

  it("prefers this browser's cookie and skips the per-user record", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1", "p2"]));

    const result = await getLandingServerSideProps(
      makeCtx({ cookie: cookieFor("p2") }).ctx,
    );

    expect(result).toEqual(redirectTo("/project/p2"));
    expect(readLastVisitedProjectMock).not.toHaveBeenCalled();
  });

  it("ignores a cookie another user set in this browser and uses the per-user record", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1", "p2", "p3"]));
    readLastVisitedProjectMock.mockResolvedValue("p3");

    const result = await getLandingServerSideProps(
      makeCtx({ cookie: cookieFor("p2", "someone-else") }).ctx,
    );

    expect(result).toEqual(redirectTo("/project/p3"));
    expect(readLastVisitedProjectMock).toHaveBeenCalledWith("user-1");
  });

  it("falls back to the per-user record when the cookie's project was deleted", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1", "p3"]));
    readLastVisitedProjectMock.mockResolvedValue("p3");

    const { ctx, setHeader } = makeCtx({ cookie: cookieFor("deleted") });
    const result = await getLandingServerSideProps(ctx);

    expect(result).toEqual(redirectTo("/project/p3"));
    expect(setHeader).not.toHaveBeenCalled();
  });

  it("clears both memories when the remembered project is gone everywhere", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1", "p2"]));
    readLastVisitedProjectMock.mockResolvedValue("revoked");

    const { ctx, setHeader } = makeCtx({ cookie: cookieFor("deleted") });
    const result = await getLandingServerSideProps(ctx);

    expect(result).toEqual(
      redirectTo("/organization/org-1?notice=last-project-unavailable"),
    );
    expect(setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining(`${projectCookieName}=; `),
    );
    expect(setHeader.mock.calls[0]?.[1]).toContain("Max-Age=0");
    expect(forgetLastVisitedProjectMock).toHaveBeenCalledWith("user-1");
  });

  it("forwards the query string to the project", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1"]));

    const result = await getLandingServerSideProps(
      makeCtx({ resolvedUrl: "/?shell=classic" }).ctx,
    );

    expect(result).toEqual(redirectTo("/project/p1?shell=classic"));
  });
});
