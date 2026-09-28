import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectAuthedContext } from "@/src/server/api/trpc";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { SkillService } from "@/src/features/skills/server/skill-service";
import { auditLog } from "@/src/features/audit-logs/server";

vi.mock("@/src/features/audit-logs/server", () => ({
  auditLog: vi.fn(),
}));

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
    const markdown =
      "---\nname: test-skill\ndescription: A test skill\n---\nInstructions";
    const blobs = [markdown, "Hello 🌍\n"].map((content, index) => ({
      id: `blob-${index}`,
      projectId: "project",
      createdAt: new Date(),
      sha256Hash: createHash("sha256").update(content).digest("base64"),
      contentType: "text/plain",
      contentLength: Buffer.byteLength(content, "utf8"),
      content,
    }));
    const files = [
      { path: "SKILL.md", content: markdown },
      { path: "reference.txt", content: blobs[1]!.content },
      { path: "copy.txt", content: blobs[1]!.content },
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
        blobId: blobs[index === 0 ? 0 : 1]!.id,
        blob: blobs[index === 0 ? 0 : 1]!,
      })),
    };
    const create = vi.fn().mockResolvedValue(skill);
    const tx = {
      $executeRaw: vi.fn(),
      skillBlob: {
        createMany: vi
          .fn<
            (input: {
              data: unknown[];
              skipDuplicates: boolean;
            }) => Promise<{ count: number }>
          >()
          .mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockResolvedValue(blobs),
      },
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
        return callback(tx);
      },
    );
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
      skillFile: { findFirst: vi.fn().mockResolvedValue(skill.files[0]) },
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
    const service = new SkillService(db as unknown as PrismaClient);
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
      transaction,
      create,
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

  it("deduplicates text and derives UTF-8 metadata inside the version transaction", async () => {
    const test = setup();

    const result = await test.service.createVersion(test.params);

    expect(test.tx.skillBlob.createMany).toHaveBeenCalledExactlyOnceWith({
      data: expect.arrayContaining(
        test.blobs.map(({ content, contentLength, sha256Hash }) =>
          expect.objectContaining({
            projectId: "project",
            content,
            contentLength,
            sha256Hash,
          }),
        ),
      ),
      skipDuplicates: true,
    });
    expect(test.tx.skillBlob.createMany.mock.calls[0]![0].data).toHaveLength(2);
    expect(test.tx.skillBlob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project",
          sha256Hash: { in: test.blobs.map(({ sha256Hash }) => sha256Hash) },
        },
      }),
    );
    expect(test.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "test-skill",
        description: "A test skill",
        frontmatter: { name: "test-skill", description: "A test skill" },
        files: {
          create: [
            expect.objectContaining({
              path: "SKILL.md",
              blob: { connect: { projectId: "project", id: "blob-0" } },
            }),
            expect.objectContaining({
              path: "reference.txt",
              blob: { connect: { projectId: "project", id: "blob-1" } },
            }),
            expect.objectContaining({
              path: "copy.txt",
              blob: { connect: { projectId: "project", id: "blob-1" } },
            }),
          ],
        },
      }),
    });
    expect(result.name).toBe("test-skill");
    expect(result.files.every((file) => !("content" in file))).toBe(true);
  });

  it("rejects invalid SKILL.md frontmatter before writing anything", async () => {
    const test = setup();
    test.params.input.files[0]!.content = "No frontmatter";

    await expect(test.service.createVersion(test.params)).rejects.toThrow(
      "SKILL.md must start with YAML frontmatter",
    );
    expect(test.transaction).not.toHaveBeenCalled();
    expect(test.create).not.toHaveBeenCalled();
  });

  it.each([
    { path: "reference.txt", content: "binary\0content" },
    { path: "reference.txt", content: "invalid\ud800" },
    { path: "image.svg", content: "<svg />" },
    { path: "archive.zip", content: "disguised archive" },
    { path: "resource.unknown", content: "plain text" },
    { path: "docs.md/README", content: "plain text" },
    { path: "resource.txt.exe", content: "plain text" },
    { path: "../secret.txt", content: "hello" },
    { path: "reference.txt", content: "🌍".repeat(250_001) },
  ])(
    "rejects invalid text or paths before creating blobs: $path",
    async (file) => {
      const test = setup();
      test.params.input.files[1] = file;

      await expect(test.service.createVersion(test.params)).rejects.toThrow();
      expect(test.transaction).not.toHaveBeenCalled();
    },
  );

  it("counts every file's UTF-8 bytes toward the version limit before deduplication", async () => {
    const test = setup();
    test.params.input.files[1]!.content = "🌍".repeat(125_000);
    test.params.input.files[2]!.content = test.params.input.files[1]!.content;

    await expect(test.service.createVersion(test.params)).rejects.toThrow(
      "in total",
    );
    expect(test.transaction).not.toHaveBeenCalled();
  });

  it("returns persisted text only after a project-scoped file lookup", async () => {
    const test = setup();
    await expect(
      test.service.getFileContent({ projectId: "project", fileId: "file-0" }),
    ).resolves.toEqual({ content: test.blobs[0]!.content });
    expect(test.db.skillFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project", id: "file-0" },
      }),
    );
    test.db.skillFile.findFirst.mockResolvedValue(null);
    await expect(
      test.service.getFileContent({
        projectId: "other-project",
        fileId: "file-0",
      }),
    ).rejects.toThrow("Skill file not found");
    expect(test.db.skillFile.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { projectId: "other-project", id: "file-0" },
      }),
    );
  });
});
