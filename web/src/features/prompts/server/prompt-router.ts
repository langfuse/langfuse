import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { CreatePromptTRPCSchema } from "@/src/features/prompts/server/validation";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { DB } from "@/src/server/db";
import { type Prompt, Prisma } from "@langfuse/shared/src/db";

import { createPrompt } from "./createPrompt";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";
import { promptsTableCols } from "@/src/server/api/definitions/promptsTable";
import { paginationZod } from "@/src/utils/zod";
import {
  orderBy,
  singleFilter,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared";

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
          p.is_active as "isActive",
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

      const promptNames = prompts.map((p) => p.name);
      // Return as observationCountQuery is unnecessary if there are no prompts
      if (promptNames.length === 0) {
        return {
          prompts: [],
          totalCount:
            promptCount.length > 0 ? Number(promptCount[0]?.totalCount) : 0,
        };
      }

      const observationCountQuery = DB.selectFrom("observations")
        .fullJoin("prompts", "prompts.id", "observations.prompt_id")
        .select(({ fn }) => [
          "prompts.name",
          fn.count("observations.id").as("count"),
        ])
        .where("prompts.project_id", "=", input.projectId)
        .where("observations.project_id", "=", input.projectId)
        .where("prompts.name", "in", promptNames)
        .groupBy("prompts.name");

      const compiledQuery = observationCountQuery.compile();

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

      return {
        prompts: joinedPromptsAndCounts,
        totalCount:
          promptCount.length > 0 ? Number(promptCount[0]?.totalCount) : 0,
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
