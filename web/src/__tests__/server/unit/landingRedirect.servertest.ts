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

const { getServerAuthSessionMock, readLastVisitedProjectMock } = vi.hoisted(
  () => ({
    getServerAuthSessionMock: vi.fn(),
    readLastVisitedProjectMock: vi.fn(),
  }),
);

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

vi.mock("@/src/features/projects/server/lastVisitedProject", () => ({
  readLastVisitedProject: readLastVisitedProjectMock,
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

const landing = (overrides: Partial<LandingInput>): LandingInput => ({
  organizations: [],
  rememberedProjectIds: [],
  canCreateOrganizations: true,
  demoOrganizationId: "demo-org",
  ...overrides,
});

describe("resolveLandingDestination", () => {
  const acme = {
    id: "acme",
    projectIds: ["acme-api", "acme-web"],
    canCreateProjects: true,
  };

  it("opens the remembered project while it is still readable", () => {
    expect(
      resolveLandingDestination(
        landing({
          organizations: [acme],
          rememberedProjectIds: ["acme-web"],
        }),
      ),
    ).toBe("/project/acme-web");
  });

  it("skips a remembered project that was deleted or whose access was revoked", () => {
    expect(
      resolveLandingDestination(
        landing({
          organizations: [acme],
          rememberedProjectIds: ["gone", null, "acme-web"],
        }),
      ),
    ).toBe("/project/acme-web");
    expect(
      resolveLandingDestination(
        landing({ organizations: [acme], rememberedProjectIds: ["gone"] }),
      ),
    ).toBe("/project/acme-api");
  });

  it("does not fall back into the shared demo project while the user has their own", () => {
    expect(
      resolveLandingDestination(
        landing({
          organizations: [
            { id: "demo-org", projectIds: ["demo"], canCreateProjects: false },
            { id: "empty", projectIds: [], canCreateProjects: false },
            acme,
          ],
        }),
      ),
    ).toBe("/project/acme-api");
  });

  it("sends a member of project-less organizations to project creation", () => {
    expect(
      resolveLandingDestination(
        landing({
          organizations: [
            { id: "viewer-org", projectIds: [], canCreateProjects: false },
            { id: "owner-org", projectIds: [], canCreateProjects: true },
          ],
        }),
      ),
    ).toBe("/organization/owner-org/setup?orgstep=create-project");
    expect(
      resolveLandingDestination(
        landing({
          organizations: [
            { id: "viewer-org", projectIds: [], canCreateProjects: false },
          ],
        }),
      ),
    ).toBe("/organization/viewer-org");
  });

  it("sends a new user with only the demo organization to organization setup", () => {
    expect(
      resolveLandingDestination(
        landing({
          organizations: [
            { id: "demo-org", projectIds: ["demo"], canCreateProjects: false },
          ],
        }),
      ),
    ).toBe("/setup");
  });

  it("opens the demo project, then the overview, when nothing can be created", () => {
    expect(
      resolveLandingDestination(
        landing({
          canCreateOrganizations: false,
          organizations: [
            { id: "demo-org", projectIds: ["demo"], canCreateProjects: false },
          ],
        }),
      ),
    ).toBe("/project/demo");
    expect(
      resolveLandingDestination(landing({ canCreateOrganizations: false })),
    ).toBe("/organizations");
  });
});

describe("getLandingServerSideProps for /", () => {
  const makeCtx = ({
    cookie,
    resolvedUrl = "/",
  }: { cookie?: ProjectCookie; resolvedUrl?: string } = {}) =>
    ({
      req: {
        headers: {
          host: "us.cloud.langfuse.com",
          "x-forwarded-proto": "https",
        },
        cookies: cookie ? { [projectCookieName]: JSON.stringify(cookie) } : {},
      },
      res: {},
      resolvedUrl,
    }) as unknown as GetServerSidePropsContext;

  const makeSession = (projectIds: string[]) => ({
    user: {
      id: "user-1",
      admin: false,
      canCreateOrganizations: true,
      organizations: [
        {
          id: "org-1",
          role: "OWNER",
          projects: projectIds.map((id) => ({ id })),
        },
      ],
    },
  });

  const redirectTo = (destination: string) => ({
    redirect: { destination, permanent: false },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    readLastVisitedProjectMock.mockResolvedValue(null);
  });

  it("renders the page for signed-out users so the client guard handles sign-in", async () => {
    getServerAuthSessionMock.mockResolvedValue(null);

    expect(await getLandingServerSideProps(makeCtx())).toEqual({ props: {} });
  });

  it("prefers this browser's cookie and skips the per-user record", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1", "p2"]));

    const result = await getLandingServerSideProps(
      makeCtx({
        cookie: {
          origin: "https://us.cloud.langfuse.com",
          projectId: "p2",
          userId: "user-1",
        },
      }),
    );

    expect(result).toEqual(redirectTo("/project/p2"));
    expect(readLastVisitedProjectMock).not.toHaveBeenCalled();
  });

  it("ignores a cookie another user set in this browser and uses the per-user record", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1", "p2", "p3"]));
    readLastVisitedProjectMock.mockResolvedValue("p3");

    const result = await getLandingServerSideProps(
      makeCtx({
        cookie: {
          origin: "https://us.cloud.langfuse.com",
          projectId: "p2",
          userId: "someone-else",
        },
      }),
    );

    expect(result).toEqual(redirectTo("/project/p3"));
    expect(readLastVisitedProjectMock).toHaveBeenCalledWith("user-1");
  });

  it("falls back to the per-user record when the cookie's project was deleted", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1", "p3"]));
    readLastVisitedProjectMock.mockResolvedValue("p3");

    const result = await getLandingServerSideProps(
      makeCtx({
        cookie: {
          origin: "https://us.cloud.langfuse.com",
          projectId: "deleted",
          userId: "user-1",
        },
      }),
    );

    expect(result).toEqual(redirectTo("/project/p3"));
  });

  it("ignores a cookie from another region", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1", "p2"]));

    const result = await getLandingServerSideProps(
      makeCtx({
        cookie: { origin: "https://cloud.langfuse.com", projectId: "p2" },
      }),
    );

    expect(result).toEqual(redirectTo("/project/p1"));
  });

  it("forwards the query string to the project", async () => {
    getServerAuthSessionMock.mockResolvedValue(makeSession(["p1"]));

    const result = await getLandingServerSideProps(
      makeCtx({ resolvedUrl: "/?shell=classic" }),
    );

    expect(result).toEqual(redirectTo("/project/p1?shell=classic"));
  });
});
