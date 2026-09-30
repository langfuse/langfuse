import { EventType } from "@ag-ui/core";

import { Role, type PrismaClient } from "../../db";
import {
  InAppAgentRoutineSkipReason,
  type InAppAgentRoutineSkipReason as RoutineSkipReason,
} from "../routines";
import { getInAppAgentModelConfig } from "./modelProvider";
import { createQueuedRun } from "./runLifecycle";
import { enqueueInAppAgentRun } from "./enqueueRun";
import {
  createInAppAgentConversationId,
  createInAppAgentMessageId,
  createInAppAgentRunId,
} from "./ids";
import {
  getNextInAppAgentRoutineRunAt,
  getPreviousInAppAgentRoutineRunAt,
} from "./schedule";
import {
  IN_APP_AGENT_HEARTBEAT_STALE_MS,
  IN_APP_AGENT_QUEUE_TIMEOUT_MS,
  IN_APP_AGENT_RUN_MAX_DURATION_MS,
} from "./tunables";

export type InAppAgentRoutineFireInput = {
  id: string;
  projectId: string;
  createdByUserId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
};

export type InAppAgentRoutineFireResult =
  | { status: "fired"; conversationId: string; runId: string }
  | { status: "skipped"; reason: RoutineSkipReason };

export async function fireInAppAgentRoutine(params: {
  prisma: PrismaClient;
  routine: InAppAgentRoutineFireInput;
  now?: Date;
}): Promise<InAppAgentRoutineFireResult> {
  const now = params.now ?? new Date();
  const skipReason = await getRoutineFireSkipReason({
    prisma: params.prisma,
    routine: params.routine,
  });

  if (skipReason) {
    await params.prisma.inAppAgentRoutine.update({
      where: {
        id_projectId: {
          id: params.routine.id,
          projectId: params.routine.projectId,
        },
      },
      data: { lastSkipReason: skipReason },
    });

    return { status: "skipped", reason: skipReason };
  }

  const modelConfig = getInAppAgentModelConfig();
  if (!modelConfig) {
    throw new Error("Assistant model is not configured.");
  }

  const conversationId = createInAppAgentConversationId();
  const runId = createInAppAgentRunId();
  const previousAt = getPreviousInAppAgentRoutineRunAt({
    cron: params.routine.cron,
    timezone: params.routine.timezone,
    before: now,
  });
  const message = buildRoutineUserMessage({
    name: params.routine.name,
    prompt: params.routine.prompt,
    firedAt: now,
    previousAt,
    timezone: params.routine.timezone,
  });

  await params.prisma.inAppAgentConversation.create({
    data: {
      id: conversationId,
      projectId: params.routine.projectId,
      createdByUserId: params.routine.createdByUserId,
      routineId: params.routine.id,
      title: formatRoutineConversationTitle(
        params.routine.name,
        now,
        params.routine.timezone,
      ),
    },
  });

  await createQueuedRun({
    prisma: params.prisma,
    runId,
    projectId: params.routine.projectId,
    conversationId,
    triggeredByUserId: params.routine.createdByUserId,
    model: modelConfig.modelId,
    request: { kind: "userMessage", context: [] },
    runStartedEvent: {
      type: EventType.RUN_STARTED,
      threadId: conversationId,
      runId,
      input: {
        threadId: conversationId,
        runId,
        state: null,
        messages: [
          {
            id: createInAppAgentMessageId(),
            role: "user",
            content: message,
          },
        ],
        tools: [],
        context: [],
        forwardedProps: {},
      },
    },
  });

  await enqueueInAppAgentRun({
    prisma: params.prisma,
    projectId: params.routine.projectId,
    runId,
  });

  await params.prisma.inAppAgentRoutine.update({
    where: {
      id_projectId: {
        id: params.routine.id,
        projectId: params.routine.projectId,
      },
    },
    data: {
      lastFiredAt: now,
      lastConversationId: conversationId,
      lastSkipReason: null,
    },
  });

  return { status: "fired", conversationId, runId };
}

export async function claimDueInAppAgentRoutine(params: {
  prisma: PrismaClient;
  projectId: string;
  routineId: string;
  dueNextRunAt: Date;
  cron: string;
  timezone: string;
  now: Date;
}): Promise<{ nextRunAt: Date } | null> {
  const nextRunAt = getNextInAppAgentRoutineRunAt({
    cron: params.cron,
    timezone: params.timezone,
    after: params.now,
  });

  const claimed = await params.prisma.inAppAgentRoutine.updateMany({
    where: {
      id: params.routineId,
      projectId: params.projectId,
      status: "ACTIVE",
      nextRunAt: params.dueNextRunAt,
    },
    data: { nextRunAt },
  });

  return claimed.count === 1 ? { nextRunAt } : null;
}

async function getRoutineFireSkipReason(params: {
  prisma: PrismaClient;
  routine: InAppAgentRoutineFireInput;
}): Promise<RoutineSkipReason | null> {
  const project = await params.prisma.project.findUnique({
    where: { id: params.routine.projectId },
    select: {
      orgId: true,
      deletedAt: true,
      organization: { select: { aiFeaturesEnabled: true } },
    },
  });

  if (
    !project ||
    project.deletedAt ||
    !project.organization.aiFeaturesEnabled
  ) {
    return InAppAgentRoutineSkipReason.MEMBERSHIP_LOST;
  }

  const membership = await getRoutineCreatorAccess({
    prisma: params.prisma,
    projectId: params.routine.projectId,
    orgId: project.orgId,
    userId: params.routine.createdByUserId,
  });

  if (!membership) {
    return InAppAgentRoutineSkipReason.MEMBERSHIP_LOST;
  }

  if (!getInAppAgentModelConfig()) {
    return InAppAgentRoutineSkipReason.MODEL_UNCONFIGURED;
  }

  const hasCapacity = await hasInAppAgentRunCapacity({
    prisma: params.prisma,
    orgId: project.orgId,
    userId: params.routine.createdByUserId,
  });

  if (!hasCapacity) {
    return InAppAgentRoutineSkipReason.CAPACITY;
  }

  return null;
}

async function getRoutineCreatorAccess(params: {
  prisma: PrismaClient;
  projectId: string;
  orgId: string;
  userId: string;
}): Promise<boolean> {
  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { admin: true },
  });

  if (!user) {
    return false;
  }

  if (user.admin) {
    return true;
  }

  const orgMembership = await params.prisma.organizationMembership.findFirst({
    where: { userId: params.userId, orgId: params.orgId },
  });

  if (!orgMembership) {
    return false;
  }

  const projectMembership = await params.prisma.projectMembership.findFirst({
    where: {
      userId: params.userId,
      projectId: params.projectId,
      orgMembershipId: orgMembership.id,
    },
  });

  const projectRole = projectMembership?.role ?? orgMembership.role;

  return projectRole !== Role.NONE;
}

async function hasInAppAgentRunCapacity(params: {
  prisma: PrismaClient;
  orgId: string;
  userId: string;
}): Promise<boolean> {
  const reconcilableBefore = new Date(
    Date.now() -
      IN_APP_AGENT_QUEUE_TIMEOUT_MS -
      IN_APP_AGENT_RUN_MAX_DURATION_MS,
  );
  const heartbeatAliveSince = new Date(
    Date.now() - IN_APP_AGENT_HEARTBEAT_STALE_MS,
  );

  const activeRunsByUser = await params.prisma.inAppAgentRun.groupBy({
    by: ["triggeredByUserId"],
    where: {
      project: { orgId: params.orgId },
      finishedAt: null,
      OR: [
        { createdAt: { gt: reconcilableBefore } },
        { heartbeatAt: { gt: heartbeatAliveSince } },
      ],
    },
    _count: { _all: true },
  });

  const orgActiveRuns = activeRunsByUser.reduce(
    (total, group) => total + group._count._all,
    0,
  );
  const userActiveRuns =
    activeRunsByUser.find((group) => group.triggeredByUserId === params.userId)
      ?._count._all ?? 0;

  return (
    userActiveRuns <
      getCapacityLimit("LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER", 5) &&
    orgActiveRuns <
      getCapacityLimit("LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_ORG", 20)
  );
}

function getCapacityLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function formatRoutineConversationTitle(
  name: string,
  date: Date,
  timezone: string,
): string {
  const datePart = date.toLocaleDateString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${name} · ${datePart}`;
}

export function buildRoutineUserMessage(params: {
  name: string;
  prompt: string;
  firedAt: Date;
  previousAt: Date;
  timezone: string;
}): string {
  const format = (value: Date) =>
    value.toLocaleString("en-US", {
      timeZone: params.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    });

  return `Scheduled run of "${params.name}" at ${format(params.firedAt)}. Previous slot: ${format(params.previousAt)}. Cover that interval unless the instruction says otherwise.\n\n${params.prompt}`;
}
