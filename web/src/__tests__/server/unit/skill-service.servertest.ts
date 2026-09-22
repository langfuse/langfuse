import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient, SkillBlob } from "@langfuse/shared/src/db";
import type { StorageService } from "@langfuse/shared/src/server";
import { SkillService } from "@/src/features/skills/server/skill-service";
import { getSkillStorageClient } from "@/src/features/skills/server/getSkillStorageClient";

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

describe("SkillService upload verification", () => {
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
      tags: [],
      labels: [],
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
      skill: { findFirst: vi.fn().mockResolvedValue(null), create },
    };
    const transaction = vi.fn(
      async (callback: (tx: unknown) => Promise<string>) => {
        events.push("transaction");
        return callback(tx);
      },
    );
    const findMany = vi.fn().mockResolvedValue(blobs);
    const prisma = {
      skillBlob: { findMany, updateMany },
      $transaction: transaction,
      skill: {
        findUnique: vi.fn().mockResolvedValue(skill),
        findFirstOrThrow: vi.fn().mockResolvedValue({ version: 1 }),
      },
    } as unknown as PrismaClient;
    const service = new SkillService(prisma, {
      bucketName: "bucket",
      client: { getObjectSize, downloadBytes } as unknown as StorageService,
    });
    const params = {
      projectId: "project",
      createdBy: "user",
      input: { files, labels: [] },
      auditActor: { projectId: "project", orgId: "org", apiKeyId: "api-key" },
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
    };
  }

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
