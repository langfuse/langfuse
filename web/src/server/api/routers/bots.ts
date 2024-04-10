import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { type Bot, PrismaClient } from "@langfuse/shared/src/db";
import { DB } from "@/src/server/db";

export const CreateBot = z.object({
  projectId: z.string(),
  name: z.string(),
  description: z.string(),
  isActive: z.boolean(),
  taskId: z.string(),
  config: z.any(),
});

const BotOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
});

const BotByIdOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  id: z.string().nullish(),
});

const BotByNameOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  name: z.string(),
});

export const botRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(BotOptions)
    .query(async ({ input, ctx }) => {
      const bots = await ctx.prisma.$queryRaw<
        Array<Bot & { taskName: string }>
      >`
        SELECT 
          bots.id, 
          bots.name, 
          bots.version, 
          bots.project_id AS "projectId", 
          bots.config, 
          bots.updated_at AS "updatedAt", 
          bots.created_at AS "createdAt", 
          bots.is_active AS "isActive",
          bots.task_id AS "taskId",
          tasks.name AS "taskName"
        FROM bots, tasks
        WHERE (bots.name, bots.version) IN (
          SELECT name, MAX(version)
          FROM bots
          WHERE "project_id" = ${input.projectId}
          GROUP BY bots.name
        )
        AND bots."project_id" = ${input.projectId}
        AND bots.task_id = tasks.id
        ORDER BY bots.name ASC`;

      const promptCountQuery = DB.selectFrom("observations")
        .fullJoin("bots", "bots.id", "observations.prompt_id")
        .select(({ fn }) => [
          "bots.name",
          fn.count("observations.id").as("count"),
        ])
        .where("bots.project_id", "=", input.projectId)
        .where("observations.project_id", "=", input.projectId)
        .groupBy("bots.name");

      const compiledQuery = promptCountQuery.compile();

      const promptCounts = await ctx.prisma.$queryRawUnsafe<
        Array<{
          name: string;
          count: bigint;
        }>
      >(compiledQuery.sql, ...compiledQuery.parameters);

      const joinedPromptsAndCounts = bots.map((p) => {
        const marchedCount = promptCounts.find((c) => c.name === p.name);
        return {
          ...p,
          observationCount: marchedCount?.count ?? 0,
        };
      });

      return joinedPromptsAndCounts;
    }),
  byId: protectedProjectProcedure
    .input(BotByIdOptions)
    .query(async ({ input, ctx }) => {
      if (!input.id) {
        return null;
      }
      const task = await ctx.prisma.bot.findFirstOrThrow({
        where: {
          projectId: input.projectId,
          id: input.id,
        },
        include: {
          task: {
            include: {
              botSchema: true,
              inputSchema: true,
              outputSchema: true,
            },
          },
        },
      });

      return task;
    }),
  byName: protectedProjectProcedure
    .input(BotByNameOptions)
    .query(async ({ input, ctx }) => {
      const task = await ctx.prisma.bot.findFirstOrThrow({
        where: {
          projectId: input.projectId,
          name: input.name,
        },
        include: {
          task: {
            include: {
              botSchema: true,
              inputSchema: true,
              outputSchema: true,
            },
          },
        },
      });

      return task;
    }),
  create: protectedProjectProcedure
    .input(CreateBot)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "bots:CUD",
        });

        const bot = await createBot({
          projectId: input.projectId,
          name: input.name,
          isActive: input.isActive,
          config: input.config,
          taskId: input.taskId,
          createdBy: ctx.session.user.id,
          description: input.description,
          prisma: ctx.prisma,
        });

        if (!bot) {
          throw new Error("Failed to create bot");
        }

        await auditLog(
          {
            session: ctx.session,
            resourceType: "bot",
            resourceId: bot.id,
            action: "create",
            after: bot,
          },
          ctx.prisma,
        );

        return bot;
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
});

export const createBot = async ({
  projectId,
  name,
  taskId,
  description,
  isActive = true,
  createdBy,
  config,
  prisma,
}: {
  projectId: string;
  name: string;
  taskId: string;
  description: string;
  isActive?: boolean;
  createdBy: string;
  config: any;
  prisma: PrismaClient;
}) => {
  const latestBot = await prisma.bot.findFirst({
    where: {
      projectId: projectId,
      name: name,
    },
    orderBy: [{ version: "desc" }],
  });

  const latestActiveBot = await prisma.bot.findFirst({
    where: {
      projectId: projectId,
      name: name,
      isActive: true,
    },
    orderBy: [{ version: "desc" }],
  });

  const create = [
    prisma.bot.create({
      data: {
        name,
        isActive,
        config,
        version: latestBot?.version ? latestBot.version + 1 : 1,
        taskId,
        description,
        projectId,
        createdBy: createdBy,
      },
    }),
  ];
  if (latestActiveBot && isActive)
    // If we're creating a new active bot, we need to deactivate the old one
    create.push(
      prisma.bot.update({
        where: {
          id: latestActiveBot.id,
        },
        data: {
          isActive: false,
        },
      }),
    );

  const [createdBot] = await prisma.$transaction(create);

  return createdBot;
};
