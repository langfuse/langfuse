import { z } from "zod";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Skill, Prisma } from "@langfuse/shared/src/db";
import {
  createSkill,
  duplicateSkill,
  duplicateFolder,
} from "../actions/createSkill";
import { checkHasProtectedLabels } from "../utils/checkHasProtectedLabels";
import {
  CreateSkillTRPCSchema,
  LATEST_SKILL_LABEL,
  optionalPaginationZod,
  paginationZod,
  SkillLabelSchema,
  skillsTableColsWithOptions,
  StringNoHTMLNonEmpty,
  TracingSearchType,
} from "@langfuse/shared";
import { orderBy, singleFilter } from "@langfuse/shared";
import {
  orderByToPrismaSql,
  SkillService,
  redis,
  logger,
  escapeSqlLikePattern,
  tableColumnsToSqlFilterAndPrefix,
  postgresSearchCondition,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

const buildPathPrefixFilter = (pathPrefix?: string): Prisma.Sql => {
  if (!pathPrefix) {
    return Prisma.empty;
  }

  const escapedPathPrefix = escapeSqlLikePattern(pathPrefix);
  return Prisma.sql` AND (s.name LIKE ${`${escapedPathPrefix}/%`} ESCAPE '\\' OR s.name = ${pathPrefix})`;
};

const SkillFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  orderBy: orderBy,
  ...paginationZod,
  pathPrefix: z.string().optional(),
  searchQuery: z.string().optional(),
  searchType: z.array(TracingSearchType).optional(),
});

export const skillRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });

      const skill = await ctx.prisma.skill.findFirst({
        where: {
          projectId: input.projectId,
        },
        select: { id: true },
        take: 1,
      });

      return skill !== null;
    }),
  all: protectedProjectProcedure
    .input(SkillFilterOptions)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });

      const orderByCondition = orderByToPrismaSql(
        input.orderBy,
        skillsTableColsWithOptions(),
      );

      // "skills" is not a TableNames value; the SQL alias comes from the
      // skillsTableCols internals (s."..."). The table arg only drives
      // observation-specific casts, so "prompts" is a neutral choice here.
      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter ?? [],
        skillsTableColsWithOptions(),
        "prompts",
      );

      // pathFilter: SQL WHERE clause to filter skills by folder (e.g., "AND s.name LIKE 'folder/%'")
      const pathFilter = buildPathPrefixFilter(input.pathPrefix);

      const additionalConditions = input.searchType?.includes("id")
        ? [
            Prisma.sql`EXISTS (SELECT 1 FROM UNNEST(s.tags) AS tag WHERE tag ILIKE ${`%${input.searchQuery}%`})`,
          ]
        : [];

      const searchCondition = postgresSearchCondition({
        searchQuery: input.searchQuery,
        searchType: input.searchType,
        tablePrefix: "s",
        metadataColumns: ["name"],
        contentColumns: {
          content: ["instructions"],
        },
        additionalConditions,
      });

      const [skills, skillCount] = await Promise.all([
        // skills
        ctx.prisma.$queryRaw<Array<Skill & { row_type: "folder" | "skill" }>>(
          generateSkillQuery(
            Prisma.sql`
          s.id,
          s.name,
          s.version,
          s.project_id as "projectId",
          s.description,
          s.instructions,
          s.metadata,
          s.allowed_tools as "allowedTools",
          s.updated_at as "updatedAt",
          s.created_at as "createdAt",
          s.labels,
          s.tags,
          s.commit_message as "commitMessage",
          s.row_type`,
            input.projectId,
            filterCondition,
            orderByCondition,
            input.limit,
            input.page,
            pathFilter, // SQL WHERE clause: filters DB to only skills in current folder, derived from prefix.
            searchCondition,
            input.pathPrefix, // Raw folder path: used for segment splitting & folder detection logic
          ),
        ),
        // skillCount
        ctx.prisma.$queryRaw<Array<{ totalCount: bigint }>>(
          generateSkillQuery(
            Prisma.sql`count(*) AS "totalCount"`,
            input.projectId,
            filterCondition,
            Prisma.empty,
            1, // limit
            0, // input.page,
            pathFilter,
            searchCondition,
            input.pathPrefix,
          ),
        ),
      ]);

      return {
        skills: skills,
        totalCount:
          skillCount.length > 0 ? Number(skillCount[0]?.totalCount) : 0,
      };
    }),
  count: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        searchQuery: z.string().optional(),
        searchType: z.array(TracingSearchType).optional(),
        pathPrefix: z.string().optional(),
        filter: z.array(singleFilter).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });

      const filterCondition =
        input.filter && input.filter.length > 0
          ? tableColumnsToSqlFilterAndPrefix(
              input.filter,
              skillsTableColsWithOptions(),
              "prompts",
            )
          : Prisma.empty;

      const pathFilter = buildPathPrefixFilter(input.pathPrefix);

      const additionalConditions = input.searchType?.includes("id")
        ? [
            Prisma.sql`EXISTS (SELECT 1 FROM UNNEST(s.tags) AS tag WHERE tag ILIKE ${`%${input.searchQuery}%`})`,
          ]
        : [];

      const searchCondition = postgresSearchCondition({
        searchQuery: input.searchQuery,
        searchType: input.searchType,
        tablePrefix: "s",
        metadataColumns: ["name"],
        contentColumns: {
          content: ["instructions"],
        },
        additionalConditions,
      });

      const count = await ctx.prisma.$queryRaw<Array<{ totalCount: bigint }>>(
        generateSkillQuery(
          Prisma.sql` count(*) AS "totalCount"`,
          input.projectId,
          filterCondition,
          Prisma.empty,
          1, // limit
          0, // page
          pathFilter,
          searchCondition,
          input.pathPrefix,
        ),
      );

      return {
        totalCount: count[0].totalCount,
      };
    }),
  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      return ctx.prisma.skill.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });
    }),
  create: protectedProjectProcedure
    .input(CreateSkillTRPCSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });

      const { hasProtectedLabels, protectedLabels } =
        await checkHasProtectedLabels({
          prisma: ctx.prisma,
          projectId: input.projectId,
          labelsToCheck: input.labels,
        });

      if (hasProtectedLabels) {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "skillProtectedLabels:CUD",
          forbiddenErrorMessage: `You don't have permission to create a skill with a protected label. Please contact your project admin for assistance.\n\n Protected labels are: ${protectedLabels.join(", ")}`,
        });
      }

      const skill = await createSkill({
        ...input,
        prisma: ctx.prisma,
        createdBy: ctx.session.user.id,
      });

      if (!skill) {
        throw new Error("Failed to create skill");
      }

      await auditLog(
        {
          session: ctx.session,
          resourceType: "skill",
          resourceId: skill.id,
          action: "create",
          after: skill,
        },
        ctx.prisma,
      );

      return skill;
    }),
  duplicateSkill: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        skillId: z.string(),
        name: StringNoHTMLNonEmpty,
        isSingleVersion: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });

      const skill = await duplicateSkill({
        projectId: input.projectId,
        skillId: input.skillId,
        name: input.name,
        isSingleVersion: input.isSingleVersion,
        createdBy: ctx.session.user.id,
        prisma: ctx.prisma,
      });

      if (!skill) {
        throw new Error(`Failed to duplicate skill: ${input.skillId}`);
      }

      await auditLog(
        {
          session: ctx.session,
          resourceType: "skill",
          resourceId: skill.id,
          action: "create",
          after: skill,
        },
        ctx.prisma,
      );

      return skill;
    }),
  duplicateFolder: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sourcePath: StringNoHTMLNonEmpty,
        targetPath: StringNoHTMLNonEmpty,
        isSingleVersion: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:CUD",
      });

      const result = await duplicateFolder({
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetPath: input.targetPath,
        isSingleVersion: input.isSingleVersion,
        createdBy: ctx.session.user.id,
        prisma: ctx.prisma,
      });

      await auditLog(
        {
          session: ctx.session,
          resourceType: "skill",
          resourceId: input.targetPath,
          action: "create",
          after: result,
        },
        ctx.prisma,
      );

      return result;
    }),
  filterOptions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });

      const [names, tags, labels] = await Promise.all([
        ctx.prisma.skill.groupBy({
          where: {
            projectId: input.projectId,
          },
          by: ["name"],
          // limiting to 1k skill names to avoid performance issues.
          take: 1000,
          orderBy: {
            name: "asc",
          },
        }),
        ctx.prisma.$queryRaw<{ value: string }[]>`
          SELECT tags.tag as value
          FROM skills, UNNEST(skills.tags) AS tags(tag)
          WHERE skills.project_id = ${input.projectId}
          GROUP BY tags.tag
          ORDER BY tags.tag ASC;
        `,
        ctx.prisma.$queryRaw<{ value: string }[]>`
          SELECT labels.label as value
          FROM skills, UNNEST(skills.labels) AS labels(label)
          WHERE skills.project_id = ${input.projectId}
          GROUP BY labels.label
          ORDER BY labels.label ASC;
        `,
      ]);

      const res = {
        name: names
          .filter((n) => n.name !== null)
          .map((name) => ({
            value: name.name ?? "undefined",
          })),
        labels: labels,
        tags: tags,
      };
      return res;
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        skillName: z.string().optional(),
        pathPrefix: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { projectId, skillName, pathPrefix } = input;
        if (!skillName && !pathPrefix) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Either skillName or pathPrefix must be provided",
          });
        }

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId,
          scope: "skills:CUD",
        });

        // Prisma translates `startsWith` to SQL LIKE on PostgreSQL, so `%` and `_`
        // must be escaped when the prefix should be interpreted literally.
        const escapedPathPrefix = pathPrefix
          ? escapeSqlLikePattern(pathPrefix)
          : undefined;

        // fetch skills before deletion to enable audit logging
        const skills = await ctx.prisma.skill.findMany({
          where: {
            projectId,
            name: skillName
              ? skillName
              : {
                  startsWith: `${escapedPathPrefix}/`,
                },
          },
        });

        // Check if any skill has a protected label
        const { hasProtectedLabels, protectedLabels } =
          await checkHasProtectedLabels({
            prisma: ctx.prisma,
            projectId: input.projectId,
            labelsToCheck: skills.flatMap((skill) => skill.labels),
          });

        if (hasProtectedLabels) {
          throwIfNoProjectAccess({
            session: ctx.session,
            projectId: input.projectId,
            scope: "skillProtectedLabels:CUD",
            forbiddenErrorMessage: `You don't have permission to delete a skill with a protected label. Please contact your project admin for assistance.\n\n Protected labels are: ${protectedLabels.join(", ")}`,
          });
        }

        for (const skill of skills) {
          await auditLog(
            {
              session: ctx.session,
              resourceType: "skill",
              resourceId: skill.id,
              action: "delete",
              before: skill,
            },
            ctx.prisma,
          );
        }

        const skillService = new SkillService(ctx.prisma, redis);
        const skillNames = [...new Set(skills.map((s) => s.name))];

        // Delete all skills with the given id
        await ctx.prisma.skill.deleteMany({
          where: {
            projectId,
            id: {
              in: skills.map((s) => s.id),
            },
          },
        });

        await skillService.invalidateCache({ projectId });

        return { deletedNames: skillNames };
      } catch (e) {
        logger.error(e);
        throw e;
      }
    }),
  deleteVersion: protectedProjectProcedure
    .input(
      z.object({
        skillVersionId: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId } = input;

      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId,
          scope: "skills:CUD",
        });

        const skillVersion = await ctx.prisma.skill.findFirstOrThrow({
          where: {
            id: input.skillVersionId,
            projectId,
          },
        });
        const { name: skillName } = skillVersion;

        // Check if skill has a protected label
        const { hasProtectedLabels, protectedLabels } =
          await checkHasProtectedLabels({
            prisma: ctx.prisma,
            projectId: input.projectId,
            labelsToCheck: skillVersion.labels,
          });

        if (hasProtectedLabels) {
          throwIfNoProjectAccess({
            session: ctx.session,
            projectId: input.projectId,
            scope: "skillProtectedLabels:CUD",
            forbiddenErrorMessage: `You don't have permission to delete a skill with a protected label. Please contact your project admin for assistance.\n\n Protected labels are: ${protectedLabels.join(", ")}`,
          });
        }

        await auditLog(
          {
            session: ctx.session,
            resourceType: "skill",
            resourceId: input.skillVersionId,
            action: "delete",
            before: skillVersion,
          },
          ctx.prisma,
        );

        const transaction = [
          ctx.prisma.skill.delete({
            where: {
              id: input.skillVersionId,
              projectId,
            },
          }),
        ];

        // If the deleted skill was the latest version, update the latest skill
        if (skillVersion.labels.includes(LATEST_SKILL_LABEL)) {
          const newLatestSkill = await ctx.prisma.skill.findFirst({
            where: {
              projectId,
              name: skillName,
              id: { not: input.skillVersionId },
            },
            orderBy: [{ version: "desc" }],
          });

          if (newLatestSkill) {
            transaction.push(
              ctx.prisma.skill.update({
                where: {
                  id: newLatestSkill.id,
                  projectId: input.projectId,
                },
                data: {
                  labels: {
                    push: LATEST_SKILL_LABEL,
                  },
                },
              }),
            );
          }
        }

        const skillService = new SkillService(ctx.prisma, redis);

        // Execute transaction
        await ctx.prisma.$transaction(transaction);
        // Rotate cache epoch only after successful commit.
        await skillService.invalidateCache({ projectId });
      } catch (e) {
        logger.error(e);
        throw e;
      }
    }),
  setLabels: protectedProjectProcedure
    .input(
      z.object({
        skillId: z.string(),
        projectId: z.string(),
        labels: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { projectId } = input;

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId,
          scope: "skills:CUD",
        });

        const toBeLabeledSkill = await ctx.prisma.skill.findUnique({
          where: {
            id: input.skillId,
            projectId,
          },
        });

        if (!toBeLabeledSkill) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Skill not found.",
          });
        }

        const { name: skillName } = toBeLabeledSkill;
        const newLabelSet = new Set(input.labels);
        const newLabels = [...newLabelSet];

        const removedLabels = [];
        for (const oldLabel of toBeLabeledSkill.labels) {
          if (!newLabelSet.has(oldLabel)) {
            removedLabels.push(oldLabel);
          }
        }

        const addedLabels = [];
        for (const newLabel of newLabels) {
          if (!toBeLabeledSkill.labels.includes(newLabel)) {
            addedLabels.push(newLabel);
          }
        }

        // Check if any label is protected (both new and to be removed)
        const { hasProtectedLabels, protectedLabels } =
          await checkHasProtectedLabels({
            prisma: ctx.prisma,
            projectId: input.projectId,
            labelsToCheck: [...addedLabels, ...removedLabels],
          });

        if (hasProtectedLabels) {
          throwIfNoProjectAccess({
            session: ctx.session,
            projectId: input.projectId,
            scope: "skillProtectedLabels:CUD",
            forbiddenErrorMessage: `You don't have permission to add/remove a protected label to/from a skill. Please contact your project admin for assistance.\n\n Protected labels are: ${protectedLabels.join(", ")}`,
          });
        }

        await auditLog(
          {
            session: ctx.session,
            resourceType: "skill",
            resourceId: toBeLabeledSkill.id,
            action: "setLabel",
            after: {
              ...toBeLabeledSkill,
              labels: newLabels,
            },
          },
          ctx.prisma,
        );

        const previousLabeledSkills = await ctx.prisma.skill.findMany({
          where: {
            projectId,
            name: skillName,
            labels: { hasSome: newLabels },
            id: { not: input.skillId },
          },
          orderBy: [{ version: "desc" }],
        });

        const toBeExecuted = [
          ctx.prisma.skill.update({
            where: {
              id: toBeLabeledSkill.id,
              projectId,
            },
            data: {
              labels: newLabels,
            },
          }),
        ];

        // Remove label from previous labeled skills
        previousLabeledSkills.forEach((prevSkill) => {
          toBeExecuted.push(
            ctx.prisma.skill.update({
              where: {
                id: prevSkill.id,
                projectId,
              },
              data: {
                labels: prevSkill.labels.filter((l) => !newLabels.includes(l)),
              },
            }),
          );
        });

        const skillService = new SkillService(ctx.prisma, redis);

        // Execute transaction
        await ctx.prisma.$transaction(toBeExecuted);
        // Rotate cache epoch only after successful commit.
        await skillService.invalidateCache({ projectId });
      } catch (e) {
        logger.error(`Failed to set skill labels: ${e}`, e);
        throw e;
      }
    }),
  allLabels: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });

      const labels = await ctx.prisma.$queryRaw<{ label: string }[]>`
        SELECT DISTINCT UNNEST(labels) AS label
        FROM skills
        WHERE project_id = ${input.projectId}
        AND labels IS NOT NULL;
      `;

      return labels.map((l) => l.label);
    }),
  allNames: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { session } = ctx;
      const { projectId } = input;

      throwIfNoProjectAccess({
        session,
        projectId,
        scope: "skills:read",
      });

      return await ctx.prisma.skill.findMany({
        where: {
          projectId,
        },
        select: {
          id: true,
          name: true,
        },
        distinct: ["name"],
      });
    }),
  updateTags: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        tags: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId, name: skillName } = input;

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "objects:tag",
      });

      try {
        await auditLog({
          session: ctx.session,
          resourceType: "skill",
          resourceId: skillName,
          action: "updateTags",
          after: input.tags,
        });

        const skillService = new SkillService(ctx.prisma, redis);

        await ctx.prisma.skill.updateMany({
          where: {
            name: skillName,
            projectId,
          },
          data: {
            tags: {
              set: input.tags,
            },
          },
        });

        // Rotate cache epoch only after successful commit.
        await skillService.invalidateCache({ projectId });
      } catch (e) {
        logger.error(`Failed to update skill tags: ${e}`, e);
        throw e;
      }
    }),
  allVersions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        includeCommentCounts: z.boolean().optional(),
        ...optionalPaginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      if (input.includeCommentCounts) {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "comments:read",
        });
      }

      const [skills, totalCount] = await Promise.all([
        ctx.prisma.skill.findMany({
          where: {
            projectId: input.projectId,
            name: input.name,
          },
          ...(input.limit !== undefined && input.page !== undefined
            ? { take: input.limit, skip: input.page * input.limit }
            : undefined),
          orderBy: [{ version: "desc" }],
        }),
        ctx.prisma.skill.count({
          where: {
            projectId: input.projectId,
            name: input.name,
          },
        }),
      ]);

      // TODO(skills): there is no CommentObjectType.SKILL yet, so comment
      // counts cannot be resolved for skills. The includeCommentCounts input
      // and comments:read gate are kept to mirror prompt allVersions; wire up
      // the actual grouping once a SKILL comment object type exists.
      const commentCounts = new Map<string, number>();

      const userIds = skills
        .map((s) => s.createdBy)
        .filter((id) => id !== "API");
      const users = await ctx.prisma.user.findMany({
        select: {
          // never select passwords as they should never be returned to the FE
          id: true,
          name: true,
        },
        where: {
          id: {
            in: userIds,
          },
          organizationMemberships: {
            some: {
              orgId: ctx.session.orgId,
            },
          },
        },
      });

      const joinedSkillAndUsers = skills.map((s) => {
        const user = users.find((u) => u.id === s.createdBy);
        if (!user && s.createdBy === "API") {
          return { ...s, creator: "API" };
        }
        return {
          ...s,
          creator: user?.name,
        };
      });
      return {
        skillVersions: joinedSkillAndUsers,
        totalCount,
        ...(input.includeCommentCounts ? { commentCounts } : {}),
      };
    }),
  getProtectedLabels: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { projectId } = input;

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "skills:read",
      });

      throwIfNoEntitlement({
        projectId,
        // TODO(skills): dedicated entitlement. Reusing the prompt entitlement
        // until a skill-specific one exists.
        entitlement: "prompt-protected-labels",
        sessionUser: ctx.session.user,
      });

      const protectedLabels = await ctx.prisma.skillProtectedLabels.findMany({
        where: {
          projectId,
        },
      });

      return protectedLabels.map((l) => l.label);
    }),
  addProtectedLabel: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), label: SkillLabelSchema }))
    .mutation(async ({ input, ctx }) => {
      const { projectId, label } = input;

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "skillProtectedLabels:CUD",
        forbiddenErrorMessage:
          "You don't have permission to mark a label as protected. Please contact your project admin for assistance.",
      });

      throwIfNoEntitlement({
        projectId,
        // TODO(skills): dedicated entitlement.
        entitlement: "prompt-protected-labels",
        sessionUser: ctx.session.user,
      });

      if (label === LATEST_SKILL_LABEL) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You cannot protect the label '${LATEST_SKILL_LABEL}' as this would effectively block skill creation.`,
        });
      }

      const protectedLabel = await ctx.prisma.skillProtectedLabels.upsert({
        where: {
          projectId_label: {
            projectId,
            label,
          },
        },
        create: {
          projectId,
          label,
        },
        update: {},
      });

      await auditLog(
        {
          session: ctx.session,
          resourceType: "skillProtectedLabel",
          resourceId: protectedLabel.id,
          action: "create",
          after: protectedLabel.label,
        },
        ctx.prisma,
      );

      return protectedLabel;
    }),
  removeProtectedLabel: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), label: SkillLabelSchema }))
    .mutation(async ({ input, ctx }) => {
      const { projectId, label } = input;

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "skillProtectedLabels:CUD",
        forbiddenErrorMessage:
          "You don't have permission to mark a label as unprotected. Please contact your project admin for assistance.",
      });

      throwIfNoEntitlement({
        projectId,
        // TODO(skills): dedicated entitlement.
        entitlement: "prompt-protected-labels",
        sessionUser: ctx.session.user,
      });

      const protectedLabel = await ctx.prisma.skillProtectedLabels.delete({
        where: {
          projectId_label: {
            projectId,
            label,
          },
        },
      });

      await auditLog(
        {
          session: ctx.session,
          resourceType: "skillProtectedLabel",
          resourceId: protectedLabel.id,
          action: "delete",
          before: protectedLabel.label,
          after: null,
        },
        ctx.prisma,
      );

      return { success: true };
    }),
});

const generateSkillQuery = (
  select: Prisma.Sql,
  projectId: string,
  filterCondition: Prisma.Sql,
  orderCondition: Prisma.Sql,
  limit: number,
  page: number,
  pathFilter: Prisma.Sql = Prisma.empty,
  searchFilter: Prisma.Sql = Prisma.empty,
  pathPrefix?: string,
) => {
  const prefix = pathPrefix ?? "";

  // CTE to get latest versions (same for root and folder queries)
  const latestCTE = Prisma.sql`
    latest AS (
      SELECT s.*
      FROM skills s
      WHERE (s.name, s.version) IN (
        SELECT name, MAX(version)
        FROM skills s
        WHERE s.project_id = ${projectId}
          ${filterCondition}
          ${pathFilter}
          ${searchFilter}
        GROUP BY name
      )
        AND s.project_id = ${projectId}
        ${filterCondition}
        ${pathFilter}
        ${searchFilter}
    )`;

  // Common ORDER BY and LIMIT clauses
  const orderAndLimit = Prisma.sql`
    ${orderCondition.sql ? Prisma.sql`ORDER BY s.sort_priority, ${Prisma.raw(orderCondition.sql.replace(/ORDER BY /i, ""))}` : Prisma.empty}
    LIMIT ${limit} OFFSET ${page * limit}`;

  if (prefix) {
    // When we're inside a folder, show individual skills within that folder
    // and folder representatives for subfolders

    return Prisma.sql`
    WITH ${latestCTE},
    individual_skills_in_folder AS (
      /* Individual skills exactly at this folder level (no deeper slashes) */
      SELECT
        s.id,
        SUBSTRING(s.name, CHAR_LENGTH(${prefix}) + 2) as name, -- Remove prefix, show relative name
        s.version,
        s.project_id,
        s.description,
        s.instructions,
        s.metadata,
        s.allowed_tools,
        s.updated_at,
        s.created_at,
        s.labels,
        s.tags,
        s.commit_message,
        s.created_by,
        2 as sort_priority, -- Individual skills second
        'skill'::text as row_type  -- Mark as individual skill
      FROM latest s
      WHERE SUBSTRING(s.name, CHAR_LENGTH(${prefix}) + 2) NOT LIKE '%/%'
        AND SUBSTRING(s.name, CHAR_LENGTH(${prefix}) + 2) != ''  -- Exclude skills that match prefix exactly
        AND s.name != ${prefix}  -- Additional safety check
    ),
    subfolder_representatives AS (
      /* Folder representatives for deeper nested skills */
      SELECT
        s.id,
        SPLIT_PART(SUBSTRING(s.name, CHAR_LENGTH(${prefix}) + 2), '/', 1) as name, -- First segment after prefix
        s.version,
        s.project_id,
        s.description,
        s.instructions,
        s.metadata,
        s.allowed_tools,
        s.updated_at,
        s.created_at,
        s.labels,
        s.tags,
        s.commit_message,
        s.created_by,
        1 as sort_priority, -- Folders first
        'folder'::text as row_type, -- Mark as folder representative
        ROW_NUMBER() OVER (PARTITION BY SPLIT_PART(SUBSTRING(s.name, CHAR_LENGTH(${prefix}) + 2), '/', 1) ORDER BY s.version DESC) AS rn
      FROM latest s
      WHERE SUBSTRING(s.name, CHAR_LENGTH(${prefix}) + 2) LIKE '%/%'
    ),
    combined AS (
      SELECT
        id, name, version, project_id, description, instructions, metadata, allowed_tools, updated_at, created_at, labels, tags, commit_message, created_by, sort_priority, row_type
      FROM individual_skills_in_folder
      UNION ALL
      SELECT
        id, name, version, project_id, description, instructions, metadata, allowed_tools, updated_at, created_at, labels, tags, commit_message, created_by, sort_priority, row_type
      FROM subfolder_representatives WHERE rn = 1
    )
    SELECT
      ${select}
    FROM combined s
    ${orderAndLimit};
    `;
  }
  const baseColumns = Prisma.sql`id, name, version, project_id, description, instructions, metadata, allowed_tools, updated_at, created_at, labels, tags, commit_message, created_by`;

  // When we're at the root level, show all individual skills that don't have folders
  // and one representative per folder for skills that do have folders
  return Prisma.sql`
    WITH ${latestCTE},
    individual_skills AS (
      /* Individual skills without folders */
      SELECT s.*, 'skill'::text as row_type
      FROM latest s
      WHERE s.name NOT LIKE '%/%'
    ),
    folder_representatives AS (
      /* One representative per folder - return folder name, not full skill name */
      SELECT
        s.id,
        SPLIT_PART(s.name, '/', 1) as name,  -- Return folder segment name instead of full name
        s.version,
        s.project_id,
        s.description,
        s.instructions,
        s.metadata,
        s.allowed_tools,
        s.updated_at,
        s.created_at,
        s.labels,
        s.tags,
        s.commit_message,
        s.created_by,
        'folder'::text as row_type, -- Mark as folder representative
        ROW_NUMBER() OVER (PARTITION BY SPLIT_PART(s.name, '/', 1) ORDER BY s.version DESC) AS rn
      FROM latest s
      WHERE s.name LIKE '%/%'
    ),
    combined AS (
      SELECT ${baseColumns}, row_type, 1 as sort_priority  -- Folders first
      FROM folder_representatives WHERE rn = 1
      UNION ALL
      SELECT ${baseColumns}, row_type, 2 as sort_priority  -- Individual skills second
      FROM individual_skills
    )
    SELECT
      ${select}
    FROM combined s
    ${orderAndLimit};
    `;
};
