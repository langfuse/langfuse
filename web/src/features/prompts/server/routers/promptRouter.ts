import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { CreatePromptTRPCSchema } from "@/src/features/prompts/server/utils/validation";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Prompt, Prisma } from "@langfuse/shared/src/db";

import { createPrompt } from "../actions/createPrompt";
import { orderByToPrismaSql } from "@langfuse/shared";
import { promptsTableCols } from "@/src/server/api/definitions/promptsTable";
import { optionalPaginationZod, paginationZod } from "@langfuse/shared";
import {
  orderBy,
  singleFilter,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared";
import { LATEST_PROMPT_LABEL } from "@/src/features/prompts/constants";

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
      throwIfNoAccess({
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

      const prompts = await ctx.prisma.$queryRaw<Array<Prompt>>(
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
      );

      const promptCount = await ctx.prisma.$queryRaw<
        Array<{ totalCount: bigint }>
      >(
        generatePromptQuery(
          Prisma.sql` count(*) AS "totalCount"`,
          input.projectId,
          filterCondition,
          Prisma.empty,
          1, // limit
          0, // page
        ),
      );

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
      throwIfNoAccess({
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
        throwIfNoAccess({
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
      const names = await ctx.prisma.prompt.groupBy({
        where: {
          projectId: input.projectId,
        },
        by: ["name"],
        // limiting to 1k prompt names to avoid performance issues.
        // some users have unique names for large amounts of prompts
        // sending all prompt names to the FE exceeds the cloud function return size limit
        take: 1000,
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        _count: {
          id: true,
        },
      });
      const tags: { count: number; value: string }[] = await ctx.prisma
        .$queryRaw`
        SELECT COUNT(*)::integer AS "count", tags.tag as value
        FROM prompts, UNNEST(prompts.tags) AS tags(tag)
        WHERE prompts.project_id = ${input.projectId}
        GROUP BY tags.tag;
      `;
      const labels: { count: number; value: string }[] = await ctx.prisma
        .$queryRaw`
      SELECT COUNT(*)::integer AS "count", labels.label as value
      FROM prompts, UNNEST(prompts.labels) AS labels(label)
      WHERE prompts.project_id = ${input.projectId}
      GROUP BY labels.label;
    `;
      const res = {
        name: names
          .filter((n) => n.name !== null)
          .map((name) => ({
            value: name.name ?? "undefined",
            count: name._count.id,
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
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        // fetch prompts before deletion to enable audit logging
        const prompts = await ctx.prisma.prompt.findMany({
          where: {
            projectId: input.projectId,
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

        await ctx.prisma.prompt.deleteMany({
          where: {
            projectId: input.projectId,
            id: {
              in: prompts.map((p) => p.id),
            },
          },
        });
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
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        const promptVersion = await ctx.prisma.prompt.findFirstOrThrow({
          where: {
            id: input.promptVersionId,
            projectId: input.projectId,
          },
        });

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
              projectId: input.projectId,
            },
          }),
        ];

        // If the deleted prompt was the latest version, update the latest prompt
        if (promptVersion.labels.includes(LATEST_PROMPT_LABEL)) {
          const newLatestPrompt = await ctx.prisma.prompt.findFirst({
            where: {
              projectId: input.projectId,
              name: promptVersion.name,
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

        await ctx.prisma.$transaction(transaction);
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
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        const toBeLabeledPrompt = await ctx.prisma.prompt.findUniqueOrThrow({
          where: {
            id: input.promptId,
            projectId: input.projectId,
          },
        });

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
            projectId: input.projectId,
            name: toBeLabeledPrompt.name,
            labels: { hasSome: newLabels },
            id: { not: input.promptId },
          },
          orderBy: [{ version: "desc" }],
        });

        const toBeExecuted = [
          ctx.prisma.prompt.update({
            where: {
              id: toBeLabeledPrompt.id,
              projectId: input.projectId,
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
                projectId: input.projectId,
              },
              data: {
                labels: prevPrompt.labels.filter((l) => !newLabels.includes(l)),
              },
            }),
          );
        });
        await ctx.prisma.$transaction(toBeExecuted);
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  allLabels: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "objects:tag",
      });
      try {
        await auditLog({
          session: ctx.session,
          resourceType: "prompt",
          resourceId: input.name,
          action: "updateTags",
          after: input.tags,
        });
        await ctx.prisma.prompt.updateMany({
          where: {
            name: input.name,
            projectId: input.projectId,
          },
          data: {
            tags: {
              set: input.tags,
            },
          },
        });
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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });
      const prompts = await ctx.prisma.prompt.findMany({
        where: {
          projectId: input.projectId,
          name: input.name,
        },
        ...(input.limit !== undefined && input.page !== undefined
          ? { take: input.limit, skip: input.page * input.limit }
          : undefined),
        orderBy: [{ version: "desc" }],
      });

      const totalCount = await ctx.prisma.prompt.count({
        where: {
          projectId: input.projectId,
          name: input.name,
        },
      });

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
          projectMemberships: {
            some: {
              projectId: input.projectId,
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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "prompts:read",
      });

      if (input.promptIds.length === 0) return [];

      const metrics = await ctx.prisma.$queryRaw<
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
            MIN(ov.start_time) AS "firstUsed",
            MAX(ov.start_time) AS "lastUsed",
            PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY ov.completion_tokens) AS "medianOutputTokens",
            PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY ov.prompt_tokens) AS "medianInputTokens",
            PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY ov.calculated_total_cost) AS "medianTotalCost",
            PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY ov.latency) AS "medianLatency"
          FROM
            "observations_view" ov
          WHERE
            ov.prompt_id = p.id
            AND "type" = 'GENERATION'
            AND "project_id" = ${input.projectId}
        ) AS observation_metrics ON true
        WHERE "project_id" = ${input.projectId}
        AND p.id in (${Prisma.join(input.promptIds)})
        ORDER BY version DESC
    `,
      );

      const averageObservationScores = await ctx.prisma.$queryRaw<
        Array<{
          prompt_id: string;
          scores: Record<string, number>;
        }>
      >(
        Prisma.sql` 
        WITH avg_scores_by_prompt AS (
          SELECT
              o.prompt_id AS prompt_id,
              s.name AS score_name,
              AVG(s.value) AS average_score_value
          FROM observations AS o
          JOIN prompts AS p ON o.prompt_id = p.id AND p.project_id = ${input.projectId}
          LEFT JOIN scores s ON o.trace_id = s.trace_id AND s.observation_id = o.id AND s.project_id = ${input.projectId}
          WHERE
              o.type = 'GENERATION'
              AND s.data_type != 'CATEGORICAL'
              AND o.prompt_id IS NOT NULL
              AND o.project_id = ${input.projectId}
              AND p.id IN (${Prisma.join(input.promptIds)})
          GROUP BY 1,2
          ORDER BY 1,2
        ),
        json_avg_scores_by_prompt_id AS (
          SELECT
            prompt_id,
            jsonb_object_agg(score_name,
            average_score_value) AS scores
          FROM
          avg_scores_by_prompt AS avgs
          WHERE 
            avgs.score_name IS NOT NULL 
            AND avgs.average_score_value IS NOT NULL
          GROUP BY prompt_id
          ORDER BY prompt_id
        )
        SELECT * 
        FROM json_avg_scores_by_prompt_id`,
      );

      const averageTraceScores = await ctx.prisma.$queryRaw<
        Array<{
          prompt_id: string;
          scores: Record<string, number>;
        }>
      >(
        Prisma.sql`
        WITH traces_by_prompt_id AS (
          SELECT
            o.prompt_id,
            o.trace_id
          FROM
            observations o
          WHERE
            o.prompt_id IS NOT NULL
            AND o.type = 'GENERATION'
            AND o.project_id = ${input.projectId}
            AND o.prompt_id IN (${Prisma.join(input.promptIds)})
          GROUP BY
            o.prompt_id,
            o.trace_id
        ), scores_by_trace AS (
          SELECT
              tp.prompt_id,
              tp.trace_id,
              p.version,
              s.name AS score_name,
              s.value AS score_value
          FROM
            traces_by_prompt_id tp
          JOIN prompts AS p ON tp.prompt_id = p.id AND p.project_id = ${input.projectId}
          LEFT JOIN scores s ON tp.trace_id = s.trace_id AND s.observation_id IS NULL AND s.project_id = ${input.projectId}
          WHERE 
              s.data_type != 'CATEGORICAL'
        ), average_scores_by_prompt AS (
          SELECT 
              prompt_id,
              score_name,
              AVG(score_value) AS average_score_value
          FROM 
              scores_by_trace
          GROUP BY 1,2
        ), json_avg_scores_by_prompt_id AS (
          SELECT
            prompt_id,
            jsonb_object_agg(score_name,
            average_score_value) AS scores
          FROM
            average_scores_by_prompt
          WHERE 
            score_name IS NOT NULL 
            AND average_score_value IS NOT NULL
          GROUP BY
            prompt_id
          ORDER BY
            prompt_id
        )
        SELECT * 
        FROM json_avg_scores_by_prompt_id
        `,
      );

      return metrics.map((metric) => ({
        ...metric,
        averageObservationScores: averageObservationScores.find(
          (score) => score.prompt_id === metric.id,
        )?.scores,
        averageTraceScores: averageTraceScores.find(
          (score) => score.prompt_id === metric.id,
        )?.scores,
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
