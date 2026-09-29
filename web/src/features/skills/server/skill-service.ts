import { createHash, randomUUID } from "node:crypto";
import { parseDocument } from "yaml";
import {
  CreateSkillVersionBodySchema,
  InvalidRequestError,
  LangfuseNotFoundError,
  ListSkillsResponseSchema,
  MAX_SKILL_BYTES,
  SKILL_LATEST_LABEL,
  SKILL_PRODUCTION_LABEL,
  SkillDescriptionSchema,
  SkillNameSchema,
  SkillVersionSchema,
  UpdateSkillLabelsBodySchema,
  UpdateSkillTagsBodySchema,
  type CreateSkillVersionBody,
  type ListSkillsQuery,
  type FilterState,
  type SkillSelector,
} from "@langfuse/shared";
import type { Prisma, PrismaClient, SkillBlob } from "@langfuse/shared/src/db";
import type { ProjectAuthedContext } from "@/src/server/api/trpc";
import type { AuthorizationContext } from "@/src/features/auth/policy/types";
import { auditLog } from "@/src/features/audit-logs/server";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import { checkHasProtectedLabels } from "@/src/features/prompts/server/utils/checkHasProtectedLabels";
import {
  authorizeProtectedLabelMutation,
  type ApiKeyProjectContext,
} from "@/src/features/prompts/server/utils/authorizeProtectedLabelMutation";

type SkillActor =
  | Pick<ProjectAuthedContext, "session">
  | (ApiKeyProjectContext & { ctx?: AuthorizationContext });

const skillFilesInclude = {
  files: {
    include: {
      blob: {
        select: { sha256Hash: true, contentType: true, contentLength: true },
      },
    },
  },
} satisfies Prisma.SkillInclude;

type SkillWithRelations = Prisma.SkillGetPayload<{
  include: typeof skillFilesInclude;
}>;

type HashedSkillFile = {
  path: string;
  sha256Hash: string;
} & ({ content: string } | { content?: never });

type ReferencedSkillBlob = Pick<
  SkillBlob,
  "id" | "sha256Hash" | "contentLength"
>;

function parseSkillFrontmatter(text: string): {
  name: string;
  description: string;
  frontmatter: Prisma.InputJsonObject;
} {
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
    value = document.toJS({ maxAliasCount: 0 });
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
  constructor(private readonly prisma: PrismaClient) {}

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
        createdBy: true,
      },
    });
    const hasMore = versions.length > params.limit;
    const items = versions.slice(0, params.limit);
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.version : undefined,
    };
  }

  async createVersion(params: {
    projectId: string;
    createdBy: string;
    input: CreateSkillVersionBody;
    actor: SkillActor;
  }) {
    const input = CreateSkillVersionBodySchema.parse(params.input);
    const { files, referencedBlobs } = await this.prepareVersionFiles({
      projectId: params.projectId,
      files: input.files,
    });
    const frontmatter = await this.loadVersionFrontmatter({
      projectId: params.projectId,
      files,
      referencedBlobs,
    });
    const name = frontmatter.name;

    const skillId = await this.prisma.$transaction(async (tx) => {
      await this.lockSkill(tx, params.projectId, name);
      const latest = await tx.skill.findFirst({
        where: { projectId: params.projectId, name },
        orderBy: { version: "desc" },
        select: { id: true, version: true, labels: true, tags: true },
      });
      if (latest) {
        await this.removeLatestLabel({
          tx,
          projectId: params.projectId,
          latest,
          actor: params.actor,
        });
      }
      const versionFiles = await this.storeVersionFiles({
        tx,
        projectId: params.projectId,
        files,
        referencedBlobs,
      });
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
            create: versionFiles.map((file) => ({
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
            files: versionFiles.map((file) => ({
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

  async loadResource(params: {
    projectId: string;
    name: string;
    selector: SkillSelector;
    path: string;
  }): Promise<string> {
    const skill = await this.findSkillVersion(params);
    const file = skill.files.find(({ path }) => path === params.path);
    if (!file) throw new LangfuseNotFoundError("Skill resource not found");
    return (
      await this.getFileContent({
        projectId: params.projectId,
        fileId: file.id,
      })
    ).content;
  }

  async getFileContent(params: { projectId: string; fileId: string }) {
    const file = await this.prisma.skillFile.findFirst({
      where: { projectId: params.projectId, id: params.fileId },
      select: { blob: { select: { content: true } } },
    });
    if (!file) throw new LangfuseNotFoundError("Skill file not found");
    return { content: file.blob.content };
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
    version?: number;
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
        orderBy: { version: "desc" },
      });
      if (!target) throw new LangfuseNotFoundError("Skill not found");

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
        include: skillFilesInclude,
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

  private async prepareVersionFiles(params: {
    projectId: string;
    files: CreateSkillVersionBody["files"];
  }): Promise<{
    files: HashedSkillFile[];
    referencedBlobs: Map<string, ReferencedSkillBlob>;
  }> {
    const files = params.files.map((file) => ({
      ...file,
      sha256Hash:
        file.content !== undefined
          ? createHash("sha256").update(file.content, "utf8").digest("base64")
          : file.sha256Hash,
    }));
    const referencedHashes = [
      ...new Set(
        params.files.flatMap((file) =>
          file.sha256Hash !== undefined ? [file.sha256Hash] : [],
        ),
      ),
    ];
    const referencedBlobs = referencedHashes.length
      ? await this.prisma.skillBlob.findMany({
          where: {
            projectId: params.projectId,
            sha256Hash: { in: referencedHashes },
          },
          select: { id: true, sha256Hash: true, contentLength: true },
        })
      : [];
    const referencedBlobByHash = new Map(
      referencedBlobs.map((blob) => [blob.sha256Hash, blob]),
    );
    if (referencedHashes.some((hash) => !referencedBlobByHash.has(hash))) {
      throw new LangfuseNotFoundError(
        "One or more referenced skill blobs were not found",
      );
    }
    const totalBytes = files.reduce(
      (total, file) =>
        total +
        (file.content !== undefined
          ? Buffer.byteLength(file.content, "utf8")
          : referencedBlobByHash.get(file.sha256Hash)!.contentLength),
      0,
    );
    if (totalBytes > MAX_SKILL_BYTES) {
      throw new InvalidRequestError(
        `A skill must not exceed ${MAX_SKILL_BYTES} bytes in total`,
      );
    }
    return { files, referencedBlobs: referencedBlobByHash };
  }

  private async loadVersionFrontmatter(params: {
    projectId: string;
    files: HashedSkillFile[];
    referencedBlobs: Map<string, ReferencedSkillBlob>;
  }): Promise<ReturnType<typeof parseSkillFrontmatter>> {
    const skillMd = params.files.find(({ path }) => path === "SKILL.md")!;
    let skillMdContent = skillMd.content;
    if (skillMdContent === undefined) {
      const blob = await this.prisma.skillBlob.findFirst({
        where: {
          projectId: params.projectId,
          id: params.referencedBlobs.get(skillMd.sha256Hash)!.id,
        },
        select: { content: true },
      });
      if (!blob)
        throw new LangfuseNotFoundError("Skill instructions were not found");
      skillMdContent = blob.content;
    }
    return parseSkillFrontmatter(skillMdContent);
  }

  private async removeLatestLabel(params: {
    tx: Prisma.TransactionClient;
    projectId: string;
    latest: { id: string; labels: string[] };
    actor: SkillActor;
  }): Promise<void> {
    const labels = params.latest.labels.filter(
      (label) => label !== SKILL_LATEST_LABEL,
    );
    await params.tx.skill.update({
      where: {
        projectId: params.projectId,
        id: params.latest.id,
      },
      data: { labels: { set: labels } },
    });
    await auditLog(
      {
        ...params.actor,
        resourceType: "skill",
        action: "setLabel",
        resourceId: params.latest.id,
        projectId: params.projectId,
        before: params.latest.labels,
        after: labels,
      },
      params.tx,
    );
  }

  private async storeVersionFiles(params: {
    tx: Prisma.TransactionClient;
    projectId: string;
    files: HashedSkillFile[];
    referencedBlobs: Map<string, ReferencedSkillBlob>;
  }): Promise<{ path: string; blobId: string }[]> {
    const uniqueFiles = [
      ...new Map(
        params.files
          .filter((file) => file.content !== undefined)
          .map((file) => [file.sha256Hash, file]),
      ).values(),
    ].sort((a, b) => a.sha256Hash.localeCompare(b.sha256Hash));
    if (uniqueFiles.length) {
      await params.tx.skillBlob.createMany({
        data: uniqueFiles.map((file) => ({
          id: randomUUID(),
          projectId: params.projectId,
          sha256Hash: file.sha256Hash,
          content: file.content,
          contentType: "text/plain",
          contentLength: Buffer.byteLength(file.content, "utf8"),
        })),
        skipDuplicates: true,
      });
    }
    const blobs = uniqueFiles.length
      ? await params.tx.skillBlob.findMany({
          where: {
            projectId: params.projectId,
            sha256Hash: { in: uniqueFiles.map((file) => file.sha256Hash) },
          },
          select: { id: true, sha256Hash: true },
        })
      : [];
    const blobIds = new Map(
      [...params.referencedBlobs.values(), ...blobs].map((blob) => [
        blob.sha256Hash,
        blob.id,
      ]),
    );
    return params.files.map((file) => ({
      path: file.path,
      blobId: blobIds.get(file.sha256Hash)!,
    }));
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
      include: skillFilesInclude,
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
      include: skillFilesInclude,
    });
    if (!skill) throw new LangfuseNotFoundError("Skill version not found");
    return skill;
  }
}
