import type { Session } from "next-auth";
import * as z from "zod";

const { recordBackendActivityMock } = vi.hoisted(() => ({
  recordBackendActivityMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/src/features/posthog-analytics/server/backendActivity", () => ({
  recordBackendActivity: recordBackendActivityMock,
}));

import {
  createInnerTRPCContext,
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";

const activityRouter = createTRPCRouter({
  project: protectedProjectProcedureWithoutTracing
    .input(z.object({ projectId: z.string() }))
    .query(() => ({ ok: true })),
  organization: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(() => ({ ok: true })),
});

const session = {
  expires: "1",
  user: {
    id: "user-1",
    email: "user@example.com",
    name: "Example User",
    admin: false,
    canCreateOrganizations: true,
    featureFlags: {},
    organizations: [
      {
        id: "org-1",
        name: "Example Organization",
        role: "MEMBER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        projects: [
          {
            id: "project-1",
            name: "Example Project",
            role: "MEMBER",
            retentionDays: 30,
            deletedAt: null,
          },
        ],
      },
    ],
  },
  environment: {},
} as Session;

const createCaller = (callerSession: Session | null = session) =>
  activityRouter.createCaller(
    createInnerTRPCContext({ session: callerSession, headers: {} }),
  );

describe("backend activity authorization middleware", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records server-derived user, organization, and project ids after project authorization", async () => {
    await expect(
      createCaller().project({ projectId: "project-1" }),
    ).resolves.toEqual({ ok: true });

    expect(recordBackendActivityMock).toHaveBeenCalledOnce();
    expect(recordBackendActivityMock).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
    });
  });

  it("records organization activity after organization authorization", async () => {
    await expect(
      createCaller().organization({ orgId: "org-1" }),
    ).resolves.toEqual({ ok: true });

    expect(recordBackendActivityMock).toHaveBeenCalledOnce();
    expect(recordBackendActivityMock).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
    });
  });

  it("does not wait for analytics before continuing the API request", async () => {
    recordBackendActivityMock.mockReturnValueOnce(new Promise(() => {}));

    await expect(
      createCaller().project({ projectId: "project-1" }),
    ).resolves.toEqual({ ok: true });
  });

  it("does not record activity for a project outside the user's session", async () => {
    await expect(
      createCaller().project({ projectId: "project-other" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(recordBackendActivityMock).not.toHaveBeenCalled();
  });

  it("does not record activity for an unauthenticated request", async () => {
    await expect(
      createCaller(null).project({ projectId: "project-1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(recordBackendActivityMock).not.toHaveBeenCalled();
  });
});
