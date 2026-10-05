import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod";
import {
  ActionCreateSchema,
  ActionType,
  JobConfigState,
  singleFilterList,
  isWebhookActionConfig,
  TriggerEventSource,
  TriggerEventSourceSchema,
  ProjectNotificationEventTypeSchema,
  type FilterState,
} from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import { v4 } from "uuid";
import {
  convertActionToDomain,
  getAutomations,
  getAutomationById,
  getConsecutiveAutomationFailures,
  logger,
} from "@langfuse/shared/src/server";
import { generateWebhookSecret, encrypt } from "@langfuse/shared/encryption";
import { processWebhookActionConfig } from "./webhookHelpers";
import { processGitHubDispatchActionConfig } from "./githubDispatchHelpers";
import { updateTriggerEventActions } from "./automationService";
import { TRPCError } from "@trpc/server";
import { auditLog } from "@/src/features/audit-logs/server";

const CreateAutomationInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Name is required"),
  eventSource: z.string(),
  eventAction: z.array(z.string()),
  filter: singleFilterList.nullable(),
  status: z.enum(JobConfigState).default(JobConfigState.ACTIVE),
  // Action fields
  actionType: z.enum(ActionType),
  actionConfig: ActionCreateSchema,
});

const UpdateAutomationInputSchema = CreateAutomationInputSchema.extend({
  automationId: z.string(),
});

const validateScoreAnnotationAutomation = async ({
  prisma,
  projectId,
  eventSource,
  actionConfig,
  actionType,
  filter,
  eventActions,
}: {
  prisma: PrismaClient;
  projectId: string;
  eventSource: TriggerEventSource;
  actionConfig: z.infer<typeof ActionCreateSchema>;
  actionType: z.infer<typeof CreateAutomationInputSchema>["actionType"];
  filter: FilterState | null;
  eventActions: string[];
}) => {
  if (actionType !== actionConfig.type) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Action type does not match the action configuration.",
    });
  }
  const isScoreTrigger = eventSource === TriggerEventSource.Score;
  const isAnnotationQueueAction = actionConfig.type === "ANNOTATION_QUEUE";

  if (isScoreTrigger !== isAnnotationQueueAction) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Score triggers must use an annotation queue action, and annotation queue actions must use a score trigger.",
    });
  }
  if (!isScoreTrigger) return;
  if (actionConfig.type !== "ANNOTATION_QUEUE") return;
  if (
    eventActions.length === 0 ||
    eventActions.some((action) => action === "deleted")
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Score triggers support created and updated score events.",
    });
  }

  const filters = filter ?? [];
  const nameFilter = filters.find((item) => item.column === "name");
  const dataTypeFilter = filters.find((item) => item.column === "dataType");
  const allowedColumns = new Set([
    "name",
    "dataType",
    "value",
    "stringValue",
    "longStringValue",
  ]);

  const uniqueColumns = new Set(filters.map((item) => item.column));
  if (
    filters.length < 2 ||
    filters.length > 3 ||
    uniqueColumns.size !== filters.length ||
    filters.some((item) => !allowedColumns.has(item.column)) ||
    nameFilter?.type !== "string" ||
    nameFilter.operator !== "=" ||
    typeof nameFilter.value !== "string" ||
    dataTypeFilter?.type !== "string" ||
    dataTypeFilter.operator !== "=" ||
    typeof dataTypeFilter.value !== "string"
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid score trigger configuration.",
    });
  }

  const scoreConfig = await prisma.scoreConfig.findFirst({
    where: {
      projectId,
      name: nameFilter.value,
      dataType: dataTypeFilter.value as
        | "NUMERIC"
        | "BOOLEAN"
        | "CATEGORICAL"
        | "TEXT",
    },
    select: { id: true, dataType: true, categories: true },
  });
  if (!scoreConfig) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "The selected score configuration was not found.",
    });
  }

  const valueFilters = filters.filter((item) =>
    ["value", "stringValue", "longStringValue"].includes(item.column),
  );
  const expectedValueColumn =
    scoreConfig.dataType === "NUMERIC" || scoreConfig.dataType === "BOOLEAN"
      ? "value"
      : scoreConfig.dataType === "TEXT"
        ? "longStringValue"
        : "stringValue";
  const valueFilter = valueFilters[0];
  if (
    valueFilters.length > 1 ||
    (valueFilter &&
      (valueFilter.column !== expectedValueColumn ||
        valueFilter.operator !== "=" ||
        (expectedValueColumn === "value"
          ? valueFilter.type !== "number" ||
            typeof valueFilter.value !== "number" ||
            !Number.isFinite(valueFilter.value) ||
            (scoreConfig.dataType === "BOOLEAN" &&
              valueFilter.value !== 0 &&
              valueFilter.value !== 1)
          : valueFilter.type !== "string" ||
            typeof valueFilter.value !== "string")))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid score trigger value.",
    });
  }

  if (
    scoreConfig.dataType === "CATEGORICAL" &&
    valueFilter?.type === "string" &&
    !z
      .array(z.object({ label: z.string(), value: z.number() }))
      .catch([])
      .parse(scoreConfig.categories)
      .some((category) => category.label === valueFilter.value)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The selected categorical score value does not exist.",
    });
  }

  const queueCount = await prisma.annotationQueue.count({
    where: {
      projectId,
      id: { in: actionConfig.queueIds },
    },
  });
  if (queueCount !== new Set(actionConfig.queueIds).size) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "One or more selected annotation queues were not found.",
    });
  }
};

export const automationsRouter = createTRPCRouter({
  // Get automations that were recently auto-disabled due to failures
  getCountOfConsecutiveFailures: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        automationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const recentlyDisabled = await getConsecutiveAutomationFailures({
        automationId: input.automationId,
        projectId: input.projectId,
      });

      return { count: recentlyDisabled };
    }),

  // Regenerate webhook secret for an automation
  regenerateWebhookSecret: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        actionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      // Read the raw row rather than going through getActionById: that returns
      // the sanitized config (no `headers`/`requestHeaders`), and writing it
      // back would silently drop the automation's custom request headers.
      const existingAction = await ctx.prisma.action.findFirst({
        where: { id: input.actionId, projectId: input.projectId },
      });

      if (!existingAction || existingAction.type !== "WEBHOOK") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Action with id ${input.actionId} not found.`,
        });
      }

      if (!isWebhookActionConfig(existingAction.config)) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Invalid webhook configuration for action ${input.actionId}`,
        });
      }

      const existingConfig = existingAction.config;

      // Generate new webhook secret
      const { secretKey: newSecretKey, displaySecretKey: newDisplaySecretKey } =
        generateWebhookSecret();

      await auditLog({
        session: ctx.session,
        resourceType: "action",
        resourceId: input.actionId,
        action: "update",
        before: {
          displaySecretKey: existingConfig.displaySecretKey,
        },
        after: {
          displaySecretKey: newDisplaySecretKey,
        },
      });

      // Keep the rest of the stored config (custom headers included) and only
      // rotate the signing secret. Header values stay encrypted as stored.
      const updatedConfig = {
        ...existingConfig,
        secretKey: encrypt(newSecretKey),
        displaySecretKey: newDisplaySecretKey,
      };

      await ctx.prisma.action.update({
        where: { id: input.actionId, projectId: ctx.session.projectId },
        data: { config: updatedConfig },
      });

      return {
        displaySecretKey: newDisplaySecretKey,
        webhookSecret: newSecretKey, // Return full secret for one-time display
      };
    }),

  getAutomations: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        eventSource: TriggerEventSourceSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const automations = await getAutomations({
        projectId: input.projectId,
        eventSource: input.eventSource,
      });

      // Project-notification channels are managed from project settings, not
      // the general Automations UI. When no eventSource is requested (the
      // general list), exclude them so they don't leak into that view.
      if (input.eventSource) {
        return automations;
      }
      return automations.filter(
        (automation) =>
          automation.trigger.eventSource !==
          TriggerEventSource.ProjectNotification,
      );
    }),

  // Get a single automation by automation ID
  getAutomation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        automationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      const automation = await getAutomationById({
        projectId: input.projectId,
        automationId: input.automationId,
      });

      if (!automation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Automation with id ${input.automationId} not found.`,
        });
      }

      return automation;
    }),

  // Get execution history for an automation
  getAutomationExecutions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        automationId: z.string(),
        page: z.number().min(0).default(0),
        limit: z.number().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has at least read access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      // First get the automation to extract triggerId and actionId
      const automation = await getAutomationById({
        projectId: input.projectId,
        automationId: input.automationId,
      });

      if (!automation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Automation with id ${input.automationId} not found.`,
        });
      }

      const executions = await ctx.prisma.automationExecution.findMany({
        where: {
          projectId: ctx.session.projectId,
          triggerId: automation.trigger.id,
          actionId: automation.action.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: input.page * input.limit,
        take: input.limit,
      });

      const totalCount = await ctx.prisma.automationExecution.count({
        where: {
          projectId: ctx.session.projectId,
          triggerId: automation.trigger.id,
          actionId: automation.action.id,
        },
      });

      return {
        executions,
        totalCount,
      };
    }),

  // Combined route that creates both an action and a trigger
  createAutomation: protectedProjectProcedure
    .input(CreateAutomationInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      await validateScoreAnnotationAutomation({
        prisma: ctx.prisma,
        projectId: input.projectId,
        eventSource: TriggerEventSourceSchema.parse(input.eventSource),
        actionConfig: input.actionConfig,
        actionType: input.actionType,
        filter: input.filter,
        eventActions: input.eventAction,
      });

      const triggerId = v4();
      const actionId = v4();

      // Build action config depending on action type
      let finalActionConfig = input.actionConfig;
      let newUnencryptedWebhookSecret: string | undefined = undefined;

      if (input.actionType === "WEBHOOK") {
        const webhookResult = await processWebhookActionConfig({
          actionConfig: input.actionConfig,
          projectId: input.projectId,
        });
        finalActionConfig = webhookResult.finalActionConfig;
        newUnencryptedWebhookSecret = webhookResult.newUnencryptedWebhookSecret;
      } else if (input.actionType === "SLACK") {
        // Validate that Slack integration exists for this project
        const slackIntegration = await ctx.prisma.slackIntegration.findUnique({
          where: { projectId: input.projectId },
        });

        if (!slackIntegration) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Slack integration not found. Please connect your Slack workspace first.",
          });
        }
      } else if (input.actionType === "GITHUB_DISPATCH") {
        const githubResult = await processGitHubDispatchActionConfig({
          actionConfig: input.actionConfig,
          projectId: input.projectId,
        });
        finalActionConfig = githubResult.finalActionConfig;
        newUnencryptedWebhookSecret = githubResult.githubToken;
      }

      const [trigger, action, automation] = await ctx.prisma.$transaction(
        async (tx) => {
          const trigger = await tx.trigger.create({
            data: {
              id: triggerId,
              projectId: ctx.session.projectId,
              eventSource: input.eventSource,
              eventActions: input.eventAction,
              filter: input.filter || [],
              status: input.status,
            },
          });

          // First create the action
          const action = await tx.action.create({
            data: {
              id: actionId,
              projectId: ctx.session.projectId,
              type: input.actionType,
              config: finalActionConfig,
            },
          });

          // Create the automation
          const automation = await tx.automation.create({
            data: {
              projectId: ctx.session.projectId,
              triggerId: triggerId,
              actionId: actionId,
              name: input.name,
            },
          });

          return [trigger, action, automation];
        },
      );

      await auditLog({
        session: ctx.session,
        resourceType: "automation",
        resourceId: trigger.id,
        action: "create",
        before: undefined,
        after: {
          automation,
          action: action,
          trigger: trigger,
        },
      });

      logger.info(`Created automation ${trigger.id} for action ${action.id}`);

      return {
        action: convertActionToDomain(action),
        trigger,
        automation,
        webhookSecret: newUnencryptedWebhookSecret, // Return webhook secret at top level for one-time display
      };
    }),

  updateAutomation: protectedProjectProcedure
    .input(UpdateAutomationInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const existingAutomation = await getAutomationById({
        projectId: input.projectId,
        automationId: input.automationId,
      });

      if (!existingAutomation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Automation with id ${input.automationId} not found.`,
        });
      }

      await validateScoreAnnotationAutomation({
        prisma: ctx.prisma,
        projectId: input.projectId,
        eventSource: TriggerEventSourceSchema.parse(input.eventSource),
        actionConfig: input.actionConfig,
        actionType: input.actionType,
        filter: input.filter,
        eventActions: input.eventAction,
      });

      let finalActionConfig = input.actionConfig;

      if (input.actionType === "WEBHOOK") {
        const webhookResult = await processWebhookActionConfig({
          actionConfig: input.actionConfig,
          actionId: existingAutomation.action.id,
          projectId: input.projectId,
        });
        finalActionConfig = webhookResult.finalActionConfig;
      } else if (input.actionType === "SLACK") {
        // Validate that Slack integration exists for this project
        const slackIntegration = await ctx.prisma.slackIntegration.findUnique({
          where: { projectId: input.projectId },
        });

        if (!slackIntegration) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Slack integration not found. Please connect your Slack workspace first.",
          });
        }
      } else if (input.actionType === "GITHUB_DISPATCH") {
        const githubResult = await processGitHubDispatchActionConfig({
          actionConfig: input.actionConfig,
          actionId: existingAutomation.action.id,
          projectId: input.projectId,
        });
        finalActionConfig = githubResult.finalActionConfig;
      }

      const [action, trigger, automation] = await ctx.prisma.$transaction(
        async (tx) => {
          // Update the action
          const action = await tx.action.update({
            where: {
              id: existingAutomation.action.id,
              projectId: ctx.session.projectId,
            },
            data: {
              type: input.actionType,
              config: finalActionConfig,
            },
          });

          // Update the trigger
          const trigger = await tx.trigger.update({
            where: {
              id: existingAutomation.trigger.id,
              projectId: ctx.session.projectId,
            },
            data: {
              eventSource: input.eventSource,
              eventActions: input.eventAction,
              filter: input.filter || [],
              status: input.status,
            },
          });

          // Update the automation name in Automation
          await tx.automation.update({
            where: {
              id: input.automationId,
              projectId: ctx.session.projectId,
            },
            data: {
              name: input.name,
            },
          });

          const automation = await tx.automation.findFirst({
            where: {
              id: input.automationId,
              projectId: ctx.session.projectId,
            },
          });

          return [action, trigger, automation];
        },
      );

      await auditLog({
        session: ctx.session,
        resourceType: "automation",
        resourceId: trigger.id,
        action: "update",
        before: {
          automation: existingAutomation,
          action: existingAutomation.action,
          trigger: existingAutomation.trigger,
        },
        after: {
          automation: automation,
          action: action,
          trigger: trigger,
        },
      });

      return {
        action: convertActionToDomain(action),
        trigger,
        automation,
      };
    }),

  // Toggle which project-notification events a channel receives. Narrow
  // update on trigger.eventActions only, so the action config (and webhook
  // secrets) is never round-tripped through the client.
  updateTriggerEventActions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        automationId: z.string(),
        eventActions: z.array(ProjectNotificationEventTypeSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const { previousTrigger, trigger } = await updateTriggerEventActions({
        prisma: ctx.prisma,
        projectId: input.projectId,
        automationId: input.automationId,
        eventActions: input.eventActions,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "automation",
        resourceId: trigger.id,
        action: "update",
        before: { trigger: previousTrigger },
        after: { trigger },
      });

      return { trigger };
    }),

  // Delete an automation (both trigger and action)
  deleteAutomation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        automationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user has create/update/delete access to automations
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const existingAutomation = await getAutomationById({
        projectId: input.projectId,
        automationId: input.automationId,
      });

      if (!existingAutomation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Automation with id ${input.automationId} not found.`,
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.automation.delete({
          where: {
            id: input.automationId,
            projectId: ctx.session.projectId,
          },
        });

        await tx.automationExecution.deleteMany({
          where: {
            triggerId: existingAutomation.trigger.id,
            actionId: existingAutomation.action.id,
          },
        });

        await tx.action.delete({
          where: {
            id: existingAutomation.action.id,
            projectId: ctx.session.projectId,
          },
        });

        await tx.trigger.delete({
          where: {
            id: existingAutomation.trigger.id,
            projectId: ctx.session.projectId,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "automation",
          resourceId: input.automationId,
          action: "delete",
          before: existingAutomation,
        });
      });
    }),

  count: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:read",
      });

      // Exclude project-notification channels from the general Automations
      // header count (they live in project settings, not this UI).
      const count = await ctx.prisma.action.count({
        where: {
          projectId: input.projectId,
          automations: {
            none: {
              trigger: {
                eventSource: TriggerEventSource.ProjectNotification,
              },
            },
          },
        },
      });

      return count;
    }),
});
