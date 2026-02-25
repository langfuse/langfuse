import {
  InternalServerError,
  PromptWebhookOutboundSchema,
  WebhookDefaultHeaders,
  ActionExecutionStatus,
  LangfuseNotFoundError,
  JobConfigState,
  isSlackActionConfig,
  isWebhookAction,
  isGitHubDispatchAction,
  type AutomationDomain,
  type ActionDomainWithSecrets,
} from "@langfuse/shared";
import { decrypt, createSignatureHeader } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  validateWebhookURL,
  whitelistFromEnv,
  fetchWithSecureRedirects,
} from "@langfuse/shared/src/server";
import {
  TQueueJobTypes,
  QueueName,
  WebhookInput,
  getAutomationById,
  getActionByIdWithSecrets,
  getActionById,
  getConsecutiveAutomationFailures,
  SlackService,
  logger,
} from "@langfuse/shared/src/server";
import { Processor, Job } from "bullmq";
import { backOff } from "exponential-backoff";
import { env } from "../env";
import { SlackMessageBuilder } from "../features/slack/slackMessageBuilder";

// Handles both webhook and slack actions
export const webhookProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.WebhookQueue]>,
) => {
  try {
    return await executeWebhook(job.data.payload);
  } catch (error) {
    logger.error("Error executing WebhookJob", error);
    throw error;
  }
};

// TODO: Webhook outgoing API versioning
export const executeWebhook = async (
  input: WebhookInput,
  options?: { skipValidation?: boolean },
) => {
  const { projectId, automationId } = input;

  try {
    logger.debug(`Executing action for automation ${automationId}`);

    const automation = await getAutomationById({
      projectId,
      automationId,
    });

    if (!automation) {
      logger.warn(
        `Automation ${automationId} not found for project ${projectId}. We ack the job and will not retry.`,
      );
      return;
    }

    // Route to appropriate handler based on action type
    if (automation.action.type === "WEBHOOK") {
      await executeWebhookAction({
        input,
        automation,
        skipValidation: options?.skipValidation,
      });
    } else if (automation.action.type === "SLACK") {
      await executeSlackAction({
        input,
        automation,
      });
    } else if (automation.action.type === "GITHUB_DISPATCH") {
      await executeGitHubDispatchAction({
        input,
        automation,
        skipValidation: options?.skipValidation,
      });
    } else {
      throw new InternalServerError(
        `Unsupported action type: ${automation.action.type}`,
      );
    }

    logger.debug(
      `Action executed successfully for action ${automation.action.id}`,
    );
  } catch (error) {
    logger.error("Error executing action", error);
    throw error;
  }
};

/**
 * Shared HTTP execution logic for webhook and GitHub dispatch actions
 * Handles: fetch with timeout, retry logic, status validation, execution tracking
 */
async function executeHttpAction({
  url,
  payload,
  headers,
  projectId,
  skipValidation,
  automation,
  executionId,
  executionStart,
  actionConfig,
}: {
  url: string;
  payload: string;
  headers: Record<string, string>;
  projectId: string;
  skipValidation?: boolean;
  automation: AutomationDomain;
  executionId: string;
  executionStart: Date;
  actionConfig: ActionDomainWithSecrets;
}): Promise<{ httpStatus: number; responseBody: string }> {
  let httpStatus: number | undefined;
  let responseBody: string | undefined;

  try {
    // Execute HTTP request with retries
    await backOff(
      async () => {
        logger.info(
          `Sending HTTP request to ${url} for action ${automation.action.id}`,
        );

        // Create AbortController for timeout
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          abortController.abort();
        }, env.LANGFUSE_WEBHOOK_TIMEOUT_MS);

        try {
          // Skip validation when flag is set (for tests with MSW mocking)
          if (!skipValidation) {
            await validateWebhookURL(url);
          }

          const redirectResult = await fetchWithSecureRedirects(
            url,
            {
              method: "POST",
              body: payload,
              headers,
              signal: abortController.signal,
            },
            {
              maxRedirects: env.LANGFUSE_WEBHOOK_MAX_REDIRECTS,
              skipValidation,
              whitelist: whitelistFromEnv(),
            },
          );

          const res = redirectResult.response;

          // Log redirect chain if any redirects occurred (security audit trail)
          if (redirectResult.redirectChain.length > 0) {
            logger.info("Webhook followed redirects", {
              actionId: automation.action.id,
              initialUrl: url,
              finalUrl: redirectResult.finalUrl,
              redirectCount: redirectResult.redirectChain.length,
              redirectChain: redirectResult.redirectChain,
            });
          }

          httpStatus = res.status;
          responseBody = await res.text();

          if (!res.ok) {
            logger.warn(
              `Webhook does not return 2xx status: failed with status ${res.status} for url ${url} and project ${projectId}. Body: ${responseBody}`,
            );
            throw new Error(
              `Webhook does not return 2xx status: failed with status ${res.status} for url ${url} and project ${projectId}`,
            );
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            logger.warn(
              `Webhook timeout after ${env.LANGFUSE_WEBHOOK_TIMEOUT_MS}ms for url ${url} and project ${projectId}`,
            );
            throw new Error(
              `Webhook timeout after ${env.LANGFUSE_WEBHOOK_TIMEOUT_MS}ms for url ${url} and project ${projectId}`,
            );
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        numOfAttempts: 4,
      },
    );

    // Update execution status on success
    await prisma.automationExecution.update({
      where: {
        projectId,
        triggerId: automation.trigger.id,
        actionId: automation.action.id,
        id: executionId,
      },
      data: {
        status: ActionExecutionStatus.COMPLETED,
        startedAt: executionStart,
        finishedAt: new Date(),
      },
    });

    return { httpStatus: httpStatus!, responseBody: responseBody! };
  } catch (error) {
    logger.error("Error executing HTTP action", error);

    // Handle action failure with retry logic and trigger disabling
    const shouldRetryJob =
      error instanceof LangfuseNotFoundError ||
      error instanceof InternalServerError;

    if (shouldRetryJob) {
      logger.warn(`Retrying BullMQ for action ${automation.action.id}`);
      throw error; // Trigger BullMQ retry
    }

    if (!actionConfig) {
      logger.error("Action config not found for failure handling");
      throw error;
    }

    // Update execution status and check if we should disable trigger
    await prisma.$transaction(async (tx) => {
      // Update execution status
      await tx.automationExecution.update({
        where: {
          id: executionId,
          projectId,
          triggerId: automation.trigger.id,
          actionId: automation.action.id,
        },
        data: {
          status: ActionExecutionStatus.ERROR,
          startedAt: executionStart,
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
          output: httpStatus
            ? {
                httpStatus,
                responseBody: responseBody?.substring(0, 1000),
              }
            : undefined,
        },
      });

      // Check consecutive failures from execution history
      const consecutiveFailures = await getConsecutiveAutomationFailures({
        automationId: automation.id,
        projectId,
      });

      logger.info(
        `Consecutive failures: ${consecutiveFailures} for trigger ${automation.trigger.id} in project ${projectId}`,
      );

      // Check if trigger should be disabled (this is the 5th failure, looking for 4 in the past.)
      if (consecutiveFailures >= 4) {
        // Update trigger to inactive status
        await tx.trigger.update({
          where: { id: automation.trigger.id, projectId },
          data: { status: JobConfigState.INACTIVE },
        });

        // Update action config to store the failing execution ID
        // Type guard to ensure we only update webhook or GitHub dispatch configs
        if (
          isWebhookAction(actionConfig) ||
          isGitHubDispatchAction(actionConfig)
        ) {
          await tx.action.update({
            where: { id: automation.action.id, projectId },
            data: {
              config: {
                ...actionConfig.config,
                lastFailingExecutionId: executionId,
              } as any, // Cast needed for Prisma Json type
            },
          });
        }

        logger.warn(
          `Automation ${automation.trigger.id} disabled after ${consecutiveFailures} consecutive failures in project ${projectId}`,
        );
      }
    });

    logger.debug(
      `HTTP action failed for action ${automation.action.id} in project ${projectId}`,
    );

    // Error has been handled - don't rethrow
    // Return empty response to indicate failure was handled
    return { httpStatus: httpStatus || 0, responseBody: responseBody || "" };
  }
}

/**
 * Execute webhook action with HTTP request and signature validation
 */
async function executeWebhookAction({
  input,
  automation,
  skipValidation,
}: {
  input: WebhookInput;
  automation: Awaited<ReturnType<typeof getAutomationById>>;
  skipValidation?: boolean;
}) {
  if (!automation) return;

  const { projectId, executionId } = input;
  const executionStart = new Date();

  const actionConfig = await getActionByIdWithSecrets({
    projectId,
    actionId: automation.action.id,
  });

  if (!actionConfig) {
    throw new InternalServerError("Action config not found");
  }

  if (!isWebhookAction(actionConfig)) {
    throw new InternalServerError(
      "Action config is not a valid webhook configuration",
    );
  }

  const webhookConfig = actionConfig.config;
  const webhookUser = input.payload.user
    ? {
        name: input.payload.user.name,
        email: input.payload.user.email,
      }
    : undefined;

  // Validate and prepare webhook payload
  const validatedPayload = PromptWebhookOutboundSchema.safeParse({
    id: input.executionId,
    timestamp: new Date(),
    type: input.payload.type,
    apiVersion: "v1",
    action: input.payload.action,
    prompt: input.payload.prompt,
    user: webhookUser,
  });

  if (!validatedPayload.success) {
    throw new InternalServerError(
      `Invalid webhook payload: ${validatedPayload.error.message}`,
    );
  }

  // Prepare webhook payload with prompt always last
  const { prompt, user, ...otherFields } = validatedPayload.data;
  const webhookPayload = JSON.stringify({
    ...otherFields,
    ...(user ? { user } : {}),
    prompt,
  });

  // Prepare headers with signature if secret exists
  const requestHeaders: Record<string, string> = {};

  // Add webhook config headers first
  if (webhookConfig.requestHeaders) {
    for (const [key, value] of Object.entries(webhookConfig.requestHeaders)) {
      requestHeaders[key] = value.value;
    }
  }

  // Add default headers with precedence
  for (const [key, value] of Object.entries(WebhookDefaultHeaders)) {
    requestHeaders[key] = value;
  }

  try {
    const decryptedSecret = decrypt(webhookConfig.secretKey);
    const signature = createSignatureHeader(webhookPayload, decryptedSecret);
    requestHeaders["x-langfuse-signature"] = signature;
  } catch (error) {
    logger.error(
      "Failed to decrypt webhook secret or generate signature",
      error,
    );
    throw new InternalServerError("Failed to generate webhook signature");
  }

  // Execute HTTP request using shared function
  await executeHttpAction({
    url: webhookConfig.url,
    payload: webhookPayload,
    headers: requestHeaders,
    projectId,
    skipValidation,
    automation,
    executionId,
    executionStart,
    actionConfig,
  });
}

/**
 * Execute GitHub Dispatch action with repository dispatch API
 */
async function executeGitHubDispatchAction({
  input,
  automation,
  skipValidation,
}: {
  input: WebhookInput;
  automation: Awaited<ReturnType<typeof getAutomationById>>;
  skipValidation?: boolean;
}) {
  if (!automation) return;

  const { projectId, executionId } = input;
  const executionStart = new Date();

  const actionConfig = await getActionByIdWithSecrets({
    projectId,
    actionId: automation.action.id,
  });

  if (!actionConfig) {
    throw new InternalServerError("Action config not found");
  }

  if (!isGitHubDispatchAction(actionConfig)) {
    throw new InternalServerError(
      "Action config is not a valid GitHub dispatch configuration",
    );
  }

  const githubConfig = actionConfig.config;
  const webhookUser = input.payload.user
    ? {
        name: input.payload.user.name,
        email: input.payload.user.email,
      }
    : undefined;

  // Validate and prepare Langfuse payload
  const validatedPayload = PromptWebhookOutboundSchema.safeParse({
    id: input.executionId,
    timestamp: new Date(),
    type: input.payload.type,
    apiVersion: "v1",
    action: input.payload.action,
    prompt: input.payload.prompt,
    user: webhookUser,
  });

  if (!validatedPayload.success) {
    throw new InternalServerError(
      `Invalid webhook payload: ${validatedPayload.error.message}`,
    );
  }

  // Use configured event_type (required field)
  const eventType = githubConfig.eventType;

  // Transform to GitHub dispatch format
  const { prompt, user, ...otherFields } = validatedPayload.data;
  const githubPayload = JSON.stringify({
    event_type: eventType,
    client_payload: {
      ...otherFields,
      ...(user ? { user } : {}),
      prompt,
    },
  });

  // Prepare headers with GitHub token
  const requestHeaders: Record<string, string> = {};

  // Add default headers
  for (const [key, value] of Object.entries(WebhookDefaultHeaders)) {
    requestHeaders[key] = value;
  }

  try {
    const decryptedToken = decrypt(githubConfig.githubToken);

    // Add GitHub token as Bearer auth
    requestHeaders["Authorization"] = `Bearer ${decryptedToken}`;

    // Add signature for optional verification (using GitHub token as secret)
    const signature = createSignatureHeader(githubPayload, decryptedToken);
    requestHeaders["x-langfuse-signature"] = signature;
  } catch (error) {
    logger.error("Failed to decrypt GitHub token or generate signature", error);
    throw new InternalServerError("Failed to generate GitHub authentication");
  }

  // Execute HTTP request using shared function
  await executeHttpAction({
    url: githubConfig.url,
    payload: githubPayload,
    headers: requestHeaders,
    projectId,
    skipValidation,
    automation,
    executionId,
    executionStart,
    actionConfig,
  });
}

/**
 * Execute Slack action with message sending via SlackService
 */
async function executeSlackAction({
  input,
  automation,
}: {
  input: WebhookInput;
  automation: Awaited<ReturnType<typeof getAutomationById>>;
}) {
  if (!automation) return;

  const { projectId, executionId } = input;
  const executionStart = new Date();

  try {
    const actionConfig = await getActionById({
      projectId,
      actionId: automation.action.id,
    });

    if (!actionConfig) {
      throw new InternalServerError("Action config not found");
    }

    if (!isSlackActionConfig(actionConfig.config)) {
      throw new InternalServerError(
        "Action config is not a valid Slack configuration",
      );
    }

    const slackConfig = actionConfig.config;

    // Build message blocks using predefined formats or custom template
    let blocks: any[] = [];

    // TODO: Custom templates not supported via the UI yet
    if (slackConfig.messageTemplate) {
      try {
        blocks = JSON.parse(slackConfig.messageTemplate);
        logger.debug(
          `Using custom message template for action ${automation.action.id}`,
        );
      } catch (error) {
        logger.warn(
          `Invalid Slack messageTemplate JSON for action ${automation.action.id}. Using default format`,
          { error: error instanceof Error ? error.message : "Unknown error" },
        );
      }
    }

    // Use predefined message format if no custom template or template failed
    if (blocks.length === 0) {
      blocks = SlackMessageBuilder.buildMessage(input.payload);
      logger.debug(
        `Using predefined message format for action ${automation.action.id}`,
      );
    }

    // Get Slack WebClient for project via centralized SlackService
    const client =
      await SlackService.getInstance().getWebClientForProject(projectId);

    // Send message
    const sendResult = await SlackService.getInstance().sendMessage({
      client,
      channelId: slackConfig.channelId,
      blocks,
      text: "Langfuse Notification",
    });

    // Update execution status to completed
    await prisma.automationExecution.update({
      where: {
        projectId,
        triggerId: automation.trigger.id,
        actionId: automation.action.id,
        id: executionId,
      },
      data: {
        status: ActionExecutionStatus.COMPLETED,
        startedAt: executionStart,
        finishedAt: new Date(),
        output: {
          channel: sendResult.channel,
          messageTs: sendResult.messageTs,
        },
      },
    });
  } catch (error) {
    logger.error("Error executing Slack action", error);

    // Get action config for updating in case of failure
    const failureActionConfig = await getActionByIdWithSecrets({
      projectId,
      actionId: automation.action.id,
    });

    if (!failureActionConfig) {
      logger.error("Action config not found for failure handling");
      return;
    }

    // Update execution status and disable trigger
    await prisma.$transaction(async (tx) => {
      // Update execution status
      await tx.automationExecution.update({
        where: {
          id: executionId,
          projectId,
          triggerId: automation.trigger.id,
          actionId: automation.action.id,
        },
        data: {
          status: ActionExecutionStatus.ERROR,
          startedAt: executionStart,
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      // Update trigger to inactive status
      await tx.trigger.update({
        where: { id: automation.trigger.id, projectId },
        data: { status: JobConfigState.INACTIVE },
      });

      // Update action config to store the failing execution ID
      await tx.action.update({
        where: { id: automation.action.id, projectId },
        data: {
          config: {
            ...failureActionConfig.config,
            lastFailingExecutionId: executionId,
          },
        },
      });

      logger.warn(
        `Automation ${automation.trigger.id} disabled after 1 failure in project ${projectId}`,
      );
    });

    logger.debug(
      `Slack action failed for action ${automation.action.id} in project ${projectId}`,
    );
  }
}
