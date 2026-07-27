const { auditLogMock } = vi.hoisted(() => ({
  auditLogMock: vi.fn(),
}));

vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: auditLogMock,
}));

import { type Prisma, Role, SurveyName } from "@langfuse/shared/src/db";
import {
  completeCloudSignupOnboarding,
  getCloudSignupOnboardingStatus,
  provisionStarterOrganizationForNewUser,
  resolveOnboardingRedirectTarget,
  type RealOrganizationMembership,
} from "@/src/features/onboarding/server/onboardingService";

type CompletionPrisma = Parameters<
  typeof completeCloudSignupOnboarding
>[0]["prisma"];
type RedirectPrisma = Parameters<
  typeof resolveOnboardingRedirectTarget
>[0]["prisma"];
type StatusPrisma = Parameters<
  typeof getCloudSignupOnboardingStatus
>[0]["prisma"];

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

describe("getCloudSignupOnboardingStatus", () => {
  const getStatus = (prisma: StatusPrisma) =>
    getCloudSignupOnboardingStatus({
      prisma,
      userId: "user-1",
      canCreateOrganizations: true,
    });

  it("uses the onboarding survey as the completion marker", async () => {
    const incomplete = makeCompletionPrisma();
    await expect(
      getStatus(incomplete.tx as unknown as StatusPrisma),
    ).resolves.toEqual({
      completed: false,
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
});

describe("completeCloudSignupOnboarding", () => {
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
      completeCloudSignupOnboarding({
        prisma,
        userId: "user-1",
        userEmail: "user@example.com",
        canCreateOrganizations: true,
        referralSource: "  Reddit  ",
      }),
    ).resolves.toEqual({
      redirectTo: "/project/project-1/traces",
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

    tx.survey.findFirst.mockResolvedValue({ id: "survey-1" });

    await completeCloudSignupOnboarding({
      prisma,
      userId: "user-1",
      userEmail: "user@example.com",
      canCreateOrganizations: true,
      referralSource: "Hacker News",
    });

    expect(tx.survey.create).toHaveBeenCalledTimes(1);
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
