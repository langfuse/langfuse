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
      const storageConfig = {
        client: { getSignedUploadUrl } as unknown as StorageService,
        bucketName: `${mode}-bucket`,
      };
      const defaultConfig = vi.mocked(getSkillStorageClient);
      defaultConfig.mockReset();
      if (mode === "default") {
        defaultConfig.mockReturnValue(storageConfig);
      } else {
        defaultConfig.mockImplementation(() => {
          throw new Error("Default storage is unavailable");
        });
      }
      const create = vi.fn(
        async ({ data }: { data: Prisma.SkillBlobUncheckedCreateInput }) => ({
          ...data,
          uploadedAt: null,
        }),
      );
      const prisma = { skillBlob: { create } } as unknown as PrismaClient;
      const service = new SkillService(
        prisma,
        mode === "injected" ? storageConfig : undefined,
      );
      const hash = createHash("sha256").update("hello").digest();
      const descriptor = {
        sha256Hash: hash.toString("base64"),
        contentType: "text/plain",
        contentLength: 5,
      };

      const result = await service.prepareUploads({
        projectId: "project",
        createdBy: "user",
        input: { blobs: [descriptor] },
      });

      const path = `skills/project/${hash.toString("base64url")}`;
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bucketName: `${mode}-bucket`,
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
        createdBy: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        uploadedAt: null,
        sha256Hash: createHash("sha256").update(bytes).digest("base64"),
        contentType: index === 0 ? "text/markdown" : "application/octet-stream",
        contentLength: BigInt(bytes.byteLength),
        bucketName: "bucket",
        bucketPath: `skills/project/blob-${index}`,
      }),
    );
    const events: string[] = [];
    const getObjectSize = vi.fn(async (path: string) => {
      events.push(`size:${path}`);
      return Number(
        blobs.find((blob) => blob.bucketPath === path)!.contentLength,
      );
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
        where: { projectId: string; id: string; uploadedAt: null };
        data: { uploadedAt: Date };
      }) => {
        const blob = blobs.find(
          (blob) =>
            blob.projectId === where.projectId &&
            blob.id === where.id &&
            blob.uploadedAt === where.uploadedAt,
        );
        if (!blob) return { count: 0 };
        blob.uploadedAt = data.uploadedAt;
        events.push(`uploaded:${blob.id}`);
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
    const service = new SkillService(db as unknown as PrismaClient, {
      bucketName: "bucket",
      client: { getObjectSize, downloadBytes } as unknown as StorageService,
    });
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
      expect(test.transaction).not.toHaveBeenCalled();
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
      expect(test.transaction).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();

      test.db.projectMembership.findFirst.mockResolvedValue({ role: "ADMIN" });
      await mutate();
      expect(test.transaction).toHaveBeenCalledOnce();
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

  it.each([
    {
      existing: ["production", "staging", "latest"],
      next: ["production", "preview"],
      protected: ["production"],
    },
    { existing: ["latest"], next: ["preview"], protected: ["latest"] },
  ])(
    "allows unrelated label changes with protected labels $protected",
    async ({ existing, next, protected: protectedLabels }) => {
      const test = setup();
      test.skill.labels = existing;
      test.tx.skill.findFirst.mockResolvedValue(test.skill);
      test.tx.skill.findMany.mockResolvedValue([test.skill]);
      test.db.promptProtectedLabels.findMany.mockResolvedValue(
        protectedLabels.map((label) => ({ label })),
      );

      await test.service.setLabels({
        projectId: "project",
        name: "test-skill",
        version: 1,
        labels: next,
        actor: sessionActor("MEMBER"),
      });
      expect(test.tx.skill.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { labels: { set: [...next, "latest"] } },
        }),
      );
      expect(test.db.promptProtectedLabels.findMany).toHaveBeenCalledWith({
        where: { projectId: "project" },
      });
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

  it("creates a new skill with all supplied files and without inherited metadata", async () => {
    const test = setup();
    await test.service.createVersion({
      ...test.params,
      target: { kind: "new" },
    });
    expect(test.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "test-skill",
        version: 1,
        tags: [],
        labels: ["latest"],
        files: {
          create: expect.arrayContaining(
            test.params.input.files.map((file) =>
              expect.objectContaining({ path: file.path }),
            ),
          ),
        },
      }),
    });
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

  it("does not recreate a deleted skill through version creation", async () => {
    const test = setup();
    const params = {
      ...test.params,
      target: { kind: "version" as const, name: "test-skill" },
    };
    await expect(test.service.createVersion(params)).rejects.toThrow(
      "Skill not found",
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
      where: { projectId_id: { projectId: "project", id: "previous" } },
      data: { labels: { set: ["production", "stable"] } },
    });
  });

  it("resolves latest through the stored label without synthesizing labels on reads", async () => {
    const test = setup();
    test.skill.labels = ["latest"];
    const result = await test.service.get({
      projectId: "project",
      name: "test-skill",
      selector: { label: "latest" },
    });

    expect(test.db.skill.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project",
          name: "test-skill",
          labels: { has: "latest" },
        },
      }),
    );
    expect(result.labels).toEqual(["latest"]);
    expect(test.db.skill.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "creates with database tags instead of supplied tags (existing skill: %s)",
    async (hasPrevious) => {
      const test = setup();
      const tags = hasPrevious ? ["shared-tag"] : [];
      if (hasPrevious) {
        test.tx.skill.findFirst.mockResolvedValue({
          id: "previous",
          version: 1,
          labels: ["latest"],
          tags,
        });
      }
      const params = {
        ...test.params,
        input: { ...test.params.input, tags: ["stale-client-tag"] },
      };

      await test.service.createVersion(params);

      expect(test.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tags }),
      });
    },
  );

  it.each([{ tags: ["shared-tag"] }, { tags: [] }])(
    "sets tags on all versions while isolating other skills and projects: $tags",
    async ({ tags }) => {
      const test = setup();
      test.skill.tags = tags;
      const versions = [
        test.skill,
        { ...test.skill, id: "newer", version: 2, tags: ["old-tag"] },
        {
          ...test.skill,
          id: "other-project",
          projectId: "other",
          tags: ["keep"],
        },
        {
          ...test.skill,
          id: "other-skill",
          name: "other-skill",
          tags: ["keep"],
        },
      ];
      test.tx.skill.findFirst.mockResolvedValue(test.skill);
      test.tx.skill.updateMany.mockImplementation(
        async ({
          where,
          data,
        }: {
          where: { projectId: string; name: string };
          data: { tags: { set: string[] } };
        }) => {
          const matches = versions.filter(
            (version) =>
              version.projectId === where.projectId &&
              version.name === where.name,
          );
          for (const version of matches) version.tags = [...data.tags.set];
          return { count: matches.length };
        },
      );

      await test.service.setTags({
        projectId: "project",
        name: "test-skill",
        version: 1,
        tags,
        actor: test.params.actor,
      });

      expect(versions.map((version) => version.tags)).toEqual([
        tags,
        tags,
        ["keep"],
        ["keep"],
      ]);
    },
  );

  it("blocks whole-skill deletion when an older version has a protected label", async () => {
    const test = setup();
    test.db.skill.findMany.mockResolvedValue([
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
    expect(test.transaction).not.toHaveBeenCalled();
    expect(test.tx.skill.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes all versions in the project and audits the whole-skill deletion", async () => {
    const test = setup();
    test.skill.labels = ["production"];
    test.db.promptProtectedLabels.findMany.mockResolvedValue([
      { label: "production" },
    ]);
    const versions = [test.skill, { ...test.skill, id: "second", version: 2 }];
    test.db.skill.findMany.mockResolvedValue(versions);
    test.tx.skill.findMany.mockResolvedValue(versions);
    await test.service.deleteSkill({
      projectId: "project",
      name: "test-skill",
      actor: sessionActor("ADMIN"),
    });
    expect(test.db.skill.findMany).toHaveBeenCalledWith({
      where: { projectId: "project", name: "test-skill" },
      select: { labels: true },
    });
    expect(test.tx.skill.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { projectId: "project", name: "test-skill" },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: "skill",
        action: "delete",
        resourceId: "test-skill",
        projectId: "project",
        before: expect.objectContaining({
          name: "test-skill",
          versions: [1, 2],
        }),
      }),
      test.tx,
    );
    expect(test.tx.skill.update).not.toHaveBeenCalled();
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
      where: { projectId_id: { projectId: "project", id: "skill" } },
      data: { labels: { set: ["stable", "latest"] } },
    });
    expect(test.tx.skill.update).toHaveBeenCalledWith({
      where: { projectId_id: { projectId: "project", id: "previous" } },
      data: { labels: { set: [] } },
    });
  });

  it.each([true, false])(
    "handles deleting the latest version with remaining versions: %s",
    async (hasRemaining) => {
      const test = setup();
      test.skill.labels = ["latest"];
      test.skill.version = 3;
      const remaining = hasRemaining
        ? { id: "previous", version: 2, labels: ["production"] }
        : null;
      test.tx.skill.findFirst
        .mockResolvedValueOnce(test.skill)
        .mockResolvedValueOnce(remaining);

      await test.service.deleteVersion({
        projectId: "project",
        name: "test-skill",
        version: 3,
        actor: test.params.actor,
      });

      expect(test.tx.skill.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { projectId: "project", name: "test-skill" },
          orderBy: { version: "desc" },
        }),
      );
      if (hasRemaining) {
        expect(test.tx.skill.update).toHaveBeenCalledWith({
          where: { projectId_id: { projectId: "project", id: "previous" } },
          data: { labels: { set: ["production", "latest"] } },
        });
      } else {
        expect(test.tx.skill.update).not.toHaveBeenCalled();
      }
      expect(test.tx.skill.delete).toHaveBeenCalledWith({
        where: { projectId_id: { projectId: "project", id: "skill" } },
      });
    },
  );

  it("does not move latest when deleting an older version", async () => {
    const test = setup();
    test.tx.skill.findFirst.mockResolvedValue(test.skill);

    await test.service.deleteVersion({
      projectId: "project",
      name: "test-skill",
      version: 1,
      actor: test.params.actor,
    });

    expect(test.tx.skill.delete).toHaveBeenCalledOnce();
    expect(test.tx.skill.findFirst).toHaveBeenCalledOnce();
    expect(test.tx.skill.update).not.toHaveBeenCalled();
  });

  it("verifies every distinct upload before downloading only SKILL.md and publishing its frontmatter", async () => {
    const test = setup();

    const result = await test.service.createVersion(test.params);

    expect(test.events).toEqual([
      "size:skills/project/blob-0",
      "uploaded:blob-0",
      "size:skills/project/blob-1",
      "uploaded:blob-1",
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
      where: { projectId: "project", id: "blob-0", uploadedAt: null },
      data: { uploadedAt: expect.any(Date) },
    });
    expect(test.updateMany).toHaveBeenNthCalledWith(2, {
      where: { projectId: "project", id: "blob-1", uploadedAt: null },
      data: { uploadedAt: expect.any(Date) },
    });
    expect(result.name).toBe("test-skill");
  });

  it.each([0, 2, 4])(
    "rejects an uploaded size of %i instead of 3 before downloading SKILL.md",
    async (size) => {
      const test = setup();
      test.getObjectSize
        .mockResolvedValueOnce(Number(test.blobs[0]!.contentLength))
        .mockResolvedValueOnce(size);

      await expect(test.service.createVersion(test.params)).rejects.toThrow(
        "does not match its declared length",
      );
      expect(test.downloadBytes).not.toHaveBeenCalled();
      expect(test.transaction).not.toHaveBeenCalled();
      expect(test.blobs[0]!.uploadedAt).toBeInstanceOf(Date);
      expect(test.blobs[1]!.uploadedAt).toBeNull();
    },
  );

  it("rejects a missing upload before downloading SKILL.md", async () => {
    const test = setup();
    test.getObjectSize
      .mockResolvedValueOnce(Number(test.blobs[0]!.contentLength))
      .mockRejectedValueOnce(new Error("Object not found"));

    await expect(test.service.createVersion(test.params)).rejects.toThrow(
      "Skill blob blob-1 has not been uploaded",
    );
    expect(test.downloadBytes).not.toHaveBeenCalled();
    expect(test.transaction).not.toHaveBeenCalled();
  });

  it("preserves upload timestamps when publication fails and is retried", async () => {
    const test = setup();
    const existingTimestamp = new Date("2026-01-01T00:00:00Z");
    test.blobs[1]!.uploadedAt = existingTimestamp;
    test.transaction.mockRejectedValueOnce(new Error("Publication failed"));

    await expect(test.service.createVersion(test.params)).rejects.toThrow(
      "Publication failed",
    );
    const verifiedTimestamp = test.blobs[0]!.uploadedAt;
    expect(verifiedTimestamp).toBeInstanceOf(Date);
    expect(test.blobs[1]!.uploadedAt).toBe(existingTimestamp);
    expect(test.updateMany).toHaveBeenCalledTimes(1);

    await test.service.createVersion(test.params);

    expect(test.getObjectSize).toHaveBeenCalledTimes(4);
    expect(test.updateMany).toHaveBeenCalledTimes(1);
    expect(test.blobs[0]!.uploadedAt).toBe(verifiedTimestamp);
    expect(test.blobs[1]!.uploadedAt).toBe(existingTimestamp);
  });

  it("rejects invalid SKILL.md frontmatter after verifying uploads but before publication", async () => {
    const test = setup();
    const invalidMarkdown = Buffer.from("No frontmatter");
    test.blobs[0]!.contentLength = BigInt(invalidMarkdown.byteLength);
    test.downloadBytes.mockResolvedValue(invalidMarkdown);

    await expect(test.service.createVersion(test.params)).rejects.toThrow(
      "SKILL.md must start with YAML frontmatter",
    );
    expect(test.getObjectSize).toHaveBeenCalledTimes(2);
    expect(test.downloadBytes).toHaveBeenCalledOnce();
    expect(test.transaction).not.toHaveBeenCalled();
    expect(test.blobs.every((blob) => blob.uploadedAt instanceof Date)).toBe(
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
