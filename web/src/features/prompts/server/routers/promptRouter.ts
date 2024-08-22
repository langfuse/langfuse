import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { CreatePromptTRPCSchema } from "@/src/features/prompts/server/utils/validation";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Prompt, Prisma } from "@langfuse/shared/src/db";

import { createPrompt } from "../actions/createPrompt";
import { observationsTableCols, orderByToPrismaSql } from "@langfuse/shared";
import { promptsTableCols } from "@/src/server/api/definitions/promptsTable";
import { optionalPaginationZod, paginationZod } from "@langfuse/shared";
import {
  orderBy,
  singleFilter,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared";
import { LATEST_PROMPT_LABEL } from "@/src/features/prompts/constants";
import { PromptService, redis } from "@langfuse/shared/src/server";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { type ScoreSimplified } from "@/src/features/scores/lib/types";

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
    .query(async ({ input, ctx }) => {
      if (input.promptNames.length === 0) return [];
      const promptCounts = await ctx.prisma.$queryRaw<
        {
          promptName: string;
          observationCount: bigint;
        }[]
      >(
        Prisma.sql`
              WITH prompt_ids AS (
                SELECT
                  p.id,
                  p.name
                FROM
                  prompts p
                WHERE
                  p.project_id = ${input.projectId}
                  AND p.name IN (${Prisma.join(input.promptNames)})
              )
              SELECT
                p.name AS "promptName", SUM(oc.observation_count) AS "observationCount"
              FROM
                prompt_ids p
                LEFT JOIN LATERAL (
                  SELECT
                    COUNT(*) AS observation_count
                  FROM
                    observations o
                  WHERE
                    o.project_id = ${input.projectId}
                    AND o.prompt_id = p.id) oc ON TRUE
              GROUP BY
                p.name
        `,
      );
      return promptCounts.map(({ promptName, observationCount }) => ({
        promptName,
        observationCount: Number(observationCount),
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
        console.log(e);
        throw e;
      }
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
        console.log(e);
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
        console.log(e);
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
        console.log(e);
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
        console.error(error);
      }
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
        filter: z.array(singleFilter).nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });

      if (input.promptIds.length === 0) return [];
      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter ?? [],
        observationsTableCols,
        "prompts",
      );
      const [metrics, generationScores, traceScores] = await Promise.all([
        // metrics
        ctx.prisma.$queryRaw<
          Array<{
            id: string;
            observationCount: number;
            firstUsed: Date | null;
            lastUsed: Date | null;
            medianOutputTokens: number | null;
            medianInputTokens: number | null;
            medianTotalCost: number | null;
            medianLatency: number | null;
          }>
        >(
          Prisma.sql`
            select p.id, p.version, observation_metrics.* from prompts p
            LEFT JOIN LATERAL (
              SELECT
                count(*) AS "observationCount",
                MIN(o.start_time) AS "firstUsed",
                MAX(o.start_time) AS "lastUsed",
                PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY o.completion_tokens) AS "medianOutputTokens",
                PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY o.prompt_tokens) AS "medianInputTokens",
                PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY o.calculated_total_cost) AS "medianTotalCost",
                PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY o.latency) AS "medianLatency"
              FROM
                "observations_view" o
              WHERE
                o.prompt_id = p.id
                AND "type" = 'GENERATION'
                AND "project_id" = ${input.projectId}
                ${filterCondition}
            ) AS observation_metrics ON true
            WHERE "project_id" = ${input.projectId}
            AND p.id in (${Prisma.join(input.promptIds)})
            ORDER BY version DESC
          `,
        ),
        // generationScores
        ctx.prisma.$queryRaw<
          Array<{
            promptId: string;
            scores: Array<ScoreSimplified>;
          }>
        >(Prisma.sql`
          SELECT
            p.id AS "promptId",
            array_agg(s.score) AS "scores"
          FROM
            prompts p
            LEFT JOIN LATERAL (
              SELECT
                jsonb_build_object ('name', s.name, 'stringValue', s.string_value, 'value', s.value, 'source', s."source", 'dataType', s.data_type, 'comment', s.comment) AS "score"
              FROM
                observations AS o
                LEFT JOIN scores s ON o.trace_id = s.trace_id
                  AND s.observation_id = o.id
                  AND s.project_id = ${input.projectId}
              WHERE
                o.prompt_id IS NOT NULL
                AND o.type = 'GENERATION'
                AND o.prompt_id = p.id
                AND o.project_id = ${input.projectId}
                AND s.name IS NOT NULL
                AND p.id IN (${Prisma.join(input.promptIds)})
                ${filterCondition}
              ) s ON TRUE
          WHERE
            p.project_id = ${input.projectId}
            AND s.score IS NOT NULL
            GROUP BY
              p.id
          `),
        // traceScores
        ctx.prisma.$queryRaw<
          Array<{
            promptId: string;
            scores: Array<ScoreSimplified>;
          }>
        >(Prisma.sql`
          SELECT
            p.id AS "promptId",
            array_agg(s.score) AS "scores"
          FROM
            prompts p
            LEFT JOIN LATERAL (
              SELECT
                jsonb_build_object ('name', s.name, 'stringValue', s.string_value, 'value', s.value, 'source', s."source", 'dataType', s.data_type, 'comment', s.comment) AS "score"
                FROM
                scores s
              WHERE
                s.trace_id IN (
                  SELECT o.trace_id
                  FROM observations o
                  WHERE
                    o.prompt_id IS NOT NULL
                    AND o.prompt_id = p.id
                    AND o.type = 'GENERATION'
                    AND o.project_id = ${input.projectId}
                    AND o.prompt_id IN (${Prisma.join(input.promptIds)})
                    ${filterCondition}
                )
                AND s.observation_id IS NULL
                AND s.project_id = ${input.projectId}
              ) s ON TRUE
          WHERE
            p.project_id = ${input.projectId}
            AND s.score IS NOT NULL
          GROUP BY
              p.id
          `),
      ]);

      return metrics.map((metric) => ({
        ...metric,
        observationScores: aggregateScores(
          generationScores.find((score) => score.promptId === metric.id)
            ?.scores ?? [],
        ),
        traceScores: aggregateScores(
          traceScores.find((score) => score.promptId === metric.id)?.scores ??
            [],
        ),
      }));
    }),
});

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
