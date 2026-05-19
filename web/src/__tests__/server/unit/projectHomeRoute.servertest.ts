const { sendAdminAccessWebhookMock } = vi.hoisted(() => ({
  sendAdminAccessWebhookMock: vi.fn(),
}));

vi.mock("@/src/server/adminAccessWebhook", () => ({
  sendAdminAccessWebhook: sendAdminAccessWebhookMock,
}));

import { Role } from "@langfuse/shared/src/db";
import { resolveProjectHomeRoute } from "@/src/features/projects/server/projectHomeRoute";

const makeSession = (overrides?: Record<string, unknown>) =>
  ({
    user: {
      id: "user-1",
      email: "user@example.com",
      admin: false,
      organizations: [],
      ...overrides,
    },
  }) as any;

describe("resolveProjectHomeRoute", () => {
  beforeEach(() => {
    sendAdminAccessWebhookMock.mockReset();
    sendAdminAccessWebhookMock.mockResolvedValue(undefined);
  });

  it("redirects unauthenticated users to sign in with the project target path", async () => {
    const result = await resolveProjectHomeRoute({
      prisma: {
        project: {
          findFirst: vi.fn(),
        },
      } as any,
      session: null,
      projectId: "project-1",
    });

    expect(result).toEqual({
      kind: "redirect-sign-in",
      destination: "/auth/sign-in?targetPath=%2Fproject%2Fproject-1",
    });
  });

  it("falls back to the database for stale sessions and redirects empty projects to traces", async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValueOnce({
          hasTraces: false,
          projectMembers: [],
          organization: {
            organizationMemberships: [{ role: Role.OWNER }],
          },
        }),
      },
    } as any;

    const result = await resolveProjectHomeRoute({
      prisma,
      session: makeSession(),
      projectId: "project-1",
    });

    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "project-1",
          deletedAt: null,
        }),
      }),
    );
    expect(result).toEqual({
      kind: "redirect-traces",
      destination: "/project/project-1/traces",
    });
  });

  it("allows admins outside the session org list via a database lookup and sends the webhook", async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValueOnce({
          orgId: "org-1",
          hasTraces: true,
        }),
      },
    } as any;

    const result = await resolveProjectHomeRoute({
      prisma,
      session: makeSession({
        admin: true,
      }),
      projectId: "project-1",
    });

    expect(sendAdminAccessWebhookMock).toHaveBeenCalledWith({
      email: "user@example.com",
      projectId: "project-1",
      orgId: "org-1",
    });
    expect(result).toEqual({
      kind: "render",
    });
  });

  it("returns not-found when the user has no database-backed access to the project", async () => {
    const result = await resolveProjectHomeRoute({
      prisma: {
        project: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      } as any,
      session: makeSession(),
      projectId: "project-1",
    });

    expect(result).toEqual({
      kind: "not-found",
    });
  });
});
