const { auditLogMock } = vi.hoisted(() => ({
  auditLogMock: vi.fn(),
}));

vi.mock("@/src/features/audit-logs/server", () => ({
  auditLog: auditLogMock,
}));

import { type Prisma, Role, SurveyName } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import {
  completeSignupOnboarding,
  getSignupOnboardingStatus,
  provisionStarterOrganizationForNewUser,
  resolveOnboardingRedirectTarget,
  type RealOrganizationMembership,
} from "@/src/features/onboarding/server";

type CompletionPrisma = Parameters<
  typeof completeSignupOnboarding
>[0]["prisma"];
type RedirectPrisma = Parameters<
  typeof resolveOnboardingRedirectTarget
>[0]["prisma"];
type StatusPrisma = Parameters<typeof getSignupOnboardingStatus>[0]["prisma"];

const originalEnv = {
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  LANGFUSE_DISABLE_SIGNUP_ONBOARDING: env.LANGFUSE_DISABLE_SIGNUP_ONBOARDING,
};

beforeEach(() => {
  Object.assign(env, {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "US",
    LANGFUSE_DISABLE_SIGNUP_ONBOARDING: undefined,
  });
});

afterEach(() => {
  Object.assign(env, originalEnv);
});

const makeMembership = ({
  orgId,
  orgName = `Org ${orgId}`,
  orgMetadata = null,
  role = Role.OWNER,
  projects,
}: {
  orgId: string;
  orgName?: string;
  orgMetadata?: Prisma.JsonValue;
  role?: Role;
  projects: Array<{
    id: string;
    name?: string;
  }>;
}) =>
  ({
    role,
    ProjectMemberships: [],
    organization: {
      id: orgId,
      name: orgName,
      metadata: orgMetadata,
      projects,
    },
  }) as unknown as RealOrganizationMembership;

const makePrisma = (organizationMemberships: RealOrganizationMembership[]) =>
  ({
    organizationMembership: {
      findMany: vi.fn().mockResolvedValue(organizationMemberships),
    },
  }) as unknown as RedirectPrisma;

const makeCompletionPrisma = ({
  existingSurvey = null,
  memberships = [],
}: {
  existingSurvey?: { id: string } | null;
  memberships?: RealOrganizationMembership[];
} = {}) => {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
    survey: {
      findFirst: vi.fn().mockResolvedValue(existingSurvey),
      create: vi.fn().mockResolvedValue({ id: "survey-1" }),
    },
    organizationMembership: {
      findMany: vi.fn().mockResolvedValue(memberships),
    },
    organization: {
      update: vi.fn().mockResolvedValue({ id: "org-1" }),
    },
  };

  return {
    tx,
    prisma: {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as CompletionPrisma,
  };
};

describe("resolveOnboardingRedirectTarget", () => {
  it("routes the auto-created starter project to tracing", async () => {
    const result = await resolveOnboardingRedirectTarget({
      prisma: makePrisma([
        makeMembership({
          orgId: "org-1",
          orgName: "Renamed Organization",
          orgMetadata: {
            langfuseOnboarding: {
              starterOrganization: true,
            },
          },
          projects: [{ id: "project-1", name: "Renamed Project" }],
        }),
      ]),
      userId: "user-1",
    });

    expect(result).toMatchObject({
      redirectTo: "/project/project-1/traces",
      orgId: "org-1",
    });
  });

  it("routes existing readable projects through project home", async () => {
    const result = await resolveOnboardingRedirectTarget({
      prisma: makePrisma([
        makeMembership({
          orgId: "org-1",
          projects: [{ id: "project-1", name: "Existing Project" }],
        }),
      ]),
      userId: "user-1",
    });

    expect(result).toMatchObject({
      redirectTo: "/project/project-1",
    });
  });
});

describe("getSignupOnboardingStatus", () => {
  const getStatus = (prisma: StatusPrisma, canCreateOrganizations = true) =>
    getSignupOnboardingStatus({
      prisma,
      userId: "user-1",
      canCreateOrganizations,
    });

  it("uses the onboarding survey as the completion marker", async () => {
    const incomplete = makeCompletionPrisma();
    await expect(
      getStatus(incomplete.tx as unknown as StatusPrisma),
    ).resolves.toEqual({
      completed: false,
      canConfigureAiFeatures: false,
    });

    const completed = makeCompletionPrisma({
      existingSurvey: { id: "survey-1" },
      memberships: [
        makeMembership({
          orgId: "org-1",
          projects: [{ id: "project-1" }],
        }),
      ],
    });

    await expect(
      getStatus(completed.tx as unknown as StatusPrisma),
    ).resolves.toEqual({
      completed: true,
      redirectTo: "/project/project-1",
    });
  });

  it("allows owners to configure AI features for a starter organization", async () => {
    const incomplete = makeCompletionPrisma({
      memberships: [
        makeMembership({
          orgId: "org-1",
          orgMetadata: {
            langfuseOnboarding: {
              starterOrganization: true,
            },
          },
          projects: [{ id: "project-1" }],
        }),
      ],
    });

    await expect(
      getStatus(incomplete.tx as unknown as StatusPrisma),
    ).resolves.toEqual({
      completed: false,
      canConfigureAiFeatures: true,
    });
  });

  it.each([
    {
      audience: "an installer",
      role: undefined,
      canCreateOrganizations: true,
      lists: ["product", "oss"],
    },
    {
      audience: "a user without a membership who can't create organizations",
      role: undefined,
      canCreateOrganizations: false,
      lists: ["product"],
    },
    {
      audience: "an organization admin",
      role: Role.ADMIN,
      canCreateOrganizations: true,
      lists: ["product", "oss"],
    },
    {
      audience: "an invited viewer",
      role: Role.VIEWER,
      canCreateOrganizations: true,
      lists: ["product"],
    },
  ])(
    "offers $audience the $lists newsletters on self-hosted",
    async ({ role, canCreateOrganizations, lists }) => {
      Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined });
      const { tx } = makeCompletionPrisma({
        memberships: role
          ? [makeMembership({ orgId: "org-1", role, projects: [] })]
          : [],
      });

      await expect(
        getStatus(tx as unknown as StatusPrisma, canCreateOrganizations),
      ).resolves.toMatchObject({ completed: false, newsletterLists: lists });
    },
  );

  it("reports a disabled step as completed on self-hosted without reading the survey", async () => {
    Object.assign(env, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      LANGFUSE_DISABLE_SIGNUP_ONBOARDING: "true",
    });
    const { tx } = makeCompletionPrisma({
      memberships: [
        makeMembership({ orgId: "org-1", projects: [{ id: "project-1" }] }),
      ],
    });

    await expect(getStatus(tx as unknown as StatusPrisma)).resolves.toEqual({
      completed: true,
      redirectTo: "/project/project-1",
    });
    expect(tx.survey.findFirst).not.toHaveBeenCalled();
  });

  it("ignores the off switch on Cloud", async () => {
    Object.assign(env, { LANGFUSE_DISABLE_SIGNUP_ONBOARDING: "true" });
    const { tx } = makeCompletionPrisma();

    await expect(getStatus(tx as unknown as StatusPrisma)).resolves.toEqual({
      completed: false,
      canConfigureAiFeatures: false,
    });
  });
});

describe("completeSignupOnboarding", () => {
  it("locks the user row and writes one trimmed onboarding survey once", async () => {
    const { prisma, tx } = makeCompletionPrisma({
      memberships: [
        makeMembership({
          orgId: "org-1",
          orgMetadata: {
            langfuseOnboarding: {
              starterOrganization: true,
            },
          },
          projects: [{ id: "project-1" }],
        }),
      ],
    });

    await expect(
      completeSignupOnboarding({
        prisma,
        userId: "user-1",
        userEmail: "user@example.com",
        canCreateOrganizations: true,
        referralSource: "  Reddit  ",
        aiFeaturesEnabled: true,
      }),
    ).resolves.toEqual({
      redirectTo: "/project/project-1/traces",
      surveyCreated: true,
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.survey.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.survey.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        surveyName: SurveyName.USER_ONBOARDING,
      },
      select: {
        id: true,
      },
    });
    expect(tx.survey.create).toHaveBeenCalledWith({
      data: {
        surveyName: SurveyName.USER_ONBOARDING,
        response: {
          referralSource: "Reddit",
        },
        userId: "user-1",
        userEmail: "user@example.com",
        orgId: "org-1",
      },
    });
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { aiFeaturesEnabled: true },
    });

    tx.survey.findFirst.mockResolvedValue({ id: "survey-1" });

    const repeatResult = await completeSignupOnboarding({
      prisma,
      userId: "user-1",
      userEmail: "user@example.com",
      canCreateOrganizations: true,
      referralSource: "Hacker News",
      aiFeaturesEnabled: false,
    });

    expect(repeatResult.surveyCreated).toBe(false);

    expect(tx.survey.create).toHaveBeenCalledTimes(1);
    expect(tx.organization.update).toHaveBeenCalledTimes(1);
  });

  it("stores each pick with the position it was shown at", async () => {
    const { prisma, tx } = makeCompletionPrisma({
      memberships: [
        makeMembership({ orgId: "org-1", projects: [{ id: "project-1" }] }),
      ],
    });

    await completeSignupOnboarding({
      prisma,
      userId: "user-1",
      userEmail: "user@example.com",
      canCreateOrganizations: true,
      referralSource: "Reddit",
      buildIntents: ["rag", "other"],
      buildIntentPositions: [2, 6],
      buildIntentOther: "eval pipeline",
    });

    expect(tx.survey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: {
            referralSource: "Reddit",
            buildIntents: ["rag", "other"],
            buildIntentPositions: [2, 6],
            buildIntentOther: "eval pipeline",
          },
        }),
      }),
    );
  });

  it("writes nothing when the step is disabled on self-hosted", async () => {
    Object.assign(env, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      LANGFUSE_DISABLE_SIGNUP_ONBOARDING: "true",
    });
    const prisma = {
      $transaction: vi.fn(),
      organizationMembership: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await expect(
      completeSignupOnboarding({
        prisma: prisma as unknown as CompletionPrisma,
        userId: "user-1",
        canCreateOrganizations: true,
        newsletter: { outcome: "declined" },
      }),
    ).resolves.toEqual({ redirectTo: "/setup", surveyCreated: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("still stores the survey on Cloud when the off switch is set", async () => {
    Object.assign(env, { LANGFUSE_DISABLE_SIGNUP_ONBOARDING: "true" });
    const { prisma, tx } = makeCompletionPrisma({
      memberships: [
        makeMembership({ orgId: "org-1", projects: [{ id: "project-1" }] }),
      ],
    });

    await completeSignupOnboarding({
      prisma,
      userId: "user-1",
      canCreateOrganizations: true,
    });

    expect(tx.survey.create).toHaveBeenCalled();
  });

  it("stores an empty response when the survey is skipped", async () => {
    const { prisma, tx } = makeCompletionPrisma({
      memberships: [
        makeMembership({ orgId: "org-1", projects: [{ id: "project-1" }] }),
      ],
    });

    await completeSignupOnboarding({
      prisma,
      userId: "user-1",
      canCreateOrganizations: true,
    });

    expect(tx.survey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ response: {} }),
      }),
    );
  });

  it("does not update AI features for an existing organization", async () => {
    const { prisma, tx } = makeCompletionPrisma({
      memberships: [
        makeMembership({
          orgId: "org-1",
          projects: [{ id: "project-1" }],
        }),
      ],
    });

    await completeSignupOnboarding({
      prisma,
      userId: "user-1",
      userEmail: "user@example.com",
      canCreateOrganizations: true,
      aiFeaturesEnabled: true,
    });

    expect(tx.organization.update).not.toHaveBeenCalled();
  });
});

describe("provisionStarterOrganizationForNewUser", () => {
  beforeEach(() => {
    auditLogMock.mockReset();
    auditLogMock.mockResolvedValue(undefined);
  });

  it("locks the user row before checking for existing real organizations", async () => {
    const existingMemberships: RealOrganizationMembership[] = [];
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
      organizationMembership: {
        findMany: vi.fn().mockResolvedValue(existingMemberships),
      },
      organization: {
        create: vi.fn().mockResolvedValue({
          id: "org-1",
          name: "Starter Org",
        }),
      },
      project: {
        create: vi.fn().mockResolvedValue({
          id: "project-1",
          name: "My Project",
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as Parameters<
      typeof provisionStarterOrganizationForNewUser
    >[0]["prisma"];

    const result = await provisionStarterOrganizationForNewUser({
      prisma,
      userId: "user-1",
      userName: "Taylor",
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.organizationMembership.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: "user-1",
      }),
      include: expect.any(Object),
      orderBy: expect.any(Array),
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.organizationMembership.findMany.mock.invocationCallOrder[0],
    );
    expect(tx.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          langfuseOnboarding: {
            starterOrganization: true,
          },
        },
      }),
    });
    expect(result).toMatchObject({
      organization: { id: "org-1" },
      project: { id: "project-1" },
    });
  });

  it("does not create starter resources when the locked user can already create a project", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
      organizationMembership: {
        findMany: vi.fn().mockResolvedValue([
          makeMembership({
            orgId: "org-1",
            role: Role.OWNER,
            projects: [],
          }),
        ]),
      },
      organization: {
        create: vi.fn(),
      },
      project: {
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as Parameters<
      typeof provisionStarterOrganizationForNewUser
    >[0]["prisma"];

    const result = await provisionStarterOrganizationForNewUser({
      prisma,
      userId: "user-1",
    });

    expect(result).toBeNull();
    expect(tx.organization.create).not.toHaveBeenCalled();
    expect(tx.project.create).not.toHaveBeenCalled();
    expect(auditLogMock).not.toHaveBeenCalled();
  });

  it("creates starter resources when existing org memberships still leave the user stranded", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
      organizationMembership: {
        findMany: vi.fn().mockResolvedValue([
          makeMembership({
            orgId: "org-1",
            role: Role.NONE,
            projects: [],
          }),
        ]),
      },
      organization: {
        create: vi.fn().mockResolvedValue({
          id: "org-2",
          name: "Starter Org",
        }),
      },
      project: {
        create: vi.fn().mockResolvedValue({
          id: "project-1",
          name: "My Project",
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as Parameters<
      typeof provisionStarterOrganizationForNewUser
    >[0]["prisma"];

    const result = await provisionStarterOrganizationForNewUser({
      prisma,
      userId: "user-1",
      userName: "Taylor",
    });

    expect(result).toMatchObject({
      organization: { id: "org-2" },
      project: { id: "project-1" },
    });
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    expect(tx.project.create).toHaveBeenCalledTimes(1);
  });
});
