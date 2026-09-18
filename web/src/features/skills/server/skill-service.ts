import { createHash, randomUUID } from "node:crypto";
import { parseDocument } from "yaml";
import type { Session } from "next-auth";
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
  SkillNameSchema,
  SkillVersionSchema,
  SkillVersionWithDownloadsSchema,
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
import { auditLog } from "@/src/features/audit-logs/server";

const MAX_SKILL_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SKILL_TOTAL_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

export type SkillAuditActor =
  | { session: Session & { user: NonNullable<Session["user"]> } }
  | { apiKeyId: string; orgId: string; projectId: string };

type SkillWithRelations = Prisma.SkillGetPayload<{
  include: {
    files: { include: { blob: true } };
  };
}>;

type VerifiedSkillBlob = { blob: SkillBlob; bytes: Uint8Array };

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
  prefix: string;
}): string {
  const encodedHash = Buffer.from(params.sha256Hash, "base64").toString(
    "base64url",
  );
  return [
    params.prefix.replace(/^\/+|\/+$/g, ""),
    "skills",
    params.projectId,
    encodedHash,
  ]
    .filter(Boolean)
    .join("/");
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

function serializeVersion(skill: SkillWithRelations, latestVersion: number) {
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
    labels: [
      ...skill.labels,
      ...(skill.version === latestVersion ? [SKILL_LATEST_LABEL] : []),
    ],
    commitMessage: skill.commitMessage,
    files: skill.files.map((file) => ({
      id: file.id,
      path: file.path,
      executable: file.executable,
      blobId: file.blobId,
      sha256Hash: file.blob.sha256Hash,
      contentType: file.blob.contentType,
      contentLength: Number(file.blob.contentLength),
    })),
  });
}

export class SkillService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly bucketName: string,
    private readonly storagePrefix: string,
  ) {}

  async prepareUploads(params: {
    projectId: string;
    createdBy: string;
    input: PrepareSkillUploadsBody;
  }) {
    const uniqueHashes = new Set<string>();
    let totalBytes = 0;
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
      totalBytes += blob.contentLength;
    }
    if (totalBytes > MAX_SKILL_TOTAL_BYTES) {
      throw new InvalidRequestError(
        `Skill uploads must not exceed ${MAX_SKILL_TOTAL_BYTES} bytes`,
      );
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
              prefix: this.storagePrefix,
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
    auditActor: SkillAuditActor;
  }) {
    const input = CreateSkillVersionBodySchema.parse(params.input);
    const verifiedBlobs = await this.getAndVerifyBlobs({
      projectId: params.projectId,
      blobIds: input.files.map(({ blobId }) => blobId),
    });
    const verifiedBlobById = new Map(
      verifiedBlobs.map((verified) => [verified.blob.id, verified]),
    );
    const skillMd = verifiedBlobById.get(
      input.files.find(({ path }) => path === "SKILL.md")!.blobId,
    )!;
    const frontmatter = parseSkillFrontmatter(skillMd.bytes);
    const name = frontmatter.name;

    const skillId = await this.prisma.$transaction(async (tx) => {
      await this.lockSkill(tx, params.projectId, name);
      const latest = await tx.skill.findFirst({
        where: { projectId: params.projectId, name },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const labels = [...new Set(input.labels)];
      const versionsLosingLabels =
        labels.length === 0
          ? []
          : await tx.skill.findMany({
              where: {
                projectId: params.projectId,
                name,
                labels: { hasSome: labels },
              },
              select: { id: true, labels: true },
            });
      for (const version of versionsLosingLabels) {
        await tx.skill.update({
          where: {
            projectId_id: { projectId: params.projectId, id: version.id },
          },
          data: {
            labels: {
              set: version.labels.filter((label) => !labels.includes(label)),
            },
          },
        });
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
          tags: [...new Set(input.tags ?? [])],
          labels,
          commitMessage: input.commitMessage,
          files: {
            create: input.files.map((file) => ({
              project: { connect: { id: params.projectId } },
              path: file.path,
              executable: file.executable,
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
      await tx.skillBlob.updateMany({
        where: {
          projectId: params.projectId,
          id: { in: [...verifiedBlobById.keys()] },
        },
        data: { uploadedAt: new Date() },
      });
      await this.writeAudit(tx, params.auditActor, {
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
            executable: file.executable,
          })),
        },
      });
      for (const version of versionsLosingLabels) {
        await this.writeAudit(tx, params.auditActor, {
          action: "setLabel",
          resourceId: version.id,
          projectId: params.projectId,
          before: version.labels,
          after: version.labels.filter((label) => !labels.includes(label)),
        });
      }
      return skill.id;
    });

    return this.getById({ projectId: params.projectId, skillId });
  }

  async get(params: {
    projectId: string;
    name: string;
    selector: SkillSelector;
    includeDownloadUrls?: boolean;
  }) {
    const skill = await this.findSkillVersion(params);
    const latestVersion = await this.latestVersion(
      params.projectId,
      skill.name,
    );
    const serialized = serializeVersion(skill, latestVersion);
    if (!params.includeDownloadUrls) return serialized;

    const expiresAt = new Date(
      Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000,
    ).toISOString();
    return SkillVersionWithDownloadsSchema.parse({
      ...serialized,
      files: await Promise.all(
        skill.files.map(async (file) => ({
          id: file.id,
          path: file.path,
          executable: file.executable,
          blobId: file.blobId,
          sha256Hash: file.blob.sha256Hash,
          contentType: file.blob.contentType,
          contentLength: Number(file.blob.contentLength),
          downloadUrl: await this.storage.getSignedUrl(
            file.blob.bucketPath,
            DOWNLOAD_URL_TTL_SECONDS,
            false,
          ),
          downloadUrlExpiresAt: expiresAt,
        })),
      ),
    });
  }

  async getEditor(params: {
    projectId: string;
    name: string;
    selector: SkillSelector;
  }) {
    const skill = await this.findSkillVersion(params);
    const [latestVersion, history] = await Promise.all([
      this.latestVersion(params.projectId, skill.name),
      this.prisma.skill.findMany({
        where: { projectId: params.projectId, name: skill.name },
        orderBy: { version: "desc" },
        select: {
          version: true,
          labels: true,
          commitMessage: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      ...serializeVersion(skill, latestVersion),
      history,
      files: await Promise.all(
        skill.files.map(async (file) => {
          let content: string;
          try {
            content = new TextDecoder("utf-8", { fatal: true }).decode(
              await this.storage.downloadBytes(file.blob.bucketPath),
            );
          } catch {
            throw new InvalidRequestError(
              `Skill file '${file.path}' is not valid UTF-8 and cannot be edited in the UI`,
            );
          }
          return {
            id: file.id,
            path: file.path,
            executable: file.executable,
            contentType: file.blob.contentType,
            content,
          };
        }),
      ),
    };
  }

  async list(params: { projectId: string; input: ListSkillsQuery }) {
    const where: Prisma.SkillWhereInput = {
      projectId: params.projectId,
      ...(params.input.name ? { name: params.input.name } : {}),
      ...(params.input.tag ? { tags: { has: params.input.tag } } : {}),
      ...(params.input.label && params.input.label !== SKILL_LATEST_LABEL
        ? { labels: { has: params.input.label } }
        : {}),
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
                labels: [
                  ...new Set(versions.flatMap(({ labels }) => labels)),
                  SKILL_LATEST_LABEL,
                ],
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
    auditActor: SkillAuditActor;
  }) {
    const input = UpdateSkillLabelsBodySchema.parse({ labels: params.labels });
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
            ? nextLabels
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
        await this.writeAudit(tx, params.auditActor, {
          action: "setLabel",
          resourceId: version.id,
          projectId: params.projectId,
          before: version.labels,
          after: labels,
        });
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
    auditActor: SkillAuditActor;
  }) {
    const input = UpdateSkillTagsBodySchema.parse({ tags: params.tags });
    const skillId = await this.prisma.$transaction(async (tx) => {
      const target = await tx.skill.findFirst({
        where: {
          projectId: params.projectId,
          name: params.name,
          version: params.version,
        },
      });
      if (!target) throw new LangfuseNotFoundError("Skill version not found");

      const tags = [...new Set(input.tags)];
      if (target.tags.join("\0") === tags.join("\0")) return target.id;
      await tx.skill.update({
        where: {
          projectId_id: {
            projectId: params.projectId,
            id: target.id,
          },
        },
        data: { tags: { set: tags } },
      });
      await this.writeAudit(tx, params.auditActor, {
        action: "setTag",
        resourceId: target.id,
        projectId: params.projectId,
        before: target.tags,
        after: tags,
      });
      return target.id;
    });
    return this.getById({ projectId: params.projectId, skillId });
  }

  async deleteVersion(params: {
    projectId: string;
    name: string;
    version: number;
    auditActor: SkillAuditActor;
  }): Promise<void> {
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
      const latest = await tx.skill.findFirstOrThrow({
        where: { projectId: params.projectId, name: params.name },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await this.writeAudit(tx, params.auditActor, {
        action: "delete",
        resourceId: target.id,
        projectId: params.projectId,
        before: serializeVersion(target, latest.version),
      });
      await tx.skill.delete({
        where: { projectId_id: { projectId: params.projectId, id: target.id } },
      });
    });
  }

  async protectedLabels(params: {
    projectId: string;
    labels?: string[];
  }): Promise<string[]> {
    if (params.labels?.length === 0) return [];
    const rows = await this.prisma.skillProtectedLabels.findMany({
      where: {
        projectId: params.projectId,
        ...(params.labels ? { label: { in: params.labels } } : {}),
      },
      select: { label: true },
      orderBy: { label: "asc" },
    });
    return rows.map(({ label }) => label);
  }

  async createProtectedLabel(params: {
    projectId: string;
    label: string;
    auditActor: SkillAuditActor;
  }): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const protectedLabel = await tx.skillProtectedLabels.create({
        data: { projectId: params.projectId, label: params.label },
      });
      await this.writeAudit(tx, params.auditActor, {
        resourceType: "skillProtectedLabel",
        action: "create",
        resourceId: protectedLabel.id,
        projectId: params.projectId,
        after: { label: protectedLabel.label },
      });
      return protectedLabel.label;
    });
  }

  async deleteProtectedLabel(params: {
    projectId: string;
    label: string;
    auditActor: SkillAuditActor;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const protectedLabel = await tx.skillProtectedLabels.findUnique({
        where: {
          projectId_label: {
            projectId: params.projectId,
            label: params.label,
          },
        },
      });
      if (!protectedLabel) {
        throw new LangfuseNotFoundError("Protected skill label not found");
      }
      await this.writeAudit(tx, params.auditActor, {
        resourceType: "skillProtectedLabel",
        action: "delete",
        resourceId: protectedLabel.id,
        projectId: params.projectId,
        before: { label: protectedLabel.label },
      });
      await tx.skillProtectedLabels.delete({
        where: {
          projectId_label: {
            projectId: params.projectId,
            label: params.label,
          },
        },
      });
    });
  }

  private async getById(params: { projectId: string; skillId: string }) {
    const skill = await this.prisma.skill.findUnique({
      where: {
        projectId_id: { projectId: params.projectId, id: params.skillId },
      },
      include: { files: { include: { blob: true } } },
    });
    if (!skill) throw new LangfuseNotFoundError("Skill version not found");
    return serializeVersion(
      skill,
      await this.latestVersion(params.projectId, skill.name),
    );
  }

  private async findSkillVersion(params: {
    projectId: string;
    name: string;
    selector: SkillSelector;
  }): Promise<SkillWithRelations> {
    let selectorWhere: Prisma.SkillWhereInput = {};
    if (params.selector.version) {
      selectorWhere = { version: params.selector.version };
    } else if (params.selector.label !== SKILL_LATEST_LABEL) {
      selectorWhere = {
        labels: { has: params.selector.label ?? SKILL_PRODUCTION_LABEL },
      };
    }

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

  private async latestVersion(projectId: string, name: string) {
    return (
      await this.prisma.skill.findFirstOrThrow({
        where: { projectId, name },
        orderBy: { version: "desc" },
        select: { version: true },
      })
    ).version;
  }

  private async getAndVerifyBlobs(params: {
    projectId: string;
    blobIds: string[];
  }): Promise<VerifiedSkillBlob[]> {
    if (new Set(params.blobIds).size > MAX_SKILL_FILES) {
      throw new InvalidRequestError("Too many skill blobs");
    }
    const blobs = await this.prisma.skillBlob.findMany({
      where: { projectId: params.projectId, id: { in: params.blobIds } },
    });
    if (blobs.length !== new Set(params.blobIds).size) {
      throw new LangfuseNotFoundError("One or more skill blobs were not found");
    }
    let totalBytes = 0;
    const verified: VerifiedSkillBlob[] = [];
    for (const blob of blobs) {
      if (blob.bucketName !== this.bucketName) {
        throw new LangfuseConflictError(
          "Skill blob storage configuration changed",
        );
      }
      let bytes: Uint8Array;
      try {
        bytes = await this.storage.downloadBytes(blob.bucketPath);
      } catch {
        throw new InvalidRequestError(
          `Skill blob ${blob.id} has not been uploaded`,
        );
      }
      const digest = createHash("sha256").update(bytes).digest("base64");
      if (
        digest !== blob.sha256Hash ||
        bytes.byteLength !== Number(blob.contentLength)
      ) {
        throw new LangfuseConflictError(
          `Skill blob ${blob.id} does not match its declared checksum and length`,
        );
      }
      totalBytes += bytes.byteLength;
      verified.push({ blob, bytes });
    }
    if (totalBytes > MAX_SKILL_TOTAL_BYTES) {
      throw new InvalidRequestError(
        "Skill bundle exceeds the total size limit",
      );
    }
    return verified;
  }

  private async lockSkill(
    tx: Prisma.TransactionClient,
    projectId: string,
    name: string,
  ): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${projectId}:${name}`}, 0))`,
    );
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actor: SkillAuditActor,
    data: {
      resourceType?: "skill" | "skillProtectedLabel";
      action: string;
      resourceId: string;
      projectId: string;
      before?: unknown;
      after?: unknown;
    },
  ): Promise<void> {
    const { resourceType = "skill", ...auditData } = data;
    if ("session" in actor) {
      await auditLog(
        {
          session: actor.session as Parameters<typeof auditLog>[0] extends {
            session: infer T;
          }
            ? T
            : never,
          resourceType,
          ...auditData,
        },
        tx,
      );
      return;
    }
    await auditLog({ ...actor, resourceType, ...auditData }, tx);
  }
}
