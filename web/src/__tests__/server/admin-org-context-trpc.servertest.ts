import type { Session } from "next-auth";

// Session fixture sub-object types; casts keep the runtime fixtures unchanged
// while satisfying newer required fields on the session user type.
type SessionUser = NonNullable<Session["user"]>;
type SessionOrgs = SessionUser["organizations"];
type SessionFeatureFlags = SessionUser["featureFlags"];
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { randomUUID } from "crypto";

const orgId = `org-${randomUUID()}`;
const projectId = `project-${randomUUID()}`;
const siblingProjectId = `project-${randomUUID()}`;

const createSession = (opts: { admin: boolean; member: boolean }): Session => ({
  expires: "1",
  user: {
    id: "user-admin-org-context-test",
    canCreateOrganizations: true,
    name: "Test User",
    organizations: opts.member
      ? ([
          {
            id: orgId,
            name: "Admin Org Context Test Org",
            role: "MEMBER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            projects: [
              {
                id: projectId,
                role: "VIEWER",
                retentionDays: 30,
                deletedAt: null,
                name: "Admin Org Context Test Project",
              },
            ],
          },
        ] as SessionOrgs)
      : [],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
    } as SessionFeatureFlags,
    admin: opts.admin,
  },
  environment: {} as any,
});

const createCaller = (opts: { admin: boolean; member: boolean }) => {
  const ctx = createInnerTRPCContext({
    session: createSession(opts),
    headers: {},
  });
  return appRouter.createCaller({ ...ctx, prisma });
};

beforeAll(async () => {
  await prisma.organization.create({
    data: {
      id: orgId,
      name: "Admin Org Context Test Org",
      projects: {
        create: [
          { id: projectId, name: "Admin Org Context Test Project" },
          { id: siblingProjectId, name: "Admin Org Context Sibling Project" },
        ],
      },
    },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

describe("organizations.byId", () => {
  it("returns the session-shaped org for an admin who is not a member", async () => {
    const caller = createCaller({ admin: true, member: false });
    const org = await caller.organizations.byId({ orgId });
    expect(org.id).toBe(orgId);
    expect(org.role).toBe("OWNER");
    expect(org.projects.map((p) => p.id).sort()).toEqual(
      [projectId, siblingProjectId].sort(),
    );
  });

  it("rejects non-admin org members", async () => {
    const caller = createCaller({ admin: false, member: true });
    await expect(caller.organizations.byId({ orgId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects non-admin non-members", async () => {
    const caller = createCaller({ admin: false, member: false });
    await expect(caller.organizations.byId({ orgId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns NOT_FOUND for an admin querying an unknown org", async () => {
    const caller = createCaller({ admin: true, member: false });
    await expect(
      caller.organizations.byId({ orgId: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("projects.byId", () => {
  it("returns the project and its org for an admin who is not a member", async () => {
    const caller = createCaller({ admin: true, member: false });
    const { project, organization } = await caller.projects.byId({
      projectId,
    });
    expect(project.id).toBe(projectId);
    expect(organization.id).toBe(orgId);
  });

  it("rejects non-admin project members (must not expose sibling projects)", async () => {
    const caller = createCaller({ admin: false, member: true });
    await expect(caller.projects.byId({ projectId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects non-admin non-members", async () => {
    const caller = createCaller({ admin: false, member: false });
    await expect(caller.projects.byId({ projectId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns NOT_FOUND for an admin querying an unknown project", async () => {
    const caller = createCaller({ admin: true, member: false });
    await expect(
      caller.projects.byId({ projectId: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
