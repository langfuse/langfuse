import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { ForbiddenError } from "@langfuse/shared";
import { skillRouter } from "@/src/features/skills/server/skill-router";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  createVersion: vi.fn(),
  setLabels: vi.fn(),
  setTags: vi.fn(),
  deleteVersion: vi.fn(),
  deleteSkill: vi.fn(),
  list: vi.fn(),
  filterOptions: vi.fn(),
  skillVersions: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@/src/features/posthog-analytics/server/backendActivity", () => ({
  recordBackendActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/src/features/skills/server/index", () => ({
  SkillService: class {
    get = mocks.get;
    createVersion = mocks.createVersion;
    setLabels = mocks.setLabels;
    setTags = mocks.setTags;
    deleteVersion = mocks.deleteVersion;
    deleteSkill = mocks.deleteSkill;
    list = mocks.list;
    filterOptions = mocks.filterOptions;
    skillVersions = mocks.skillVersions;
  },
}));

function createCaller(
  role: "ADMIN" | "MEMBER" | "VIEWER",
  projectId = "project",
) {
  const session: Session = {
    expires: "1",
    user: {
      id: "user",
      canCreateOrganizations: false,
      admin: false,
      organizations: [
        {
          id: "organization",
          name: "Organization",
          role,
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: projectId,
              name: "Project",
              role,
              retentionDays: 30,
              deletedAt: null,
              hasTraces: false,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        searchBar: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  return skillRouter.createCaller(
    createInnerTRPCContext({ session, headers: {} }),
  );
}

type Caller = ReturnType<typeof createCaller>;
const version = { projectId: "project", name: "my-skill", version: 1 };
const mutations = [
  {
    name: "delete a whole skill",
    mutate: (caller: Caller) =>
      caller.deleteSkill({ projectId: "project", name: "my-skill" }),
    write: mocks.deleteSkill,
    params: { projectId: "project", name: "my-skill" },
  },
  {
    name: "set labels",
    mutate: (caller: Caller) =>
      caller.setLabels({ ...version, labels: ["production"] }),
    write: mocks.setLabels,
    params: { ...version, labels: ["production"] },
  },
  {
    name: "set tags",
    mutate: (caller: Caller) =>
      caller.setTags({ ...version, tags: ["example"] }),
    write: mocks.setTags,
    params: { ...version, tags: ["example"] },
  },
  {
    name: "delete a version",
    mutate: (caller: Caller) => caller.deleteVersion(version),
    write: mocks.deleteVersion,
    params: version,
  },
];

describe("skill mutation router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createVersion.mockResolvedValue({ version: 1 });
    mocks.setLabels.mockResolvedValue({ version: 1 });
    mocks.setTags.mockResolvedValue({ version: 1 });
    mocks.deleteVersion.mockResolvedValue(undefined);
  });

  it("validates bounded version history and checks project access", async () => {
    const caller = createCaller("VIEWER");
    const input = { projectId: "project", name: "my-skill" };
    await caller.skillVersions(input);
    expect(mocks.skillVersions).toHaveBeenCalledExactlyOnceWith({
      ...input,
      limit: 20,
    });

    for (const pagination of [
      { limit: 0 },
      { limit: 101 },
      { cursor: 0 },
      { cursor: 1.5 },
    ]) {
      await expect(
        caller.skillVersions({ ...input, ...pagination }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(
      createCaller("ADMIN", "other-project").skillVersions(input),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.skillVersions).toHaveBeenCalledOnce();
  });

  it.each(mutations)(
    "rejects a VIEWER trying to $name",
    async ({ mutate, write }) => {
      await expect(mutate(createCaller("VIEWER"))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(write).not.toHaveBeenCalled();
    },
  );

  it.each(mutations)(
    "passes the authenticated session to the service to $name",
    async ({ mutate, write, params }) => {
      await mutate(createCaller("MEMBER"));

      expect(write).toHaveBeenCalledExactlyOnceWith({
        ...params,
        actor: {
          session: expect.objectContaining({
            user: expect.objectContaining({ id: "user" }),
          }),
        },
      });
      expect(mocks.get).not.toHaveBeenCalled();
    },
  );

  it.each(mutations)(
    "propagates service authorization errors when trying to $name",
    async ({ mutate, write }) => {
      write.mockRejectedValueOnce(
        new ForbiddenError("Protected skill label access denied"),
      );

      await expect(mutate(createCaller("MEMBER"))).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Protected skill label access denied",
      });
    },
  );

  it("creates without accepting client labels or tags", async () => {
    const input = {
      projectId: "project",
      target: { kind: "new" as const },
      files: [{ path: "SKILL.md", blobId: "blob" }],
      labels: ["production"],
      tags: ["stale-client-tag"],
    };
    await createCaller("MEMBER").createVersion(input);

    expect(mocks.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: "new" },
        actor: {
          session: expect.objectContaining({
            user: expect.objectContaining({ id: "user" }),
          }),
        },
      }),
    );
    const creation = mocks.createVersion.mock.calls[0]?.[0].input;
    expect(creation).not.toHaveProperty("labels");
    expect(creation).not.toHaveProperty("tags");
  });

  it("rejects access to another project before calling the service", async () => {
    await expect(
      createCaller("ADMIN", "other-project").deleteVersion(version),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.deleteVersion).not.toHaveBeenCalled();
  });

  it("rejects deleting a whole skill in another project", async () => {
    await expect(
      createCaller("ADMIN", "other-project").deleteSkill({
        projectId: "project",
        name: "my-skill",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.deleteSkill).not.toHaveBeenCalled();
  });

  it("scopes filter options to the authenticated project", async () => {
    await createCaller("VIEWER").filterOptions({ projectId: "project" });
    expect(mocks.filterOptions).toHaveBeenCalledExactlyOnceWith({
      projectId: "project",
    });
    await expect(
      createCaller("ADMIN", "other-project").filterOptions({
        projectId: "project",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.filterOptions).toHaveBeenCalledOnce();
  });
});
