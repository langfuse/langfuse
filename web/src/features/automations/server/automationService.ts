import {
  JobConfigState,
  TriggerEventSource,
  type TriggerDomain,
} from "@langfuse/shared";
import { type PrismaClient, type Trigger } from "@langfuse/shared/src/db";
import {
  getAutomationById,
  resetAutomationFailureCount,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

/** assertProjectNotificationAutomation loads an automation and guards it to the project-notification source. */
async function assertProjectNotificationAutomation({
  projectId,
  automationId,
}: {
  projectId: string;
  automationId: string;
}) {
  const existingAutomation = await getAutomationById({
    projectId,
    automationId,
  });

  if (!existingAutomation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Automation with id ${automationId} not found.`,
    });
  }

  if (
    existingAutomation.trigger.eventSource !==
    TriggerEventSource.ProjectNotification
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This operation is only supported on project-notification automations.",
    });
  }

  return existingAutomation;
}

/**
 * updateTriggerEventActions toggles which event types a project-notification
 * automation's trigger subscribes to. Restricted to the project-notification
 * event source — other sources manage eventActions through the full automation
 * update flow. Returns the previous trigger (for audit logging) and the
 * updated row.
 */
export async function updateTriggerEventActions({
  prisma,
  projectId,
  automationId,
  eventActions,
}: {
  prisma: PrismaClient;
  projectId: string;
  automationId: string;
  eventActions: string[];
}): Promise<{ previousTrigger: TriggerDomain; trigger: Trigger }> {
  const existingAutomation = await assertProjectNotificationAutomation({
    projectId,
    automationId,
  });

  const trigger = await prisma.trigger.update({
    where: {
      id: existingAutomation.trigger.id,
      projectId,
    },
    data: { eventActions },
  });

  return { previousTrigger: existingAutomation.trigger, trigger };
}

/**
 * reactivateProjectNotificationChannel flips a disabled channel's trigger back
 * to ACTIVE and resets its failure tracking so it doesn't instantly re-disable:
 * WEBHOOK advances the DB failure window to the latest execution (matching the
 * HTTP path's lastFailingExecutionId reset); SLACK clears the Redis counter
 * (Slack configs carry no lastFailingExecutionId — see webhooks.ts split).
 */
export async function reactivateProjectNotificationChannel({
  prisma,
  projectId,
  automationId,
}: {
  prisma: PrismaClient;
  projectId: string;
  automationId: string;
}): Promise<{ previousTrigger: TriggerDomain; trigger: Trigger }> {
  const existingAutomation = await assertProjectNotificationAutomation({
    projectId,
    automationId,
  });

  if (existingAutomation.action.type === "SLACK") {
    await resetAutomationFailureCount({ projectId, automationId });
  } else if (existingAutomation.action.type === "WEBHOOK") {
    const latestExecution = await prisma.automationExecution.findFirst({
      where: {
        projectId,
        triggerId: existingAutomation.trigger.id,
        actionId: existingAutomation.action.id,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latestExecution) {
      // Advance the failure window so getConsecutiveAutomationFailures counts
      // only executions after the re-enable. Patch just this JSON key to leave
      // the encrypted config untouched.
      await prisma.$executeRaw`
        UPDATE actions
        SET
          config = jsonb_set(
            config,
            '{lastFailingExecutionId}',
            to_jsonb(${latestExecution.id}::text),
            true
          ),
          updated_at = NOW()
        WHERE id = ${existingAutomation.action.id}
          AND project_id = ${projectId}
      `;
    }
  }

  const trigger = await prisma.trigger.update({
    where: {
      id: existingAutomation.trigger.id,
      projectId,
    },
    data: { status: JobConfigState.ACTIVE },
  });

  return { previousTrigger: existingAutomation.trigger, trigger };
}
