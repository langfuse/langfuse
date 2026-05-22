const { auditLogMock } = vi.hoisted(() => ({
  auditLogMock: vi.fn(),
}));

vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: auditLogMock,
}));

import { Role } from "@langfuse/shared/src/db";
import {
  provisionStarterOrganizationForNewUser,
  resolveOnboardingRedirectTarget,
  type RealOrganizationMembership,
} from "@/src/features/onboarding/server/onboardingService";

const makeMembership = ({
  orgId,
  orgName = `Org ${orgId}`,
  role = Role.OWNER,
  projects,
}: {
  orgId: string;
  orgName?: string;
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
      projects,
    },
  }) as RealOrganizationMembership;

const makePrisma = (organizationMemberships: RealOrganizationMembership[]) =>
  ({
    organizationMembership: {
      findMany: vi.fn().mockResolvedValue(organizationMemberships),
    },
  }) as unknown as Parameters<
    typeof resolveOnboardingRedirectTarget
  >[0]["prisma"];

describe("resolveOnboardingRedirectTarget", () => {
  it("routes the auto-created starter project to tracing", async () => {
    const result = await resolveOnboardingRedirectTarget({
      prisma: makePrisma([
        makeMembership({
          orgId: "org-1",
          orgName: "Taylor's Organization",
          projects: [{ id: "project-1", name: "My Project" }],
        }),
      ]),
      userId: "user-1",
      userName: "Taylor Test",
    });

    expect(result).toEqual({
      redirectTo: "/project/project-1/traces",
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
      userName: "Taylor Test",
    });

    expect(result).toEqual({
      redirectTo: "/project/project-1",
    });
  });
});

describe("provisionStarterOrganizationForNewUser", () => {
  beforeEach(() => {
    auditLogMock.mockReset();
    auditLogMock.mockResolvedValue(undefined);
  });

  it("locks the user row before checking for existing real organizations", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
      organizationMembership: {
        count: vi.fn().mockResolvedValue(0),
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
    expect(tx.organizationMembership.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: "user-1",
      }),
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.organizationMembership.count.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      organization: { id: "org-1" },
      project: { id: "project-1" },
    });
  });

  it("does not create starter resources when the locked user already has a real org", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1" }]),
      organizationMembership: {
        count: vi.fn().mockResolvedValue(1),
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
});
