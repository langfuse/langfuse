import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import type * as SharedDb from "@langfuse/shared/src/db";
import { skillRouter } from "@/src/features/skills/server/skill-router";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const mocks = vi.hoisted(() => ({
  protectedLabels: vi.fn(),
  get: vi.fn(),
  createVersion: vi.fn(),
  setLabels: vi.fn(),
  deleteVersion: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedDb>()),
  prisma: { promptProtectedLabels: { findMany: mocks.protectedLabels } },
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
    deleteVersion = mocks.deleteVersion;
  },
}));

function createCaller(role: "ADMIN" | "MEMBER", projectId = "project") {
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
    name: "add a label",
    existingLabels: [],
    mutate: (caller: Caller, label: string) =>
      caller.setLabels({ ...version, labels: [label] }),
    write: mocks.setLabels,
  },
  {
    name: "remove a label",
    existingLabels: ["production"],
    mutate: (caller: Caller) => caller.setLabels({ ...version, labels: [] }),
    write: mocks.setLabels,
  },
  {
    name: "delete a version",
    existingLabels: ["production"],
    mutate: (caller: Caller) => caller.deleteVersion(version),
    write: mocks.deleteVersion,
  },
];

describe("skill mutations sharing prompt protected labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.protectedLabels.mockImplementation(
      async ({ where }: { where: { projectId: string } }) =>
        where.projectId === "project" ? [{ label: "production" }] : [],
    );
    mocks.get.mockResolvedValue({ labels: [] });
    mocks.createVersion.mockResolvedValue({ version: 1 });
    mocks.setLabels.mockResolvedValue({ version: 1 });
    mocks.deleteVersion.mockResolvedValue(undefined);
  });

  it.each(mutations)(
    "rejects a MEMBER trying to $name with a protected label",
    async ({ existingLabels, mutate, write }) => {
      mocks.get.mockResolvedValue({ labels: existingLabels });

      await expect(
        mutate(createCaller("MEMBER"), "production"),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      expect(write).not.toHaveBeenCalled();
      expect(mocks.protectedLabels).toHaveBeenCalledWith({
        where: { projectId: "project" },
      });
    },
  );

  it.each(mutations)(
    "allows a project ADMIN to $name with a protected label",
    async ({ existingLabels, mutate, write }) => {
      mocks.get.mockResolvedValue({ labels: existingLabels });

      await mutate(createCaller("ADMIN"), "production");

      expect(write).toHaveBeenCalledOnce();
    },
  );

  it.each(mutations)(
    "allows a MEMBER to $name with an unprotected label",
    async ({ existingLabels, mutate, write }) => {
      mocks.get.mockResolvedValue({
        labels: existingLabels.map(() => "staging"),
      });

      await mutate(createCaller("MEMBER"), "staging");

      expect(write).toHaveBeenCalledOnce();
    },
  );

  it("allows retaining a protected label while changing an unprotected label", async () => {
    mocks.get.mockResolvedValue({
      labels: ["production", "staging", "latest"],
    });

    await createCaller("MEMBER").setLabels({
      ...version,
      labels: ["production", "preview"],
    });

    expect(mocks.setLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["production", "preview"] }),
    );
  });

  it("does not apply another project's protected labels", async () => {
    await createCaller("MEMBER", "other-project").setLabels({
      ...version,
      projectId: "other-project",
      labels: ["production"],
    });

    expect(mocks.protectedLabels).toHaveBeenCalledWith({
      where: { projectId: "other-project" },
    });
    expect(mocks.setLabels).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "other-project" }),
    );
  });

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
      expect.objectContaining({ target: { kind: "new" } }),
    );
    const creation = mocks.createVersion.mock.calls[0]?.[0].input;
    expect(creation).not.toHaveProperty("labels");
    expect(creation).not.toHaveProperty("tags");
    expect(mocks.protectedLabels).not.toHaveBeenCalled();
  });

  it("rejects access to another project before looking up protected labels", async () => {
    await expect(
      createCaller("ADMIN", "other-project").deleteVersion(version),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.protectedLabels).not.toHaveBeenCalled();
    expect(mocks.deleteVersion).not.toHaveBeenCalled();
  });
});
