import { randomUUID } from "node:crypto";
import { parseDocument } from "yaml";
import {
  CreateSkillVersionBodySchema,
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  ListSkillsResponseSchema,
  MAX_SKILL_FILES,
  PrepareSkillUploadsResponseSchema,
  SKILL_LATEST_LABEL,
  SKILL_PRODUCTION_LABEL,
  SkillDescriptionSchema,
  SkillFileDownloadSchema,
  SkillNameSchema,
  SkillVersionSchema,
  UpdateSkillLabelsBodySchema,
  UpdateSkillTagsBodySchema,
  type CreateSkillVersionBody,
  type ListSkillsQuery,
  type PrepareSkillUploadsBody,
  type SkillSelector,
} from "@langfuse/shared";
import {
  Prisma,
  type PrismaClient,
  type SkillBlob,
} from "@langfuse/shared/src/db";
import type { StorageService } from "@langfuse/shared/src/server";
import type { ProjectAuthedContext } from "@/src/server/api/trpc";
import type { AuthorizationContext } from "@/src/features/auth/policy/types";
import { auditLog } from "@/src/features/audit-logs/server";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import { checkHasProtectedLabels } from "@/src/features/prompts/server/utils/checkHasProtectedLabels";
import {
  authorizeProtectedLabelMutation,
  type ApiKeyProjectContext,
} from "@/src/features/prompts/server/utils/authorizeProtectedLabelMutation";
import { getSkillStorageClient } from "./getSkillStorageClient";

const MAX_SKILL_FILE_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

type SkillActor =
  | Pick<ProjectAuthedContext, "session">
  | (ApiKeyProjectContext & { ctx?: AuthorizationContext });

type SkillWithRelations = Prisma.SkillGetPayload<{
  include: {
    files: { include: { blob: true } };
  };
}>;

function canonicalSha256(value: string): string | null {
  try {
    const bytes = Buffer.from(value, "base64");
    return bytes.length === 32 && bytes.toString("base64") === value
      ? value
      : null;
  } catch {
    return null;
  }
}

function skillBlobPath(params: {
  projectId: string;
  sha256Hash: string;
}): string {
  const encodedHash = Buffer.from(params.sha256Hash, "base64").toString(
    "base64url",
  );
  return `skills/${params.projectId}/${encodedHash}`;
}

function parseSkillFrontmatter(contents: Uint8Array): {
  name: string;
  description: string;
  frontmatter: Prisma.InputJsonObject;
} {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new InvalidRequestError("SKILL.md must be valid UTF-8");
  }

  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) {
    throw new InvalidRequestError(
      "SKILL.md must start with YAML frontmatter delimited by ---",
    );
  }

  const document = parseDocument(match[1] ?? "");
  if (document.errors.length > 0) {
    throw new InvalidRequestError(
      `SKILL.md frontmatter is invalid: ${document.errors[0]?.message ?? "unknown YAML error"}`,
    );
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 50 });
  } catch {
    throw new InvalidRequestError("SKILL.md frontmatter is invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidRequestError("SKILL.md frontmatter must be an object");
  }

  const frontmatter = value as Record<string, unknown>;
  const name = SkillNameSchema.parse(frontmatter.name);
  const description = SkillDescriptionSchema.parse(frontmatter.description);

  return {
    name,
    description,
    frontmatter: frontmatter as Prisma.InputJsonObject,
  };
}

function serializeVersion(skill: SkillWithRelations) {
  return SkillVersionSchema.parse({
    id: skill.id,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
    projectId: skill.projectId,
    createdBy: skill.createdBy,
    name: skill.name,
    description: skill.description,
    frontmatter: skill.frontmatter,
    version: skill.version,
    tags: skill.tags,
    labels: skill.labels,
    commitMessage: skill.commitMessage,
    files: skill.files.map((file) => ({
      id: file.id,
      path: file.path,
      blobId: file.blobId,
      sha256Hash: file.blob.sha256Hash,
      contentType: file.blob.contentType,
      contentLength: Number(file.blob.contentLength),
    })),
  });
}

export class SkillService {
  private readonly storage: StorageService;
  private readonly bucketName: string;

  constructor(
    private readonly prisma: PrismaClient,
    storageConfig: ReturnType<
      typeof getSkillStorageClient
    > = getSkillStorageClient(),
  ) {
    this.storage = storageConfig.client;
    this.bucketName = storageConfig.bucketName;
  }

  async prepareUploads(params: {
    projectId: string;
    createdBy: string;
    input: PrepareSkillUploadsBody;
  }) {
    const uniqueHashes = new Set<string>();
    for (const blob of params.input.blobs) {
      if (!canonicalSha256(blob.sha256Hash)) {
        throw new InvalidRequestError("Invalid canonical base64 SHA-256 hash");
      }
      if (uniqueHashes.has(blob.sha256Hash)) {
        throw new InvalidRequestError(
          "Upload descriptors must have unique hashes",
        );
      }
      uniqueHashes.add(blob.sha256Hash);
      if (blob.contentLength > MAX_SKILL_FILE_BYTES) {
        throw new InvalidRequestError(
          `Skill files must not exceed ${MAX_SKILL_FILE_BYTES} bytes`,
        );
      }
    }

    const prepared = [];
    for (const descriptor of params.input.blobs) {
      let blob: SkillBlob;
      try {
        blob = await this.prisma.skillBlob.create({
          data: {
            id: randomUUID(),
            projectId: params.projectId,
            createdBy: params.createdBy,
            sha256Hash: descriptor.sha256Hash,
            contentType: descriptor.contentType,
            contentLength: BigInt(descriptor.contentLength),
            bucketName: this.bucketName,
            bucketPath: skillBlobPath({
              projectId: params.projectId,
              sha256Hash: descriptor.sha256Hash,
            }),
          },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          throw error;
        }
        blob = await this.prisma.skillBlob.findUniqueOrThrow({
          where: {
            projectId_sha256Hash: {
              projectId: params.projectId,
              sha256Hash: descriptor.sha256Hash,
            },
          },
        });
      }

      if (
        Number(blob.contentLength) !== descriptor.contentLength ||
        blob.contentType !== descriptor.contentType
      ) {
        throw new LangfuseConflictError(
          "A blob with this hash already exists with different metadata",
        );
      }

      const uploadUrl = blob.uploadedAt
        ? null
        : await this.storage.getSignedUploadUrl({
            path: blob.bucketPath,
            ttlSeconds: 60 * 60,
            sha256Hash: blob.sha256Hash,
            contentType: blob.contentType,
            contentLength: Number(blob.contentLength),
          });

      prepared.push({ ...descriptor, blobId: blob.id, uploadUrl });
    }

    return PrepareSkillUploadsResponseSchema.parse({ data: prepared });
  }

  async createVersion(params: {
    projectId: string;
    createdBy: string;
    input: CreateSkillVersionBody;
    actor: SkillActor;
    target?: { kind: "new" } | { kind: "version"; name: string };
  }) {
    const input = CreateSkillVersionBodySchema.parse(params.input);
    const verifiedBlobs = await this.getAndVerifyBlobs({
      projectId: params.projectId,
      blobIds: input.files.map(({ blobId }) => blobId),
    });
    const verifiedBlobById = new Map(
      verifiedBlobs.map((blob) => [blob.id, blob]),
    );
    const skillMd = verifiedBlobById.get(
      input.files.find(({ path }) => path === "SKILL.md")!.blobId,
    )!;
    const frontmatter = await this.downloadAndParseSkillFrontmatter(skillMd);
    const name = frontmatter.name;
    if (params.target?.kind === "version" && params.target.name !== name) {
      throw new InvalidRequestError(
        `The skill name must remain "${params.target.name}" when creating a version. Create a new skill to use a different name.`,
      );
    }

    const skillId = await this.prisma.$transaction(async (tx) => {
      await this.lockSkill(tx, params.projectId, name);
      const latest = await tx.skill.findFirst({
        where: { projectId: params.projectId, name },
        orderBy: { version: "desc" },
        select: { id: true, version: true, labels: true, tags: true },
      });
      if (params.target?.kind === "new" && latest) {
        throw new LangfuseConflictError(
          `A skill named "${name}" already exists. Choose a different name.`,
        );
      }
      if (params.target?.kind === "version" && !latest) {
        throw new LangfuseNotFoundError("Skill not found");
      }
      if (latest) {
        const labels = latest.labels.filter(
          (label) => label !== SKILL_LATEST_LABEL,
        );
        await tx.skill.update({
          where: {
            projectId_id: { projectId: params.projectId, id: latest.id },
          },
          data: { labels: { set: labels } },
        });
        await auditLog(
          {
            ...params.actor,
            resourceType: "skill",
            action: "setLabel",
            resourceId: latest.id,
            projectId: params.projectId,
            before: latest.labels,
            after: labels,
          },
          tx,
        );
      }
      const skill = await tx.skill.create({
        data: {
          id: randomUUID(),
          projectId: params.projectId,
          createdBy: params.createdBy,
          name,
          description: frontmatter.description,
          frontmatter: frontmatter.frontmatter,
          version: (latest?.version ?? 0) + 1,
          tags: latest?.tags ?? [],
          labels: [SKILL_LATEST_LABEL],
          commitMessage: input.commitMessage,
          files: {
            create: input.files.map((file) => ({
              project: { connect: { id: params.projectId } },
              path: file.path,
              blob: {
                connect: {
                  projectId_id: {
                    projectId: params.projectId,
                    id: file.blobId,
                  },
                },
              },
            })),
          },
        },
      });
      await auditLog(
        {
          ...params.actor,
          resourceType: "skill",
          action: "create",
          resourceId: skill.id,
          projectId: params.projectId,
          after: {
            name: skill.name,
            version: skill.version,
            labels: skill.labels,
            tags: skill.tags,
            files: input.files.map((file) => ({
              path: file.path,
              blobId: file.blobId,
            })),
          },
        },
        tx,
      );
      return skill.id;
    });

    return this.getById({ projectId: params.projectId, skillId });
  }

  async get(params: {
    projectId: string;
    name: string;
    selector: SkillSelector;
  }) {
    const skill = await this.findSkillVersion(params);
    return serializeVersion(skill);
  }

  async getFileDownload(params: { projectId: string; fileId: string }) {
    const file = await this.prisma.skillFile.findFirst({
      where: { projectId: params.projectId, id: params.fileId },
      select: { blob: { select: { bucketPath: true } } },
    });
    if (!file) throw new LangfuseNotFoundError("Skill file not found");

    const expiresAt = new Date(
      Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000,
    ).toISOString();
    return SkillFileDownloadSchema.parse({
      downloadUrl: await this.storage.getSignedUrl(
        file.blob.bucketPath,
        DOWNLOAD_URL_TTL_SECONDS,
        false,
      ),
      downloadUrlExpiresAt: expiresAt,
    });
  }

  async list(params: { projectId: string; input: ListSkillsQuery }) {
    const where: Prisma.SkillWhereInput = {
      projectId: params.projectId,
      ...(params.input.name ? { name: params.input.name } : {}),
      ...(params.input.tag ? { tags: { has: params.input.tag } } : {}),
      ...(params.input.label ? { labels: { has: params.input.label } } : {}),
      ...(params.input.fromUpdatedAt || params.input.toUpdatedAt
        ? {
            updatedAt: {
              ...(params.input.fromUpdatedAt
                ? { gte: new Date(params.input.fromUpdatedAt) }
                : {}),
              ...(params.input.toUpdatedAt
                ? { lt: new Date(params.input.toUpdatedAt) }
                : {}),
            },
          }
        : {}),
    };
    const [matchingNames, groupedNames] = await Promise.all([
      this.prisma.skill.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        distinct: ["name"],
        skip: (params.input.page - 1) * params.input.limit,
        take: params.input.limit,
        select: { name: true },
      }),
      this.prisma.skill.groupBy({ by: ["name"], where }),
    ]);
    const totalItems = groupedNames.length;
    const skills = await this.prisma.skill.findMany({
      where: {
        projectId: params.projectId,
        name: { in: matchingNames.map(({ name }) => name) },
      },
      orderBy: [{ name: "asc" }, { version: "desc" }],
    });
    const skillsByName = new Map<string, typeof skills>();
    for (const skill of skills) {
      skillsByName.set(skill.name, [
        ...(skillsByName.get(skill.name) ?? []),
        skill,
      ]);
    }

    return ListSkillsResponseSchema.parse({
      data: matchingNames.flatMap(({ name }) => {
        const versions = skillsByName.get(name) ?? [];
        const latest = versions[0];
        return latest
          ? [
              {
                name,
                versions: versions.map(({ version }) => version),
                labels: [...new Set(versions.flatMap(({ labels }) => labels))],
                tags: latest.tags,
                lastUpdatedAt: versions.reduce(
                  (lastUpdatedAt, version) =>
                    version.updatedAt > lastUpdatedAt
                      ? version.updatedAt
                      : lastUpdatedAt,
                  latest.updatedAt,
                ),
                latestVersion: latest.version,
                description: latest.description,
              },
            ]
          : [];
      }),
      meta: {
        page: params.input.page,
        limit: params.input.limit,
        totalItems,
        totalPages: Math.ceil(totalItems / params.input.limit),
      },
    });
  }

  async setLabels(params: {
    projectId: string;
    name: string;
    version: number;
    labels: string[];
    actor: SkillActor;
  }) {
    const input = UpdateSkillLabelsBodySchema.parse({ labels: params.labels });
    const existing = await this.get({
      projectId: params.projectId,
      name: params.name,
      selector: { version: params.version },
    });
    const changedLabels = [
      ...existing.labels.filter((label) => !input.labels.includes(label)),
      ...input.labels.filter((label) => !existing.labels.includes(label)),
    ];
    await this.requireProtectedLabelAccess({
      projectId: params.projectId,
      labels: changedLabels,
      actor: params.actor,
    });
    const skillId = await this.prisma.$transaction(async (tx) => {
      await this.lockSkill(tx, params.projectId, params.name);
      const target = await tx.skill.findFirst({
        where: {
          projectId: params.projectId,
          name: params.name,
          version: params.version,
        },
      });
      if (!target) throw new LangfuseNotFoundError("Skill version not found");

      const versions = await tx.skill.findMany({
        where: { projectId: params.projectId, name: params.name },
        select: { id: true, labels: true },
      });
      const nextLabels = [...new Set(input.labels)];
      for (const version of versions) {
        const labels =
          version.id === target.id
            ? [
                ...nextLabels,
                ...version.labels.filter(
                  (label) => label === SKILL_LATEST_LABEL,
                ),
              ]
            : version.labels.filter((label) => !nextLabels.includes(label));
        if (version.labels.join("\0") === labels.join("\0")) continue;
        await tx.skill.update({
          where: {
            projectId_id: {
              projectId: params.projectId,
              id: version.id,
            },
          },
          data: { labels: { set: labels } },
        });
        await auditLog(
          {
            ...params.actor,
            resourceType: "skill",
            action: "setLabel",
            resourceId: version.id,
            projectId: params.projectId,
            before: version.labels,
            after: labels,
          },
          tx,
        );
      }
      return target.id;
    });
    return this.getById({ projectId: params.projectId, skillId });
  }

  async setTags(params: {
    projectId: string;
    name: string;
    version: number;
    tags: string[];
    actor: SkillActor;
  }) {
    const input = UpdateSkillTagsBodySchema.parse({ tags: params.tags });
    const skillId = await this.prisma.$transaction(async (tx) => {
      await this.lockSkill(tx, params.projectId, params.name);
      const target = await tx.skill.findFirst({
        where: {
          projectId: params.projectId,
          name: params.name,
          version: params.version,
        },
      });
      if (!target) throw new LangfuseNotFoundError("Skill version not found");

      const tags = [...new Set(input.tags)];
      await tx.skill.updateMany({
        where: { projectId: params.projectId, name: params.name },
        data: { tags: { set: tags } },
      });
      await auditLog(
        {
          ...params.actor,
          resourceType: "skill",
          action: "setTag",
          resourceId: params.name,
          projectId: params.projectId,
          after: tags,
        },
        tx,
      );
      return target.id;
    });
    return this.getById({ projectId: params.projectId, skillId });
  }

  async deleteVersion(params: {
    projectId: string;
    name: string;
    version: number;
    actor: SkillActor;
  }): Promise<void> {
    const existing = await this.get({
      projectId: params.projectId,
      name: params.name,
      selector: { version: params.version },
    });
    await this.requireProtectedLabelAccess({
      projectId: params.projectId,
      labels: existing.labels,
      actor: params.actor,
    });
    await this.prisma.$transaction(async (tx) => {
      await this.lockSkill(tx, params.projectId, params.name);
      const target = await tx.skill.findFirst({
        where: {
          projectId: params.projectId,
          name: params.name,
          version: params.version,
        },
        include: { files: { include: { blob: true } } },
      });
      if (!target) throw new LangfuseNotFoundError("Skill version not found");
      await auditLog(
        {
          ...params.actor,
          resourceType: "skill",
          action: "delete",
          resourceId: target.id,
          projectId: params.projectId,
          before: serializeVersion(target),
        },
        tx,
      );
      await tx.skill.delete({
        where: { projectId_id: { projectId: params.projectId, id: target.id } },
      });
      if (target.labels.includes(SKILL_LATEST_LABEL)) {
        const latest = await tx.skill.findFirst({
          where: { projectId: params.projectId, name: params.name },
          orderBy: { version: "desc" },
          select: { id: true, labels: true },
        });
        if (latest) {
          const labels = [...new Set([...latest.labels, SKILL_LATEST_LABEL])];
          await tx.skill.update({
            where: {
              projectId_id: { projectId: params.projectId, id: latest.id },
            },
            data: { labels: { set: labels } },
          });
          await auditLog(
            {
              ...params.actor,
              resourceType: "skill",
              action: "setLabel",
              resourceId: latest.id,
              projectId: params.projectId,
              before: latest.labels,
              after: labels,
            },
            tx,
          );
        }
      }
    });
  }

  private async requireProtectedLabelAccess(params: {
    projectId: string;
    labels: string[];
    actor: SkillActor;
  }) {
    const labelsToCheck = params.labels.filter(
      (label) => label !== SKILL_LATEST_LABEL,
    );
    if ("session" in params.actor) {
      const { hasProtectedLabels, protectedLabels } =
        await checkHasProtectedLabels({
          prisma: this.prisma,
          projectId: params.projectId,
          labelsToCheck,
        });
      if (hasProtectedLabels) {
        throwIfNoProjectAccess({
          session: params.actor.session,
          projectId: params.projectId,
          scope: "promptProtectedLabels:CUD",
          forbiddenErrorMessage: `You do not have permission to mutate protected skill labels: ${protectedLabels.join(", ")}`,
        });
      }
      return;
    }

    await authorizeProtectedLabelMutation({
      prisma: this.prisma,
      context: { ...params.actor, projectId: params.projectId },
      ctx: params.actor.ctx,
      labelsToCheck,
      forbiddenErrorMessage:
        "You do not have permission to mutate protected skill labels.",
    });
  }

  private lockSkill(
    tx: Prisma.TransactionClient,
    projectId: string,
    name: string,
  ) {
    // Serialize metadata and version changes to preserve latest and shared tags.
    const key = JSON.stringify(["skills", projectId, name]);
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  private async getById(params: { projectId: string; skillId: string }) {
    const skill = await this.prisma.skill.findUnique({
      where: {
        projectId_id: { projectId: params.projectId, id: params.skillId },
      },
      include: { files: { include: { blob: true } } },
    });
    if (!skill) throw new LangfuseNotFoundError("Skill version not found");
    return serializeVersion(skill);
  }

  private async findSkillVersion(params: {
    projectId: string;
    name: string;
    selector: SkillSelector;
  }): Promise<SkillWithRelations> {
    const selectorWhere: Prisma.SkillWhereInput = params.selector.version
      ? { version: params.selector.version }
      : { labels: { has: params.selector.label ?? SKILL_PRODUCTION_LABEL } };

    const skill = await this.prisma.skill.findFirst({
      where: {
        projectId: params.projectId,
        name: params.name,
        ...selectorWhere,
      },
      orderBy: { version: "desc" },
      include: { files: { include: { blob: true } } },
    });
    if (!skill) throw new LangfuseNotFoundError("Skill version not found");
    return skill;
  }

  private async getAndVerifyBlobs(params: {
    projectId: string;
    blobIds: string[];
  }): Promise<SkillBlob[]> {
    if (new Set(params.blobIds).size > MAX_SKILL_FILES) {
      throw new InvalidRequestError("Too many skill blobs");
    }
    const blobs = await this.prisma.skillBlob.findMany({
      where: { projectId: params.projectId, id: { in: params.blobIds } },
    });
    if (blobs.length !== new Set(params.blobIds).size) {
      throw new LangfuseNotFoundError("One or more skill blobs were not found");
    }
    for (const blob of blobs) {
      let contentLength: number;
      try {
        contentLength = await this.storage.getObjectSize(blob.bucketPath);
      } catch {
        throw new InvalidRequestError(
          `Skill blob ${blob.id} has not been uploaded`,
        );
      }
      if (contentLength !== Number(blob.contentLength)) {
        throw new LangfuseConflictError(
          `Skill blob ${blob.id} does not match its declared length`,
        );
      }
      if (blob.uploadedAt === null) {
        await this.prisma.skillBlob.updateMany({
          where: {
            projectId: params.projectId,
            id: blob.id,
            uploadedAt: null,
          },
          data: { uploadedAt: new Date() },
        });
      }
    }

    return blobs;
  }

  private async downloadAndParseSkillFrontmatter(blob: SkillBlob) {
    let bytes: Uint8Array;
    try {
      bytes = await this.storage.downloadBytes(blob.bucketPath);
    } catch {
      throw new InvalidRequestError(
        `Skill blob ${blob.id} has not been uploaded`,
      );
    }
    return parseSkillFrontmatter(bytes);
  }
}
