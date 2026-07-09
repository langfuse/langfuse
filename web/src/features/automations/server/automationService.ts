import { TriggerEventSource, type TriggerDomain } from "@langfuse/shared";
import { type PrismaClient, type Trigger } from "@langfuse/shared/src/db";
import { getAutomationById } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

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
        "Event actions can only be toggled on project-notification automations.",
    });
  }

  const trigger = await prisma.trigger.update({
    where: {
      id: existingAutomation.trigger.id,
      projectId,
    },
    data: { eventActions },
  });

  return { previousTrigger: existingAutomation.trigger, trigger };
}
