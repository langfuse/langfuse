import { createHash } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  type StorageService,
} from "@langfuse/shared/src/server";
import { SkillService } from "@/src/features/skills/server";

const bucketName = "skills-test";
const objects = new Map<string, Uint8Array>();
const storage = {
  getSignedUploadUrl: vi.fn(
    async ({ path }: { path: string }) =>
      `https://upload.example/${encodeURIComponent(path)}`,
  ),
  getSignedUrl: vi.fn(
    async (path: string) =>
      `https://download.example/${encodeURIComponent(path)}`,
  ),
  downloadBytes: vi.fn(async (path: string) => {
    const value = objects.get(path);
    if (!value) throw new Error("not found");
    return value;
  }),
} as unknown as StorageService;

const organizationsToDelete: string[] = [];

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: organizationsToDelete } },
  });
});

async function setup() {
  const fixture = await createOrgProjectAndApiKey();
  organizationsToDelete.push(fixture.orgId);
  const apiKey = await prisma.apiKey.findUniqueOrThrow({
    where: { publicKey: fixture.publicKey },
  });
  return {
    ...fixture,
    service: new SkillService(prisma, storage, bucketName, "test-prefix"),
    auditActor: {
      apiKeyId: apiKey.id,
      orgId: fixture.orgId,
      projectId: fixture.projectId,
    },
  };
}

async function prepareSkillMd(params: {
  service: SkillService;
  projectId: string;
  name: string;
}) {
  const bytes = Buffer.from(
    `---\nname: ${params.name}\ndescription: Test skill\n---\n\nUse this skill.\n`,
  );
  const sha256Hash = createHash("sha256").update(bytes).digest("base64");
  const prepared = await params.service.prepareUploads({
    projectId: params.projectId,
    createdBy: "API",
    input: {
      blobs: [
        {
          sha256Hash,
          contentType: "text/markdown",
          contentLength: bytes.byteLength,
        },
      ],
    },
  });
  const blob = await prisma.skillBlob.findUniqueOrThrow({
    where: {
      projectId_id: {
        projectId: params.projectId,
        id: prepared.data[0]!.blobId,
      },
    },
  });
  objects.set(blob.bucketPath, bytes);
  return prepared.data[0]!.blobId;
}

describe("SkillService", () => {
  it("deduplicates concurrent upload preparation by project and hash", async () => {
    const fixture = await setup();
    const bytes = Buffer.from("same content");
    const input = {
      blobs: [
        {
          sha256Hash: createHash("sha256").update(bytes).digest("base64"),
          contentType: "text/plain",
          contentLength: bytes.byteLength,
        },
      ],
    };

    const prepared = await Promise.all([
      fixture.service.prepareUploads({
        projectId: fixture.projectId,
        createdBy: "API",
        input,
      }),
      fixture.service.prepareUploads({
        projectId: fixture.projectId,
        createdBy: "API",
        input,
      }),
    ]);

    expect(prepared[0].data[0]!.blobId).toBe(prepared[1].data[0]!.blobId);
    expect(
      await prisma.skillBlob.count({
        where: { projectId: fixture.projectId },
      }),
    ).toBe(1);
  });

  it("manages protected labels with atomic audit records", async () => {
    const fixture = await setup();

    await fixture.service.createProtectedLabel({
      projectId: fixture.projectId,
      label: "production",
      auditActor: fixture.auditActor,
    });
    expect(
      await fixture.service.protectedLabels({
        projectId: fixture.projectId,
      }),
    ).toEqual(["production"]);

    await fixture.service.deleteProtectedLabel({
      projectId: fixture.projectId,
      label: "production",
      auditActor: fixture.auditActor,
    });
    expect(
      await fixture.service.protectedLabels({
        projectId: fixture.projectId,
      }),
    ).toEqual([]);
    expect(
      await prisma.auditLog.findMany({
        where: {
          projectId: fixture.projectId,
          resourceType: "skillProtectedLabel",
        },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      }),
    ).toEqual([{ action: "create" }, { action: "delete" }]);
  });

  it("creates a skill using the name from SKILL.md frontmatter", async () => {
    const fixture = await setup();
    const name = "frontmatter-name";
    const blobId = await prepareSkillMd({
      service: fixture.service,
      projectId: fixture.projectId,
      name,
    });

    const created = await fixture.service.createVersion({
      projectId: fixture.projectId,
      createdBy: "API",
      input: {
        files: [{ path: "SKILL.md", blobId, executable: false }],
        labels: [],
      },
      auditActor: fixture.auditActor,
    });

    expect(created).toMatchObject({ name, version: 1 });
  });

  it("serializes concurrent version creation and moves labels atomically", async () => {
    const fixture = await setup();
    const name = "support-triage";
    const blobId = await prepareSkillMd({
      service: fixture.service,
      projectId: fixture.projectId,
      name,
    });
    const input = {
      files: [{ path: "SKILL.md", blobId, executable: false }],
      labels: [],
      tags: ["support"],
      commitMessage: null,
    };

    const created = await Promise.all([
      fixture.service.createVersion({
        projectId: fixture.projectId,
        createdBy: "API",
        input,
        auditActor: fixture.auditActor,
      }),
      fixture.service.createVersion({
        projectId: fixture.projectId,
        createdBy: "API",
        input,
        auditActor: fixture.auditActor,
      }),
    ]);

    expect(created.map(({ version }) => version).sort()).toEqual([1, 2]);

    await fixture.service.setLabels({
      projectId: fixture.projectId,
      name,
      version: 1,
      labels: ["production"],
      auditActor: fixture.auditActor,
    });
    await fixture.service.setLabels({
      projectId: fixture.projectId,
      name,
      version: 2,
      labels: ["production"],
      auditActor: fixture.auditActor,
    });

    const production = await fixture.service.get({
      projectId: fixture.projectId,
      name,
      selector: { label: "production" },
    });
    expect(production.version).toBe(2);

    const latestList = await fixture.service.list({
      projectId: fixture.projectId,
      input: { label: "latest", page: 1, limit: 10 },
    });
    expect(latestList.data).toHaveLength(1);
    expect(latestList.data[0]!.latestVersion).toBe(2);

    const third = await fixture.service.createVersion({
      projectId: fixture.projectId,
      createdBy: "API",
      input: {
        ...input,
        labels: ["production"],
        commitMessage: "Promote to production",
      },
      auditActor: fixture.auditActor,
    });
    expect(third.version).toBe(3);
    const editor = await fixture.service.getEditor({
      projectId: fixture.projectId,
      name,
      selector: { version: 3 },
    });
    expect(editor.files).toEqual([
      expect.objectContaining({
        path: "SKILL.md",
        content: expect.stringContaining(`name: ${name}`),
      }),
    ]);
    expect(editor.history).toEqual([
      {
        version: 3,
        labels: ["production"],
        commitMessage: "Promote to production",
        createdAt: expect.any(Date),
      },
      {
        version: 2,
        labels: [],
        commitMessage: null,
        createdAt: expect.any(Date),
      },
      {
        version: 1,
        labels: [],
        commitMessage: null,
        createdAt: expect.any(Date),
      },
    ]);
    expect(
      await fixture.service.get({
        projectId: fixture.projectId,
        name,
        selector: { label: "production" },
      }),
    ).toMatchObject({ version: 3 });

    const labelRemovalAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        projectId: fixture.projectId,
        resourceType: "skill",
        resourceId: created.find(({ version }) => version === 2)!.id,
        action: "setLabel",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(labelRemovalAudit.after ?? "null")).toEqual([]);

    await fixture.service.deleteVersion({
      projectId: fixture.projectId,
      name,
      version: 1,
      auditActor: fixture.auditActor,
    });
    const deleteAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        projectId: fixture.projectId,
        resourceType: "skill",
        resourceId: created.find(({ version }) => version === 1)!.id,
        action: "delete",
      },
    });
    expect(JSON.parse(deleteAudit.before ?? "null").labels).not.toContain(
      "latest",
    );

    expect(
      await prisma.skill.count({
        where: {
          projectId: fixture.projectId,
          name,
          labels: { has: "production" },
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          projectId: fixture.projectId,
          resourceType: "skill",
          action: "create",
        },
      }),
    ).toBe(3);
  });

  it("rejects a cross-project blob reference without creating a version or audit", async () => {
    const first = await setup();
    const second = await setup();
    const blobId = await prepareSkillMd({
      service: first.service,
      projectId: first.projectId,
      name: "isolated-skill",
    });

    await expect(
      second.service.createVersion({
        projectId: second.projectId,
        createdBy: "API",
        input: {
          files: [{ path: "SKILL.md", blobId, executable: false }],
          labels: [],
        },
        auditActor: second.auditActor,
      }),
    ).rejects.toThrow("skill blobs were not found");

    expect(
      await prisma.skill.count({
        where: { projectId: second.projectId },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { projectId: second.projectId, resourceType: "skill" },
      }),
    ).toBe(0);
  });

  it("rejects persisting the virtual latest label", async () => {
    const fixture = await setup();
    const name = "virtual-label-guard";
    const blobId = await prepareSkillMd({
      service: fixture.service,
      projectId: fixture.projectId,
      name,
    });
    const created = await fixture.service.createVersion({
      projectId: fixture.projectId,
      createdBy: "API",
      input: {
        files: [{ path: "SKILL.md", blobId, executable: false }],
        labels: ["production"],
      },
      auditActor: fixture.auditActor,
    });

    await expect(
      fixture.service.setLabels({
        projectId: fixture.projectId,
        name,
        version: created.version,
        labels: ["latest"],
        auditActor: fixture.auditActor,
      }),
    ).rejects.toThrow("managed by Langfuse");

    expect(
      await prisma.skill.findUniqueOrThrow({
        where: {
          projectId_id: {
            projectId: fixture.projectId,
            id: created.id,
          },
        },
        select: { labels: true },
      }),
    ).toEqual({ labels: ["production"] });
    expect(
      await prisma.auditLog.count({
        where: {
          projectId: fixture.projectId,
          resourceType: "skill",
          resourceId: created.id,
          action: "setLabel",
        },
      }),
    ).toBe(0);
  });

  it("updates tags without creating a new skill version", async () => {
    const fixture = await setup();
    const name = "mutable-tags";
    const blobId = await prepareSkillMd({
      service: fixture.service,
      projectId: fixture.projectId,
      name,
    });
    const created = await fixture.service.createVersion({
      projectId: fixture.projectId,
      createdBy: "API",
      input: {
        files: [{ path: "SKILL.md", blobId, executable: false }],
        labels: [],
        tags: ["support"],
      },
      auditActor: fixture.auditActor,
    });

    const updated = await fixture.service.setTags({
      projectId: fixture.projectId,
      name,
      version: created.version,
      tags: ["support", "internal", "support"],
      auditActor: fixture.auditActor,
    });

    expect(updated).toMatchObject({
      version: 1,
      tags: ["support", "internal"],
    });
    expect(
      await prisma.skill.count({
        where: { projectId: fixture.projectId, name },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.findFirstOrThrow({
        where: {
          projectId: fixture.projectId,
          resourceType: "skill",
          resourceId: created.id,
          action: "setTag",
        },
      }),
    ).toMatchObject({
      before: JSON.stringify(["support"]),
      after: JSON.stringify(["support", "internal"]),
    });
  });
});
