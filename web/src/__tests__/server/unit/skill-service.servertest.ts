import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectAuthedContext } from "@/src/server/api/trpc";
import type { Prisma, PrismaClient, SkillBlob } from "@langfuse/shared/src/db";
import type { StorageService } from "@langfuse/shared/src/server";
import { SkillService } from "@/src/features/skills/server/skill-service";
import { getSkillStorageClient } from "@/src/features/skills/server/getSkillStorageClient";
import { auditLog } from "@/src/features/audit-logs/server";

vi.mock("@/src/features/skills/server/getSkillStorageClient", () => ({
  getSkillStorageClient: vi.fn(),
}));

vi.mock("@/src/features/audit-logs/server", () => ({
  auditLog: vi.fn(),
}));

describe("SkillService storage configuration", () => {
  it.each(["default", "injected"] as const)(
    "prepares uploads using %s storage",
    async (mode) => {
      const getSignedUploadUrl = vi
        .fn()
        .mockResolvedValue(`https://${mode}.example.com/upload`);
      const storage = { getSignedUploadUrl } as unknown as StorageService;
      const defaultConfig = vi.mocked(getSkillStorageClient);
      defaultConfig.mockReset();
      if (mode === "default") {
        defaultConfig.mockReturnValue(storage);
      } else {
        defaultConfig.mockImplementation(() => {
          throw new Error("Default storage is unavailable");
        });
      }
      const create = vi.fn(
        async ({ data }: { data: Prisma.SkillBlobUncheckedCreateInput }) => ({
          ...data,
          verifiedAt: null,
        }),
      );
      const prisma = { skillBlob: { create } } as unknown as PrismaClient;
      const service = new SkillService(
        prisma,
        mode === "injected" ? storage : undefined,
      );
      const hash = createHash("sha256").update("hello").digest();
      const descriptor = {
        sha256Hash: hash.toString("base64"),
        contentType: "text/plain",
        contentLength: 5,
      };

      const result = await service.prepareUploads({
        projectId: "project",
        input: { blobs: [descriptor] },
      });

      const path = `skills/project/${hash.toString("base64url")}`;
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bucketPath: path,
        }),
      });
      expect(getSignedUploadUrl).toHaveBeenCalledWith({
        ...descriptor,
        path,
        ttlSeconds: 3600,
      });
      expect(result.data[0]?.uploadUrl).toBe(
        `https://${mode}.example.com/upload`,
      );
    },
  );
});

describe("SkillService versions", () => {
  beforeEach(() => vi.clearAllMocks());

  function sessionActor(role: "ADMIN" | "MEMBER") {
    return {
      session: {
        user: {
          admin: false,
          organizations: [{ projects: [{ id: "project", role }] }],
        },
      } as ProjectAuthedContext["session"],
    };
  }

  function setup() {
    const markdown = Buffer.from(
      "---\nname: test-skill\ndescription: A test skill\n---\nInstructions",
    );
    const blobs: SkillBlob[] = [markdown, Buffer.from([0, 255, 1])].map(
      (bytes, index) => ({
        id: `blob-${index}`,
        projectId: "project",
        createdAt: new Date(),
        verifiedAt: null,
        sha256Hash: createHash("sha256").update(bytes).digest("base64"),
        contentType: index === 0 ? "text/markdown" : "application/octet-stream",
        contentLength: bytes.byteLength,
        bucketPath: `skills/project/blob-${index}`,
      }),
    );
    const events: string[] = [];
    const getObjectSize = vi.fn(async (path: string) => {
      events.push(`size:${path}`);
      return blobs.find((blob) => blob.bucketPath === path)!.contentLength;
    });
    const downloadBytes = vi.fn(async (path: string) => {
      events.push(`download:${path}`);
      return markdown;
    });
    const files = [
      { path: "SKILL.md", blobId: blobs[0]!.id },
      { path: "image.png", blobId: blobs[1]!.id },
      { path: "copy.png", blobId: blobs[1]!.id },
    ];
    const skill = {
      id: "skill",
      projectId: "project",
      createdBy: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "test-skill",
      description: "A test skill",
      frontmatter: { name: "test-skill", description: "A test skill" },
      version: 1,
      tags: [] as string[],
      labels: [] as string[],
      commitMessage: null,
      files: files.map((file, index) => ({
        ...file,
        id: `file-${index}`,
        blob: blobs.find((blob) => blob.id === file.blobId),
      })),
    };
    const create = vi.fn().mockResolvedValue(skill);
    const updateMany = vi.fn(
      async ({
        where,
        data,
      }: {
        where: { projectId: string; id: string; verifiedAt: null };
        data: { verifiedAt: Date };
      }) => {
        const blob = blobs.find(
          (blob) =>
            blob.projectId === where.projectId &&
            blob.id === where.id &&
            blob.verifiedAt === where.verifiedAt,
        );
        if (!blob) return { count: 0 };
        blob.verifiedAt = data.verifiedAt;
        events.push(`verified:${blob.id}`);
        return { count: 1 };
      },
    );
    const tx = {
      $executeRaw: vi.fn(),
      skill: {
        findFirst: vi.fn().mockResolvedValue(null),
        findFirstOrThrow: vi.fn().mockResolvedValue({ version: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        create,
      },
    };
    const transaction = vi.fn(
      async (callback: (tx: unknown) => Promise<string>) => {
        events.push("transaction");
        return callback(tx);
      },
    );
    const findMany = vi.fn().mockResolvedValue(blobs);
    const db = {
      promptProtectedLabels: { findMany: vi.fn().mockResolvedValue([]) },
      apiKey: {
        findUnique: vi.fn().mockResolvedValue({ isInAppAgentKey: false }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "user", admin: false }),
      },
      organizationMembership: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "membership", role: "MEMBER" }),
      },
      projectMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      skillBlob: { findMany, updateMany },
      $transaction: transaction,
      skill: {
        findFirst: vi.fn().mockResolvedValue(skill),
        findMany: vi.fn().mockResolvedValue([skill]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(skill),
        findFirstOrThrow: vi.fn().mockResolvedValue({ version: 1 }),
      },
    };
    Object.assign(tx, {
      promptProtectedLabels: db.promptProtectedLabels,
      apiKey: db.apiKey,
      user: db.user,
      organizationMembership: db.organizationMembership,
      projectMembership: db.projectMembership,
    });
    const service = new SkillService(
      db as unknown as PrismaClient,
      { getObjectSize, downloadBytes } as unknown as StorageService,
    );
    const params = {
      projectId: "project",
      createdBy: "user",
      input: { files },
      actor: {
        projectId: "project",
        orgId: "org",
        apiKeyId: "api-key",
        accessLevel: "project" as const,
      },
    };
    return {
      service,
      params,
      blobs,
      events,
      getObjectSize,
      downloadBytes,
      transaction,
      create,
      updateMany,
      findMany,
      skill,
      tx,
      db,
    };
  }

  it.each(["setLabels", "deleteVersion", "deleteSkill"] as const)(
    "checks labels added before the mutation lock during %s",
    async (operation) => {
      const test = setup();
      const lockedSkill = { ...test.skill, labels: ["production"] };
      test.tx.skill.findFirst.mockResolvedValue(lockedSkill);
      test.tx.skill.findMany.mockResolvedValue([lockedSkill]);
      test.db.promptProtectedLabels.findMany.mockResolvedValue([
        { label: "production" },
      ]);
      const params = {
        projectId: "project",
        name: "test-skill",
        version: 1,
        actor: sessionActor("MEMBER"),
      };
      const mutations = {
        setLabels: () => test.service.setLabels({ ...params, labels: [] }),
        deleteVersion: () => test.service.deleteVersion(params),
        deleteSkill: () => test.service.deleteSkill(params),
      };

      await expect(mutations[operation]()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(test.tx.skill.update).not.toHaveBeenCalled();
      expect(test.tx.skill.delete).not.toHaveBeenCalled();
      expect(test.tx.skill.deleteMany).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
    },
  );

  it("cannot restore a protected label moved away before the mutation lock", async () => {
    const test = setup();
    test.skill.labels = ["production"];
    test.tx.skill.findFirst.mockResolvedValue({ ...test.skill, labels: [] });
    test.tx.skill.findMany.mockResolvedValue([
      { ...test.skill, labels: [] },
      { id: "other-version", labels: ["production"] },
    ]);
    test.db.promptProtectedLabels.findMany.mockResolvedValue([
      { label: "production" },
    ]);

    await expect(
      test.service.setLabels({
        projectId: "project",
        name: "test-skill",
        version: 1,
        labels: ["production", "stable"],
        actor: sessionActor("MEMBER"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(test.tx.skill.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it.each(["add", "remove", "delete"] as const)(
    "rejects a MEMBER attempting to %s a protected label through the service",
    async (operation) => {
      const test = setup();
      test.skill.labels = operation === "add" ? [] : ["production"];
      test.tx.skill.findFirst.mockResolvedValue(test.skill);
      test.tx.skill.findMany.mockResolvedValue([test.skill]);
      test.db.promptProtectedLabels.findMany.mockResolvedValue([
        { label: "production" },
      ]);
      const params = {
        projectId: "project",
        name: "test-skill",
        version: 1,
        actor: sessionActor("MEMBER"),
      };

      await expect(
        operation === "delete"
          ? test.service.deleteVersion(params)
          : test.service.setLabels({
              ...params,
              labels: operation === "add" ? ["production"] : [],
            }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(test.transaction).toHaveBeenCalledOnce();
      expect(test.tx.skill.update).not.toHaveBeenCalled();
      expect(test.tx.skill.delete).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
    },
  );

  it.each(["setLabels", "deleteVersion"] as const)(
    "enforces API key creator permissions before %s",
    async (operation) => {
      const test = setup();
      test.skill.labels = ["production"];
      test.tx.skill.findFirst.mockResolvedValue(test.skill);
      test.tx.skill.findMany.mockResolvedValue([test.skill]);
      test.db.promptProtectedLabels.findMany.mockResolvedValue([
        { label: "production" },
      ]);
      test.db.apiKey.findUnique.mockResolvedValue({
        isInAppAgentKey: true,
        createdByUserId: "user",
      });
      const params = {
        projectId: "project",
        name: "test-skill",
        version: 1,
        actor: test.params.actor,
      };
      const mutate = () =>
        operation === "setLabels"
          ? test.service.setLabels({ ...params, labels: [] })
          : test.service.deleteVersion(params);

      await expect(mutate()).rejects.toMatchObject({ httpCode: 403 });
      expect(test.transaction).toHaveBeenCalledOnce();
      expect(auditLog).not.toHaveBeenCalled();

      test.db.projectMembership.findFirst.mockResolvedValue({ role: "ADMIN" });
      await mutate();
      expect(test.transaction).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["session", "project-key"] as const)(
    "allows protected-label mutations by an authorized %s actor",
    async (kind) => {
      const test = setup();
      test.skill.labels = ["production"];
      test.tx.skill.findFirst.mockResolvedValue(test.skill);
      test.tx.skill.findMany.mockResolvedValue([test.skill]);
      test.db.promptProtectedLabels.findMany.mockResolvedValue([
        { label: "production" },
      ]);
      const params = {
        projectId: "project",
        name: "test-skill",
        version: 1,
        actor: kind === "session" ? sessionActor("ADMIN") : test.params.actor,
      };

      await test.service.setLabels({ ...params, labels: [] });
      await test.service.deleteVersion(params);
      expect(test.tx.skill.update).toHaveBeenCalledOnce();
      expect(test.tx.skill.delete).toHaveBeenCalledOnce();
      expect(test.db.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(["create", "setLabels", "setTags", "delete"] as const)(
    "waits for the skill mutation lock before reading versions during %s",
    async (operation) => {
      const test = setup();
      const lock = Promise.withResolvers<void>();
      test.tx.$executeRaw.mockReturnValue(lock.promise);
      test.tx.skill.findFirst.mockResolvedValue(test.skill);
      const selector = {
        projectId: "project",
        name: "test-skill",
        version: 1,
        actor: test.params.actor,
      };
      const mutations = {
        create: () => test.service.createVersion(test.params),
        setLabels: () => test.service.setLabels({ ...selector, labels: [] }),
        setTags: () => test.service.setTags({ ...selector, tags: [] }),
        delete: () => test.service.deleteVersion(selector),
      };
      const mutation = mutations[operation]();

      try {
        await vi.waitFor(() => {
          expect(test.tx.$executeRaw).toHaveBeenCalledOnce();
        });
        expect(test.tx.skill.findFirst).not.toHaveBeenCalled();
      } finally {
        lock.resolve();
        await mutation;
      }
    },
  );

  it("rejects creating a new skill when its name already exists", async () => {
    const test = setup();
    test.tx.skill.findFirst.mockResolvedValue(test.skill);
    const params = { ...test.params, target: { kind: "new" as const } };

    await expect(test.service.createVersion(params)).rejects.toThrow(
      "already exists",
    );
    expect(test.create).not.toHaveBeenCalled();
    expect(test.tx.skill.update).not.toHaveBeenCalled();
    expect(test.tx.skill.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project", name: "test-skill" },
      }),
    );
  });

  it("rejects renaming an existing skill through version creation", async () => {
    const test = setup();
    const params = {
      ...test.params,
      target: { kind: "version" as const, name: "original-skill" },
    };
    await expect(test.service.createVersion(params)).rejects.toThrow(
      "must remain",
    );
    expect(test.create).not.toHaveBeenCalled();
  });

  it("creates with only latest and leaves deployment labels on the previous version", async () => {
    const test = setup();
    const previous = {
      id: "previous",
      version: 1,
      labels: ["latest", "production", "stable"],
    };
    test.tx.skill.findFirst.mockResolvedValue(previous);
    test.tx.skill.findMany.mockResolvedValue([previous]);
    const params = {
      ...test.params,
      target: { kind: "version" as const, name: "test-skill" },
      input: { ...test.params.input, labels: ["production"] },
    };

    await test.service.createVersion(params);

    expect(test.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 2,
        labels: ["latest"],
      }),
    });
    expect(test.tx.skill.update).toHaveBeenCalledWith({
      where: { projectId: "project", id: "previous" },
      data: { labels: { set: ["production", "stable"] } },
    });
  });

  it("blocks whole-skill deletion when an older version has a protected label", async () => {
    const test = setup();
    test.tx.skill.findMany.mockResolvedValue([
      { ...test.skill, labels: ["latest"], version: 2 },
      { ...test.skill, labels: ["production"] },
    ]);
    test.db.promptProtectedLabels.findMany.mockResolvedValue([
      { label: "production" },
    ]);
    await expect(
      test.service.deleteSkill({
        projectId: "project",
        name: "test-skill",
        actor: sessionActor("MEMBER"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(test.transaction).toHaveBeenCalledOnce();
    expect(test.tx.skill.deleteMany).not.toHaveBeenCalled();
  });

  it("allows ordinary label changes while keeping a protected label", async () => {
    const test = setup();
    test.skill.labels = ["latest", "production", "old"];
    test.tx.skill.findFirst.mockResolvedValue(test.skill);
    test.tx.skill.findMany.mockResolvedValue([test.skill]);
    test.db.promptProtectedLabels.findMany.mockResolvedValue([
      { label: "production" },
    ]);

    await test.service.setLabels({
      projectId: "project",
      name: "test-skill",
      version: 1,
      labels: ["production", "stable"],
      actor: sessionActor("MEMBER"),
    });

    expect(test.tx.skill.update).toHaveBeenCalledExactlyOnceWith({
      where: { projectId: "project", id: "skill" },
      data: { labels: { set: ["production", "stable", "latest"] } },
    });
  });

  it("preserves latest when replacing user-managed labels", async () => {
    const test = setup();
    test.skill.labels = ["latest", "production"];
    test.tx.skill.findFirst.mockResolvedValue(test.skill);
    test.tx.skill.findMany.mockResolvedValue([
      test.skill,
      { id: "previous", labels: ["stable"] },
    ]);

    await test.service.setLabels({
      projectId: "project",
      name: "test-skill",
      version: 1,
      labels: ["stable"],
      actor: test.params.actor,
    });

    expect(test.tx.skill.update).toHaveBeenCalledWith({
      where: { projectId: "project", id: "skill" },
      data: { labels: { set: ["stable", "latest"] } },
    });
    expect(test.tx.skill.update).toHaveBeenCalledWith({
      where: { projectId: "project", id: "previous" },
      data: { labels: { set: [] } },
    });
  });

  it("verifies every distinct upload before downloading only SKILL.md and publishing its frontmatter", async () => {
    const test = setup();

    const result = await test.service.createVersion(test.params);

    expect(test.events).toEqual([
      "size:skills/project/blob-0",
      "verified:blob-0",
      "size:skills/project/blob-1",
      "verified:blob-1",
      "download:skills/project/blob-0",
      "transaction",
    ]);
    expect(test.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project",
        id: { in: ["blob-0", "blob-1", "blob-1"] },
      },
    });
    expect(test.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "test-skill",
        description: "A test skill",
        frontmatter: { name: "test-skill", description: "A test skill" },
      }),
    });
    expect(test.updateMany).toHaveBeenCalledTimes(2);
    expect(test.updateMany).toHaveBeenNthCalledWith(1, {
      where: { projectId: "project", id: "blob-0", verifiedAt: null },
      data: { verifiedAt: expect.any(Date) },
    });
    expect(test.updateMany).toHaveBeenNthCalledWith(2, {
      where: { projectId: "project", id: "blob-1", verifiedAt: null },
      data: { verifiedAt: expect.any(Date) },
    });
    expect(result.name).toBe("test-skill");
  });

  it("rejects invalid SKILL.md frontmatter after verifying uploads but before publication", async () => {
    const test = setup();
    const invalidMarkdown = Buffer.from("No frontmatter");
    test.blobs[0]!.contentLength = invalidMarkdown.byteLength;
    test.downloadBytes.mockResolvedValue(invalidMarkdown);

    await expect(test.service.createVersion(test.params)).rejects.toThrow(
      "SKILL.md must start with YAML frontmatter",
    );
    expect(test.getObjectSize).toHaveBeenCalledTimes(2);
    expect(test.downloadBytes).toHaveBeenCalledOnce();
    expect(test.transaction).not.toHaveBeenCalled();
    expect(test.blobs.every((blob) => blob.verifiedAt instanceof Date)).toBe(
      true,
    );
  });

  it("does not publish if SKILL.md cannot be downloaded after uploads are verified", async () => {
    const test = setup();
    test.downloadBytes.mockRejectedValue(new Error("Object not found"));

    await expect(test.service.createVersion(test.params)).rejects.toThrow(
      "Skill blob blob-0 has not been uploaded",
    );
    expect(test.getObjectSize).toHaveBeenCalledTimes(2);
    expect(test.downloadBytes).toHaveBeenCalledWith("skills/project/blob-0");
    expect(test.transaction).not.toHaveBeenCalled();
  });
});
