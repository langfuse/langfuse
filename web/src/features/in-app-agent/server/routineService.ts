import { InAppAgentRoutineStatus } from "@langfuse/shared/src/db";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  getNextInAppAgentRoutineRunAt,
  parseInAppAgentRoutineSchedule,
} from "@langfuse/shared/in-app-agent/server/schedule";
import { fireInAppAgentRoutine } from "@langfuse/shared/in-app-agent/server/routineFire";
import {
  createInAppAgentRoutine,
  parseRoutineName,
  parseRoutinePrompt,
} from "@langfuse/shared/in-app-agent/server/routineWrite";
import { serializeConversationLatestRun } from "@/src/features/in-app-agent/server/backgroundRunService";

const ROUTINE_SELECT = {
  id: true,
  name: true,
  prompt: true,
  status: true,
  cron: true,
  timezone: true,
  nextRunAt: true,
  lastFiredAt: true,
  lastConversationId: true,
  lastSkipReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getOwnedRoutineOrThrow(params: {
  prisma: PrismaClient;
  projectId: string;
  routineId: string;
  userId: string;
}) {
  const routine = await params.prisma.inAppAgentRoutine.findFirst({
    where: {
      id: params.routineId,
      projectId: params.projectId,
      createdByUserId: params.userId,
    },
    select: {
      ...ROUTINE_SELECT,
      createdByUserId: true,
      projectId: true,
    },
  });

  if (!routine) {
    throw new LangfuseNotFoundError("Agent routine not found");
  }

  return routine;
}

export async function listOwnedRoutines(params: {
  prisma: PrismaClient;
  projectId: string;
  userId: string;
}) {
  const routines = await params.prisma.inAppAgentRoutine.findMany({
    where: {
      projectId: params.projectId,
      createdByUserId: params.userId,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: ROUTINE_SELECT,
  });

  const lastConversationIds = routines
    .map((routine) => routine.lastConversationId)
    .filter((id): id is string => Boolean(id));

  const conversations =
    lastConversationIds.length === 0
      ? []
      : await params.prisma.inAppAgentConversation.findMany({
          where: {
            projectId: params.projectId,
            createdByUserId: params.userId,
            deletedAt: null,
            id: { in: lastConversationIds },
          },
          select: {
            id: true,
            title: true,
            runs: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                errorCode: true,
                cancelRequestedAt: true,
                createdAt: true,
                claimedAt: true,
                heartbeatAt: true,
                finishedAt: true,
              },
            },
          },
        });

  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );

  return routines.map((routine) => {
    const conversation = routine.lastConversationId
      ? conversationById.get(routine.lastConversationId)
      : undefined;

    return {
      ...routine,
      lastConversation: conversation
        ? {
            id: conversation.id,
            title: conversation.title,
            latestRun: serializeConversationLatestRun(conversation.runs[0]),
          }
        : null,
    };
  });
}

export async function createOwnedRoutine(params: {
  prisma: PrismaClient;
  projectId: string;
  userId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled?: boolean;
}) {
  return createInAppAgentRoutine(params);
}

export async function updateOwnedRoutine(params: {
  prisma: PrismaClient;
  projectId: string;
  userId: string;
  routineId: string;
  name?: string;
  prompt?: string;
  cron?: string;
  timezone?: string;
  status?: InAppAgentRoutineStatus;
}) {
  const existing = await getOwnedRoutineOrThrow(params);
  const name =
    params.name !== undefined ? parseRoutineName(params.name) : existing.name;
  const prompt =
    params.prompt !== undefined
      ? parseRoutinePrompt(params.prompt)
      : existing.prompt;
  const schedule = parseInAppAgentRoutineSchedule({
    cron: params.cron ?? existing.cron,
    timezone: params.timezone ?? existing.timezone,
  });
  const status = params.status ?? existing.status;
  const scheduleChanged =
    schedule.cron !== existing.cron || schedule.timezone !== existing.timezone;
  const resumed =
    existing.status === InAppAgentRoutineStatus.PAUSED &&
    status === InAppAgentRoutineStatus.ACTIVE;
  const now = new Date();

  return params.prisma.inAppAgentRoutine.update({
    where: {
      id_projectId: {
        id: params.routineId,
        projectId: params.projectId,
      },
    },
    data: {
      name,
      prompt,
      cron: schedule.cron,
      timezone: schedule.timezone,
      status,
      ...(scheduleChanged || resumed
        ? {
            nextRunAt: getNextInAppAgentRoutineRunAt({
              cron: schedule.cron,
              timezone: schedule.timezone,
              after: now,
            }),
          }
        : {}),
    },
    select: ROUTINE_SELECT,
  });
}

export async function deleteOwnedRoutine(params: {
  prisma: PrismaClient;
  projectId: string;
  userId: string;
  routineId: string;
}) {
  const existing = await getOwnedRoutineOrThrow(params);

  await params.prisma.inAppAgentRoutine.delete({
    where: {
      id_projectId: {
        id: params.routineId,
        projectId: params.projectId,
      },
    },
  });

  return existing;
}

export async function runOwnedRoutineNow(params: {
  prisma: PrismaClient;
  projectId: string;
  userId: string;
  routineId: string;
}) {
  const routine = await getOwnedRoutineOrThrow(params);

  return fireInAppAgentRoutine({
    prisma: params.prisma,
    routine,
  });
}
