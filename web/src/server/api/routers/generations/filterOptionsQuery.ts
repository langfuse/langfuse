import { z } from "zod";

import {
  timeFilter,
  tracesTableUiColumnDefinitions,
  type ObservationOptions,
} from "@langfuse/shared";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { Prisma } from "@langfuse/shared/src/db";
import {
  datetimeFilterToPrisma,
  datetimeFilterToPrismaSql,
  getObservationsGroupedByModel,
  getObservationsGroupedByModelId,
  getObservationsGroupedByName,
  getObservationsGroupedByPromptName,
  getScoresGroupedByName,
  getTracesGroupedByName,
  getTracesGroupedByTags,
} from "@langfuse/shared/src/server";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";

export const filterOptionsQuery = protectedProjectProcedure
  .input(
    z.object({
      projectId: z.string(),
      startTimeFilter: timeFilter.optional(),
      queryClickhouse: z.boolean().default(false),
    }),
  )
  .query(async ({ input, ctx }) => {
    const { startTimeFilter } = input;
    const prismaStartTimeFilter = startTimeFilter
      ? datetimeFilterToPrisma(startTimeFilter)
      : {};

    const queryFilter = {
      projectId: input.projectId,
      type: "GENERATION",
    } as const;

    const rawStartTimeFilter =
      startTimeFilter && startTimeFilter.type === "datetime"
        ? datetimeFilterToPrismaSql(
            "start_time",
            startTimeFilter.operator,
            startTimeFilter.value,
          )
        : Prisma.empty;

    const getClickhouseTraceName = async (): Promise<
      Array<{ traceName: string }>
    > => {
      const traces = await getTracesGroupedByName(
        input.projectId,
        tracesTableUiColumnDefinitions,
        startTimeFilter
          ? [
              {
                column: "Timestamp",
                operator: startTimeFilter.operator,
                value: startTimeFilter.value,
                type: "datetime",
              },
            ]
          : [],
      );
      return traces.map((i) => ({ traceName: i.name }));
    };

    const getClickhouseTraceTags = async (): Promise<
      Array<{ tag: string }>
    > => {
      const traces = await getTracesGroupedByTags({
        projectId: input.projectId,
        filter: startTimeFilter
          ? [
              {
                column: "Timestamp",
                operator: startTimeFilter.operator,
                value: startTimeFilter.value,
                type: "datetime",
              },
            ]
          : [],
      });
      return traces.map((i) => ({ tag: i.value }));
    };

    // Score names
    const [scores, model, name, promptNames, traceNames, tags, modelId] =
      await measureAndReturnApi({
        input,
        operation: "traces.all",
        user: ctx.session.user,
        pgExecution: async () => {
          return await Promise.all([
            // scores
            ctx.prisma.score.groupBy({
              where: {
                projectId: input.projectId,
                timestamp: prismaStartTimeFilter,
                dataType: { in: ["NUMERIC", "BOOLEAN"] },
              },
              take: 1000,
              orderBy: {
                name: "asc",
              },
              by: ["name"],
            }),
            // model
            ctx.prisma.observation.groupBy({
              by: ["model"],
              where: { ...queryFilter, startTime: prismaStartTimeFilter },
              take: 1000,
              orderBy: { model: "asc" },
            }),
            // name
            ctx.prisma.observation.groupBy({
              by: ["name"],
              where: { ...queryFilter, startTime: prismaStartTimeFilter },
              take: 1000,
              orderBy: { name: "asc" },
            }),
            // promptNames
            ctx.prisma.$queryRaw<
              Array<{
                promptName: string | null;
              }>
            >(Prisma.sql`
        SELECT
          p.name "promptName"
        FROM prompts p
        JOIN observations o ON o.prompt_id = p.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND o.prompt_id IS NOT NULL
          AND p.project_id = ${input.projectId}
          ${rawStartTimeFilter}
        GROUP BY p.name
        ORDER BY p.name ASC
        LIMIT 1000;
      `),
            // traceNames
            ctx.prisma.$queryRaw<
              Array<{
                traceName: string | null;
              }>
            >(Prisma.sql`
        SELECT
          t.name "traceName"
        FROM traces t
        JOIN observations o ON o.trace_id = t.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND t.project_id = ${input.projectId}
          ${rawStartTimeFilter}
        GROUP BY t.name
        ORDER BY t.name ASC
        LIMIT 1000;
      `),
            // traceTags
            ctx.prisma.$queryRaw<
              Array<{
                tag: string | null;
              }>
            >(Prisma.sql`
          SELECT
            DISTINCT tag
          FROM traces t
          JOIN observations o ON o.trace_id = t.id,
          UNNEST(t.tags) AS tag
          WHERE o.type = 'GENERATION'
            AND o.project_id = ${input.projectId}
            AND t.project_id = ${input.projectId}
            ${rawStartTimeFilter}
          LIMIT 1000;
      `),
            // modelId
            [] as any[],
          ]);
        },
        clickhouseExecution: async () => {
          return await Promise.all([
            //scores
            getScoresGroupedByName(
              input.projectId,
              startTimeFilter
                ? [
                    {
                      column: "Timestamp",
                      operator: startTimeFilter.operator,
                      value: startTimeFilter.value,
                      type: "datetime",
                    },
                  ]
                : [],
            ),
            //model
            getObservationsGroupedByModel(
              input.projectId,
              startTimeFilter ? [startTimeFilter] : [],
            ),
            //name
            getObservationsGroupedByName(
              input.projectId,
              startTimeFilter ? [startTimeFilter] : [],
            ),
            //prompt name
            getObservationsGroupedByPromptName(
              input.projectId,
              startTimeFilter ? [startTimeFilter] : [],
            ),
            //trace name
            getClickhouseTraceName(),
            // trace tags
            getClickhouseTraceTags(),
            // modelId
            getObservationsGroupedByModelId(
              input.projectId,
              startTimeFilter ? [startTimeFilter] : [],
            ),
          ]);
        },
      });

    // typecheck filter options, needs to include all columns with options
    const res: ObservationOptions = {
      model: model
        .filter((i) => i.model !== null)
        .map((i) => ({ value: i.model as string })),
      modelId: modelId
        .filter((i) => i.modelId !== null)
        .map((i) => ({
          value: i.modelId as string,
        })),
      name: name
        .filter((i) => i.name !== null)
        .map((i) => ({ value: i.name as string })),
      traceName: traceNames
        .filter((i) => i.traceName !== null)
        .map((i) => ({
          value: i.traceName as string,
        })),
      scores_avg: scores.map((score) => score.name),
      promptName: promptNames
        .filter((i) => i.promptName !== null)
        .map((i) => ({
          value: i.promptName as string,
        })),
      tags: tags
        .filter((i) => i.tag !== null)
        .map((i) => ({
          value: i.tag as string,
        })),
    };

    return res;
  });
