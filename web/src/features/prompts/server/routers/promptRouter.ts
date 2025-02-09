import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  CreatePromptTRPCSchema,
  PromptType,
} from "@/src/features/prompts/server/utils/validation";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Prompt, Prisma } from "@langfuse/shared/src/db";
import { createPrompt, duplicatePrompt } from "../actions/createPrompt";
import { promptsTableCols } from "@/src/server/api/definitions/promptsTable";
import { optionalPaginationZod, paginationZod } from "@langfuse/shared";
import { orderBy, singleFilter } from "@langfuse/shared";
import { LATEST_PROMPT_LABEL } from "@/src/features/prompts/constants";
import {
  orderByToPrismaSql,
  PromptService,
  redis,
  logger,
  tableColumnsToSqlFilterAndPrefix,
  getObservationsWithPromptName,
  getObservationMetricsForPrompts,
  getAggregatedScoresForPrompts,
} from "@langfuse/shared/src/server";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";

const PromptFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  orderBy: orderBy,
  ...paginationZod,
});

export const promptRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(PromptFilterOptions)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });

      const orderByCondition = orderByToPrismaSql(
        input.orderBy,
        promptsTableCols,
      );

      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter,
        promptsTableCols,
        "prompts",
      );

      const [prompts, promptCount] = await Promise.all([
        // prompts
        ctx.prisma.$queryRaw<Array<Prompt>>(
          generatePromptQuery(
            Prisma.sql` 
          p.id,
          p.name,
          p.version,
          p.project_id as "projectId",
          p.prompt,
          p.type,
          p.updated_at as "updatedAt",
          p.created_at as "createdAt",
          p.labels,
          p.tags`,
            input.projectId,
            filterCondition,
            orderByCondition,
            input.limit,
            input.page,
          ),
        ),
        // promptCount
        ctx.prisma.$queryRaw<Array<{ totalCount: bigint }>>(
          generatePromptQuery(
            Prisma.sql` count(*) AS "totalCount"`,
            input.projectId,
            filterCondition,
            Prisma.empty,
            1, // limit
            0, // page
          ),
        ),
      ]);

      return {
        prompts: prompts,
        totalCount:
          promptCount.length > 0 ? Number(promptCount[0]?.totalCount) : 0,
      };
    }),
  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        promptNames: z.array(z.string()),
      }),
    )
    .query(async ({ input }) => {
      if (input.promptNames.length === 0) return [];
      const res = await getObservationsWithPromptName(
        input.projectId,
        input.promptNames,
      );
      return res.map(({ promptName, count }) => ({
        promptName,
        observationCount: count,
      }));
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
        scope: "prompts:read",
      });
      return ctx.prisma.prompt.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });
    }),
  create: protectedProjectProcedure
    .input(CreatePromptTRPCSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        const prompt = await createPrompt({
          ...input,
          prisma: ctx.prisma,
          createdBy: ctx.session.user.id,
        });

        if (!prompt) {
          throw new Error("Failed to create prompt");
        }

        await auditLog(
          {
            session: ctx.session,
            resourceType: "prompt",
            resourceId: prompt.id,
            action: "create",
            after: prompt,
          },
          ctx.prisma,
        );

        return prompt;
      } catch (e) {
        logger.error(e);
        throw e;
      }
    }),
  duplicatePrompt: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        promptId: z.string(),
        name: z.string(),
        isSingleVersion: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:CUD",
      });

      const prompt = await duplicatePrompt({
        projectId: input.projectId,
        promptId: input.promptId,
        name: input.name,
        isSingleVersion: input.isSingleVersion,
        createdBy: ctx.session.user.id,
        prisma: ctx.prisma,
      });

      if (!prompt) {
        throw new Error(`Failed to duplicate prompt: ${input.promptId}`);
      }

      await auditLog(
        {
          session: ctx.session,
          resourceType: "prompt",
          resourceId: prompt.id,
          action: "create",
          after: prompt,
        },
        ctx.prisma,
      );

      return prompt;
    }),
  filterOptions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [names, tags, labels] = await Promise.all([
        ctx.prisma.prompt.groupBy({
          where: {
            projectId: input.projectId,
          },
          by: ["name"],
          // limiting to 1k prompt names to avoid performance issues.
          // some users have unique names for large amounts of prompts
          // sending all prompt names to the FE exceeds the cloud function return size limit
          take: 1000,
          orderBy: {
            name: "asc",
          },
        }),
        ctx.prisma.$queryRaw<{ value: string }[]>`
          SELECT tags.tag as value
          FROM prompts, UNNEST(prompts.tags) AS tags(tag)
          WHERE prompts.project_id = ${input.projectId}
          GROUP BY tags.tag
          ORDER BY tags.tag ASC;
        `,
        ctx.prisma.$queryRaw<{ value: string }[]>`
          SELECT labels.label as value
          FROM prompts, UNNEST(prompts.labels) AS labels(label)
          WHERE prompts.project_id = ${input.projectId}
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
        promptName: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { projectId, promptName } = input;

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId,
          scope: "prompts:CUD",
        });

        // fetch prompts before deletion to enable audit logging
        const prompts = await ctx.prisma.prompt.findMany({
          where: {
            projectId,
            name: input.promptName,
          },
        });

        for (const prompt of prompts) {
          await auditLog(
            {
              session: ctx.session,
              resourceType: "prompt",
              resourceId: prompt.id,
              action: "delete",
              before: prompt,
            },
            ctx.prisma,
          );
        }

        // Lock and invalidate cache for _all_ versions and labels of the prompt
        const promptService = new PromptService(ctx.prisma, redis);
        await promptService.lockCache({ projectId, promptName });
        await promptService.invalidateCache({ projectId, promptName });

        // Delete all prompts with the given name
        await ctx.prisma.prompt.deleteMany({
          where: {
            projectId,
            id: {
              in: prompts.map((p) => p.id),
            },
          },
        });

        // Unlock cache
        await promptService.unlockCache({ projectId, promptName });
      } catch (e) {
        logger.error(e);
        throw e;
      }
    }),
  deleteVersion: protectedProjectProcedure
    .input(
      z.object({
        promptVersionId: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId } = input;

      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId,
          scope: "prompts:CUD",
        });

        const promptVersion = await ctx.prisma.prompt.findFirstOrThrow({
          where: {
            id: input.promptVersionId,
            projectId,
          },
        });
        const { name: promptName } = promptVersion;

        await auditLog(
          {
            session: ctx.session,
            resourceType: "prompt",
            resourceId: input.promptVersionId,
            action: "delete",
            before: promptVersion,
          },
          ctx.prisma,
        );

        const transaction = [
          ctx.prisma.prompt.delete({
            where: {
              id: input.promptVersionId,
              projectId,
            },
          }),
        ];

        // If the deleted prompt was the latest version, update the latest prompt
        if (promptVersion.labels.includes(LATEST_PROMPT_LABEL)) {
          const newLatestPrompt = await ctx.prisma.prompt.findFirst({
            where: {
              projectId,
              name: promptName,
              id: { not: input.promptVersionId },
            },
            orderBy: [{ version: "desc" }],
          });

          if (newLatestPrompt) {
            transaction.push(
              ctx.prisma.prompt.update({
                where: {
                  id: newLatestPrompt.id,
                  projectId: input.projectId,
                },
                data: {
                  labels: {
                    push: LATEST_PROMPT_LABEL,
                  },
                },
              }),
            );
          }
        }

        // Lock and invalidate cache for _all_ versions and labels of the prompt
        const promptService = new PromptService(ctx.prisma, redis);
        await promptService.lockCache({ projectId, promptName });
        await promptService.invalidateCache({ projectId, promptName });

        // Execute transaction
        await ctx.prisma.$transaction(transaction);

        // Unlock cache
        await promptService.unlockCache({ projectId, promptName });
      } catch (e) {
        logger.error(e);
        throw e;
      }
    }),
  setLabels: protectedProjectProcedure
    .input(
      z.object({
        promptId: z.string(),
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
          scope: "prompts:CUD",
        });

        const toBeLabeledPrompt = await ctx.prisma.prompt.findUniqueOrThrow({
          where: {
            id: input.promptId,
            projectId,
          },
        });

        const { name: promptName } = toBeLabeledPrompt;
        const newLabels = [...new Set(input.labels)];

        await auditLog(
          {
            session: ctx.session,
            resourceType: "prompt",
            resourceId: toBeLabeledPrompt.id,
            action: "setLabel",
            after: {
              ...toBeLabeledPrompt,
              labels: newLabels,
            },
          },
          ctx.prisma,
        );

        const previousLabeledPrompts = await ctx.prisma.prompt.findMany({
          where: {
            projectId,
            name: promptName,
            labels: { hasSome: newLabels },
            id: { not: input.promptId },
          },
          orderBy: [{ version: "desc" }],
        });

        const toBeExecuted = [
          ctx.prisma.prompt.update({
            where: {
              id: toBeLabeledPrompt.id,
              projectId,
            },
            data: {
              labels: newLabels,
            },
          }),
        ];

        // Remove label from previous labeled prompts
        previousLabeledPrompts.forEach((prevPrompt) => {
          toBeExecuted.push(
            ctx.prisma.prompt.update({
              where: {
                id: prevPrompt.id,
                projectId,
              },
              data: {
                labels: prevPrompt.labels.filter((l) => !newLabels.includes(l)),
              },
            }),
          );
        });

        // Lock and invalidate cache for _all_ versions and labels of the prompt
        const promptService = new PromptService(ctx.prisma, redis);
        await promptService.lockCache({ projectId, promptName });
        await promptService.invalidateCache({ projectId, promptName });

        // Execute transaction
        await ctx.prisma.$transaction(toBeExecuted);

        // Unlock cache
        await promptService.unlockCache({ projectId, promptName });
      } catch (e) {
        logger.error(`Failed to set prompt labels: ${e}`, e);
        throw e;
      }
    }),
  allLabels: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });

      const labels = await ctx.prisma.$queryRaw<{ label: string }[]>`
        SELECT DISTINCT UNNEST(labels) AS label
        FROM prompts
        WHERE project_id = ${input.projectId}      
        AND labels IS NOT NULL;
      `;

      return labels.map((l) => l.label);
    }),
  allNames: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        type: z.nativeEnum(PromptType).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { session } = ctx;
      const { projectId, type } = input;

      throwIfNoProjectAccess({
        session,
        projectId,
        scope: "prompts:read",
      });

      return await ctx.prisma.prompt.findMany({
        where: {
          projectId,
          type,
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
      const { projectId, name: promptName } = input;

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId,
        scope: "objects:tag",
      });

      try {
        await auditLog({
          session: ctx.session,
          resourceType: "prompt",
          resourceId: promptName,
          action: "updateTags",
          after: input.tags,
        });

        // Lock and invalidate cache for _all_ versions and labels of the prompt
        const promptService = new PromptService(ctx.prisma, redis);
        await promptService.lockCache({ projectId, promptName });
        await promptService.invalidateCache({ projectId, promptName });

        await ctx.prisma.prompt.updateMany({
          where: {
            name: promptName,
            projectId,
          },
          data: {
            tags: {
              set: input.tags,
            },
          },
        });

        // Unlock cache
        await promptService.unlockCache({ projectId, promptName });
      } catch (error) {
        logger.error(error);
      }
    }),
  allPromptMeta: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });

      return await ctx.prisma.prompt.findMany({
        select: {
          id: true,
          name: true,
          version: true,
          type: true,
          prompt: true,
        },
        where: {
          projectId: input.projectId,
        },
        orderBy: [{ version: "desc" }],
      });
    }),
  allVersions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        ...optionalPaginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });
      const [prompts, totalCount] = await Promise.all([
        ctx.prisma.prompt.findMany({
          where: {
            projectId: input.projectId,
            name: input.name,
          },
          ...(input.limit !== undefined && input.page !== undefined
            ? { take: input.limit, skip: input.page * input.limit }
            : undefined),
          orderBy: [{ version: "desc" }],
        }),
        ctx.prisma.prompt.count({
          where: {
            projectId: input.projectId,
            name: input.name,
          },
        }),
      ]);

      const userIds = prompts
        .map((p) => p.createdBy)
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

      const joinedPromptAndUsers = prompts.map((p) => {
        const user = users.find((u) => u.id === p.createdBy);
        if (!user && p.createdBy === "API") {
          return { ...p, creator: "API" };
        }
        return {
          ...p,
          creator: user?.name,
        };
      });
      return { promptVersions: joinedPromptAndUsers, totalCount };
    }),
  versionMetrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        promptIds: z.array(z.string()),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });

      const [observations, observationScores, traceScores] = await Promise.all([
        getObservationMetricsForPrompts(input.projectId, input.promptIds),
        getScoresForPromptIds(input.projectId, input.promptIds, "observation"),
        getScoresForPromptIds(input.projectId, input.promptIds, "trace"),
      ]);

      return observations.map((r) => {
        const promptObservationScores = observationScores.find(
          (score) => score.promptId === r.promptId,
        );
        const promptTraceScores = traceScores.find(
          (score) => score.promptId === r.promptId,
        );

        return {
          id: r.promptId,
          observationCount: BigInt(r.count),
          firstUsed: r.firstObservation,
          lastUsed: r.lastObservation,
          medianOutputTokens: r.medianOutputUsage,
          medianInputTokens: r.medianInputUsage,
          medianTotalCost: r.medianTotalCost,
          medianLatency: r.medianLatencyMs,
          observationScores: aggregateScores(
            promptObservationScores?.scores ?? [],
          ),
          traceScores: aggregateScores(promptTraceScores?.scores ?? []),
        };
      });
    }),
});

const getScoresForPromptIds = async (
  projectId: string,
  promptIds: string[],
  fetchScoreRelation: "observation" | "trace",
) => {
  const scores = await getAggregatedScoresForPrompts(
    projectId,
    promptIds,
    fetchScoreRelation,
  );

  return promptIds.map((promptId) => {
    const promptScores = scores.filter((score) => score.promptId === promptId);
    return {
      promptId,
      scores: promptScores,
    };
  });
};

const generatePromptQuery = (
  select: Prisma.Sql,
  projectId: string,
  filterCondition: Prisma.Sql,
  orderCondition: Prisma.Sql,
  limit: number,
  page: number,
) => {
  return Prisma.sql`
  SELECT
   ${select}
   FROM prompts p
   WHERE (name, version) IN (
    SELECT name, MAX(version)
     FROM prompts p
     WHERE "project_id" = ${projectId}
     ${filterCondition}
          GROUP BY name
        )
    AND "project_id" = ${projectId}
  ${filterCondition}
  ${orderCondition}
  LIMIT ${limit} OFFSET ${page * limit};
`;
};
