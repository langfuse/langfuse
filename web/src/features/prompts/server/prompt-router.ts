import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  type Prompt,
  type PrismaClient,
  Prisma,
} from "@langfuse/shared/src/db";
import { jsonSchema } from "@/src/utils/zod";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DB } from "@/src/server/db";
import {
  numberFilter,
  singleFilter,
} from "@/src/server/api/interfaces/filters";
import { orderBy } from "@/src/server/api/interfaces/orderBy";
import { tableColumnsToSqlFilterAndPrefix } from "@/src/features/filters/server/filterToPrisma";
import { promptsTableCols } from "@/src/server/api/definitions/promptsTable";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";
import { RouterOutput } from "@/src/utils/types";
import { FilterCondition, FilterState } from "@/src/features/filters/types";

export const CreatePrompt = z.object({
  projectId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  prompt: z.string(),
  config: jsonSchema,
  tags: z.array(z.string()),
});

const PromptFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  orderBy: orderBy,
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
      const promptCountFilter = input.filter.filter(
        (f) => f.column === "Number of Generations" && f.type === "number",
      );
      const promptQueryFilter = input.filter.filter(
        (f) => f.column !== "Number of Generations",
      );
      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        promptQueryFilter,
        promptsTableCols,
        "prompts",
      );

      const orderByCondition =
        input.orderBy?.column === "numberOfObservations"
          ? Prisma.empty
          : orderByToPrismaSql(input.orderBy, promptsTableCols);

      const prompts = await ctx.prisma.$queryRaw<Array<Prompt>>(
        generatePromptQuery(
          Prisma.sql` 
          p.id,
          p.name,
          p.version,
          p.project_id as "projectId",
          p.prompt,
          p.updated_at as "updatedAt",
          p.created_at as "createdAt",
          p.is_active as "isActive",
          p.tags`,
          input.projectId,
          filterCondition,
          orderByCondition,
          1000,
          0,
        ),
      );

      const promptCountQuery = DB.selectFrom("observations")
        .fullJoin("prompts", "prompts.id", "observations.prompt_id")
        .select(({ fn }) => [
          "prompts.name",
          fn.count("observations.id").as("count"),
        ])
        .where("prompts.project_id", "=", input.projectId)
        .where("observations.project_id", "=", input.projectId)
        .groupBy("prompts.name");

      const compiledQuery = promptCountQuery.compile();

      const promptCounts = await ctx.prisma.$queryRawUnsafe<
        Array<{
          name: string;
          count: bigint;
        }>
      >(compiledQuery.sql, ...compiledQuery.parameters);

      const joinedPromptsAndCounts = prompts.map((p) => {
        const matchedCount = promptCounts.find((c) => c.name === p.name);
        return {
          ...p,
          observationCount: Number(matchedCount?.count ?? 0),
        };
      });

      let joinedPromptsAndCountsFiltered = joinedPromptsAndCounts;
      for (const countFilter of promptCountFilter) {
        joinedPromptsAndCountsFiltered = filterPromptsByCount(
          joinedPromptsAndCountsFiltered,
          countFilter as Extract<FilterCondition, { type: "number" }>,
        );
      }

      if (input.orderBy?.column === "numberOfObservations") {
        joinedPromptsAndCountsFiltered = sortPromptsByObservationCount(
          joinedPromptsAndCountsFiltered,
          input.orderBy?.order,
        );
      }

      return joinedPromptsAndCountsFiltered;
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
    .input(CreatePrompt)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        const prompt = await createPrompt({
          projectId: input.projectId,
          name: input.name,
          prompt: input.prompt,
          isActive: input.isActive,
          createdBy: ctx.session.user.id,
          tags: input.tags,
          config: jsonSchema.parse(input.config),
          prisma: ctx.prisma,
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
      const res = {
        name: names
          .filter((n) => n.name !== null)
          .map((name) => ({
            value: name.name ?? "undefined",
            count: name._count.id,
          })),
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

        await ctx.prisma.prompt.delete({
          where: {
            id: input.promptVersionId,
            projectId: input.projectId,
          },
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  promote: protectedProjectProcedure
    .input(z.object({ promptId: z.string(), projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        const toBePromotedPrompt = await ctx.prisma.prompt.findUniqueOrThrow({
          where: {
            id: input.promptId,
          },
        });

        await auditLog(
          {
            session: ctx.session,
            resourceType: "prompt",
            resourceId: toBePromotedPrompt.id,
            action: "promote",
            after: {
              ...toBePromotedPrompt,
              isActive: true,
            },
          },
          ctx.prisma,
        );

        const latestActivePrompt = await ctx.prisma.prompt.findFirst({
          where: {
            projectId: input.projectId,
            name: toBePromotedPrompt.name,
            isActive: true,
          },
          orderBy: [{ version: "desc" }],
        });

        const toBeExecuted = [
          ctx.prisma.prompt.update({
            where: {
              id: toBePromotedPrompt.id,
            },
            data: {
              isActive: true,
            },
          }),
        ];
        if (latestActivePrompt)
          toBeExecuted.push(
            ctx.prisma.prompt.update({
              where: {
                id: latestActivePrompt.id,
              },
              data: {
                isActive: false,
              },
            }),
          );
        await ctx.prisma.$transaction(toBeExecuted);
      } catch (e) {
        console.log(e);
        throw e;
      }
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
        const updatedPrompts = await ctx.prisma.prompt.updateMany({
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
        return updatedPrompts;
      } catch (error) {
        console.error(error);
      }
    }),
  allVersions: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), name: z.string() }))
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
        orderBy: [{ version: "desc" }],
      });
      const users = await ctx.prisma.user.findMany({
        select: {
          // never select passwords as they should never be returned to the FE
          id: true,
          name: true,
          email: true,
        },
        where: {
          memberships: {
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
        if (!user) {
          console.log(`User not found for promptId ${p.id}`);
          throw new Error(`User not found for promptId ${p.id}`);
        }
        return {
          ...p,
          creator: user.name,
        };
      });
      return joinedPromptAndUsers;
    }),
});

export const createPrompt = async ({
  projectId,
  name,
  prompt,
  isActive = true,
  createdBy,
  tags,
  config,
  prisma,
}: {
  projectId: string;
  name: string;
  prompt: string;
  isActive?: boolean;
  createdBy: string;
  tags: string[];
  config: z.infer<typeof jsonSchema>;
  prisma: PrismaClient;
}) => {
  const latestPrompt = await prisma.prompt.findFirst({
    where: {
      projectId: projectId,
      name: name,
    },
    orderBy: [{ version: "desc" }],
  });

  const latestActivePrompt = await prisma.prompt.findFirst({
    where: {
      projectId: projectId,
      name: name,
      isActive: true,
    },
    orderBy: [{ version: "desc" }],
  });

  const create = [
    prisma.prompt.create({
      data: {
        prompt: prompt,
        name: name,
        version: latestPrompt?.version ? latestPrompt.version + 1 : 1,
        isActive: isActive,
        project: { connect: { id: projectId } },
        createdBy: createdBy,
        tags: tags,
        config: jsonSchema.parse(config),
      },
    }),
  ];
  if (latestActivePrompt && isActive)
    // If we're creating a new active prompt, we need to deactivate the old one
    create.push(
      prisma.prompt.update({
        where: {
          id: latestActivePrompt.id,
        },
        data: {
          isActive: false,
        },
      }),
    );

  const [createdPrompt] = await prisma.$transaction(create);

  return createdPrompt;
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
     FROM prompts
     WHERE "project_id" = ${projectId}
          GROUP BY name
        )
    AND "project_id" = ${projectId}
  ${filterCondition}
  ${orderCondition}
  LIMIT ${limit} OFFSET ${page * limit};
`;
};

function filterPromptsByCount(
  prompts: RouterOutput["prompts"]["all"],
  countFilter: Extract<FilterCondition, { type: "number" }>,
) {
  const value = countFilter.value;
  return prompts.filter((p) => {
    switch (countFilter.operator) {
      case "=":
        return p.observationCount === value;
      case "<":
        return p.observationCount < value;
      case ">":
        return p.observationCount > value;
      case "<=":
        return p.observationCount <= value;
      case ">=":
        return p.observationCount >= value;
      default:
        return true;
    }
  });
}

function sortPromptsByObservationCount(
  prompts: RouterOutput["prompts"]["all"],
  order: "ASC" | "DESC",
) {
  const sortOrders = {
    ASC: (
      a: RouterOutput["prompts"]["all"][number],
      b: RouterOutput["prompts"]["all"][number],
    ) => a.observationCount - b.observationCount,
    DESC: (
      a: RouterOutput["prompts"]["all"][number],
      b: RouterOutput["prompts"]["all"][number],
    ) => b.observationCount - a.observationCount,
  };

  return prompts.sort(sortOrders[order]);
}
