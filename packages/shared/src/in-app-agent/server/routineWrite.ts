import { InAppAgentRoutineStatus, Prisma, type PrismaClient } from "../../db";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import {
  IN_APP_AGENT_ROUTINE_MAX_PER_USER,
  IN_APP_AGENT_ROUTINE_NAME_MAX_LENGTH,
  IN_APP_AGENT_ROUTINE_PROMPT_MAX_LENGTH,
} from "../routines";
import { createInAppAgentRoutineId } from "./ids";
import { fireInAppAgentRoutine } from "./routineFire";
import {
  getNextInAppAgentRoutineRunAt,
  parseInAppAgentRoutineSchedule,
} from "./schedule";

const ROUTINE_WRITE_SELECT = {
  id: true,
  projectId: true,
  createdByUserId: true,
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

type CreatedInAppAgentRoutine = Prisma.InAppAgentRoutineGetPayload<{
  select: typeof ROUTINE_WRITE_SELECT;
}>;

export async function createInAppAgentRoutine(params: {
  prisma: PrismaClient;
  projectId: string;
  userId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled?: boolean;
}): Promise<CreatedInAppAgentRoutine> {
  const count = await params.prisma.inAppAgentRoutine.count({
    where: {
      projectId: params.projectId,
      createdByUserId: params.userId,
    },
  });

  if (count >= IN_APP_AGENT_ROUTINE_MAX_PER_USER) {
    throw new InvalidRequestError(
      `You can save up to ${IN_APP_AGENT_ROUTINE_MAX_PER_USER} routines in this project.`,
    );
  }

  const schedule = parseInAppAgentRoutineSchedule({
    cron: params.cron,
    timezone: params.timezone,
  });
  const name = parseRoutineName(params.name);
  const prompt = parseRoutinePrompt(params.prompt);
  const now = new Date();

  return params.prisma.inAppAgentRoutine.create({
    data: {
      id: createInAppAgentRoutineId(),
      projectId: params.projectId,
      createdByUserId: params.userId,
      name,
      prompt,
      cron: schedule.cron,
      timezone: schedule.timezone,
      status: params.enabled
        ? InAppAgentRoutineStatus.ACTIVE
        : InAppAgentRoutineStatus.PAUSED,
      nextRunAt: getNextInAppAgentRoutineRunAt({
        cron: schedule.cron,
        timezone: schedule.timezone,
        after: now,
      }),
    },
    select: ROUTINE_WRITE_SELECT,
  });
}

export async function createAndTestInAppAgentRoutine(params: {
  prisma: PrismaClient;
  projectId: string;
  userId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
}) {
  const routine = await createInAppAgentRoutine(params);
  const test = await fireInAppAgentRoutine({
    prisma: params.prisma,
    routine,
  });

  return {
    type: "createAndTestRoutine" as const,
    routineId: routine.id,
    enabled: false,
    test,
  };
}

export function parseRoutineName(name: string) {
  const trimmed = name.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > IN_APP_AGENT_ROUTINE_NAME_MAX_LENGTH
  ) {
    throw new InvalidRequestError(
      `Name must be between 1 and ${IN_APP_AGENT_ROUTINE_NAME_MAX_LENGTH} characters`,
    );
  }

  return trimmed;
}

export function parseRoutinePrompt(prompt: string) {
  const trimmed = prompt.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > IN_APP_AGENT_ROUTINE_PROMPT_MAX_LENGTH
  ) {
    throw new InvalidRequestError(
      `Prompt must be between 1 and ${IN_APP_AGENT_ROUTINE_PROMPT_MAX_LENGTH} characters`,
    );
  }

  return trimmed;
}
