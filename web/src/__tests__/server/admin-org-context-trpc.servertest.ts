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
import {
  createTrace,
  createTracesCh,
  deleteTraces,
} from "@langfuse/shared/src/server";

const orgId = `org-${randomUUID()}`;
const projectId = `project-${randomUUID()}`;
const siblingProjectId = `project-${randomUUID()}`;
const projectTraceId = `trace-${randomUUID()}`;
const siblingProjectTraceId = `trace-${randomUUID()}`;

const createSession = (opts: {
  admin: boolean;
  member: boolean;
  orgRole?: "MEMBER" | "NONE";
}): Session => ({
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
            role: opts.orgRole ?? "MEMBER",
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

const createCaller = (opts: {
  admin: boolean;
  member: boolean;
  orgRole?: "MEMBER" | "NONE";
}) => {
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
  await createTracesCh([
    createTrace({ id: projectTraceId, project_id: projectId }),
    createTrace({ id: siblingProjectTraceId, project_id: siblingProjectId }),
  ]);
});

afterAll(async () => {
  await Promise.all([
    deleteTraces(projectId, [projectTraceId]),
    deleteTraces(siblingProjectId, [siblingProjectTraceId]),
  ]);
  await prisma.project.deleteMany({ where: { orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

describe("organizations.lastTraceByProject", () => {
  it("returns timestamps only for projects readable by a project-only member", async () => {
    const caller = createCaller({
      admin: false,
      member: true,
      orgRole: "NONE",
    });

    const result = await caller.organizations.lastTraceByProject({ orgId });

    expect(result.map(({ projectId }) => projectId)).toEqual([projectId]);
  });

  it("returns timestamps for all projects to a Langfuse admin", async () => {
    const caller = createCaller({ admin: true, member: false });

    const result = await caller.organizations.lastTraceByProject({ orgId });

    expect(result.map(({ projectId }) => projectId).sort()).toEqual(
      [projectId, siblingProjectId].sort(),
    );
  });
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
