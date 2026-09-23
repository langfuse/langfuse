import { randomUUID } from "node:crypto";
import { parseDocument } from "yaml";
import {
  CreateSkillVersionBodySchema,
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  ListSkillsResponseSchema,
  MAX_SKILL_FILES,
  MAX_SKILL_FILE_BYTES,
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
  type FilterState,
  type PrepareSkillUploadsBody,
  type SkillSelector,
  DOWNLOAD_URL_TTL_SECONDS,
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
      contentLength: file.blob.contentLength,
    })),
  });
}

export class SkillService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService = getSkillStorageClient(),
  ) {}

  async skillVersions(params: {
    projectId: string;
    name: string;
    limit: number;
    cursor?: number | null;
  }) {
    const versions = await this.prisma.skill.findMany({
      where: {
        projectId: params.projectId,
        name: params.name,
        ...(params.cursor != null ? { version: { lt: params.cursor } } : {}),
      },
      orderBy: { version: "desc" },
      take: params.limit + 1,
      select: {
        version: true,
        labels: true,
        commitMessage: true,
        createdAt: true,
      },
    });
    const hasMore = versions.length > params.limit;
    const items = versions.slice(0, params.limit);
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.version : undefined,
    };
  }

  async prepareUploads(params: {
    projectId: string;
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
            sha256Hash: descriptor.sha256Hash,
            contentType: descriptor.contentType,
            contentLength: descriptor.contentLength,
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
        blob.contentLength !== descriptor.contentLength ||
        blob.contentType !== descriptor.contentType
      ) {
        throw new LangfuseConflictError(
          "A blob with this hash already exists with different metadata",
        );
      }

      const uploadUrl = blob.verifiedAt
        ? null
        : await this.storage.getSignedUploadUrl({
            path: blob.bucketPath,
            ttlSeconds: 60 * 60,
            sha256Hash: blob.sha256Hash,
            contentType: blob.contentType,
            contentLength: blob.contentLength,
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
    const verifiedBlobs = await this.verifyBlobs({
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
            projectId: params.projectId,
            id: latest.id,
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
                  projectId: params.projectId,
                  id: file.blobId,
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

  async load(params: {
    projectId: string;
    name: string;
    selector: SkillSelector;
  }): Promise<string> {
    const skill = await this.findSkillVersion(params);
    const file = skill.files.find(({ path }) => path === "SKILL.md");
    if (!file) throw new LangfuseNotFoundError("SKILL.md not found");

    const bytes = await this.storage.downloadBytes(file.blob.bucketPath);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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

  async list(params: {
    projectId: string;
    input: ListSkillsQuery & { filter?: FilterState };
  }) {
    const filters = this.listFilterConditions(params.input.filter ?? []);
    const where: Prisma.SkillWhereInput = {
      projectId: params.projectId,
      labels: { has: SKILL_LATEST_LABEL },
      ...(filters.length ? { AND: filters } : {}),
      ...(params.input.search
        ? {
            OR: [
              {
                name: {
                  contains: params.input.search,
                  mode: "insensitive" as const,
                },
              },
              {
                description: {
                  contains: params.input.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
      ...(params.input.name ? { name: params.input.name } : {}),
      ...(params.input.tag ? { tags: { has: params.input.tag } } : {}),
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
    const [latestVersions, totalItems] = await Promise.all([
      this.prisma.skill.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        skip: (params.input.page - 1) * params.input.limit,
        take: params.input.limit,
        select: {
          name: true,
          description: true,
          tags: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.skill.count({ where }),
    ]);
    const productionVersions = latestVersions.length
      ? await this.prisma.skill.findMany({
          where: {
            projectId: params.projectId,
            name: { in: latestVersions.map(({ name }) => name) },
            labels: { has: SKILL_PRODUCTION_LABEL },
          },
          select: { name: true, version: true },
        })
      : [];
    const productionVersionByName = new Map(
      productionVersions.map(({ name, version }) => [name, version]),
    );
    const totalPages = Math.ceil(totalItems / params.input.limit);

    return ListSkillsResponseSchema.parse({
      data: latestVersions.map((skill) => ({
        name: skill.name,
        description: skill.description,
        tags: skill.tags,
        latestVersion: skill.version,
        latestVersionCreatedAt: skill.createdAt,
        latestVersionLastUpdatedAt: skill.updatedAt,
        productionVersion: productionVersionByName.get(skill.name) ?? null,
      })),
      meta: {
        page: params.input.page,
        limit: params.input.limit,
        totalItems,
        totalPages,
        hasNextPage: params.input.page < totalPages,
      },
    });
  }

  private listFilterConditions(filters: FilterState): Prisma.SkillWhereInput[] {
    return filters.map((filter) => {
      if (filter.type !== "arrayOptions" || filter.column !== "tags") {
        throw new InvalidRequestError(
          `Unsupported skill filter: ${filter.column} (${filter.type})`,
        );
      }
      if (!filter.value.length) return {};
      switch (filter.operator) {
        case "any of":
          return { tags: { hasSome: filter.value } };
        case "all of":
          return { tags: { hasEvery: filter.value } };
        case "none of":
          return { NOT: { tags: { hasSome: filter.value } } };
      }
    });
  }

  async filterOptions(params: { projectId: string }) {
    const skills = await this.prisma.skill.findMany({
      where: {
        projectId: params.projectId,
        labels: { has: SKILL_LATEST_LABEL },
      },
      select: { tags: true },
    });
    const counts = new Map<string, number>();
    for (const skill of skills) {
      for (const tag of new Set(skill.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return {
      tags: [...counts]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    };
  }

  async setLabels(params: {
    projectId: string;
    name: string;
    version: number;
    labels: string[];
    actor: SkillActor;
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

      const changedLabels = [
        ...target.labels.filter((label) => !input.labels.includes(label)),
        ...input.labels.filter((label) => !target.labels.includes(label)),
      ];
      await this.requireProtectedLabelAccess({
        prisma: tx,
        projectId: params.projectId,
        labels: changedLabels,
        actor: params.actor,
      });

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
            projectId: params.projectId,
            id: version.id,
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

  async deleteSkill(params: {
    projectId: string;
    name: string;
    actor: SkillActor;
  }): Promise<void> {
    const where = { projectId: params.projectId, name: params.name };
    await this.prisma.$transaction(async (tx) => {
      await this.lockSkill(tx, params.projectId, params.name);
      const versions = await tx.skill.findMany({
        where,
        select: { version: true, labels: true, tags: true },
        orderBy: { version: "asc" },
      });
      if (!versions.length) throw new LangfuseNotFoundError("Skill not found");
      await this.requireProtectedLabelAccess({
        prisma: tx,
        projectId: params.projectId,
        labels: [...new Set(versions.flatMap(({ labels }) => labels))],
        actor: params.actor,
      });
      await auditLog(
        {
          ...params.actor,
          resourceType: "skill",
          action: "delete",
          resourceId: params.name,
          projectId: params.projectId,
          before: {
            name: params.name,
            versions: versions.map(({ version }) => version),
            labels: [...new Set(versions.flatMap(({ labels }) => labels))],
            tags: versions.at(-1)?.tags,
          },
        },
        tx,
      );
      await tx.skill.deleteMany({ where });
    });
  }

  async deleteVersion(params: {
    projectId: string;
    name: string;
    version: number;
    actor: SkillActor;
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
      await this.requireProtectedLabelAccess({
        prisma: tx,
        projectId: params.projectId,
        labels: target.labels,
        actor: params.actor,
      });
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
        where: { projectId: params.projectId, id: target.id },
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
              projectId: params.projectId,
              id: latest.id,
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
    prisma: Prisma.TransactionClient;
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
          prisma: params.prisma,
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
      prisma: params.prisma,
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
        projectId: params.projectId,
        id: params.skillId,
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

  private async verifyBlobs(params: {
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
      if (contentLength !== blob.contentLength) {
        throw new LangfuseConflictError(
          `Skill blob ${blob.id} does not match its declared length`,
        );
      }
      if (blob.verifiedAt === null) {
        await this.prisma.skillBlob.updateMany({
          where: {
            projectId: params.projectId,
            id: blob.id,
            verifiedAt: null,
          },
          data: { verifiedAt: new Date() },
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
