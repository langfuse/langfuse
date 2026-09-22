import { redis } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import type { InAppAgentScriptExecutionLimits } from "@langfuse/shared/in-app-agent";

export class SdkGatewayQuotaError extends Error {
  constructor(
    message: string,
    readonly statusCode: 429 | 409,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SdkGatewayQuotaError";
  }
}

export async function admitSdkGatewayRequest(params: {
  executionId: string;
  projectId: string;
  limits: InAppAgentScriptExecutionLimits;
  eventCount?: number;
}): Promise<void> {
  if (!redis) {
    throw new SdkGatewayQuotaError(
      "Gateway quota state is unavailable",
      409,
      false,
    );
  }

  const secondKey = `sdk-gateway:${params.executionId}:rps`;
  const concurrencyKey = `sdk-gateway:${params.executionId}:inflight`;

  const rate = await redis.incr(secondKey);
  if (rate === 1) {
    await redis.expire(secondKey, 1);
  }
  if (rate > params.limits.sdkRequestsPerSecond) {
    throw new SdkGatewayQuotaError("SDK request rate exceeded", 429, true);
  }

  const inflight = await redis.incr(concurrencyKey);
  if (inflight === 1) {
    await redis.expire(concurrencyKey, 120);
  }
  if (inflight > params.limits.sdkConcurrency) {
    await redis.decr(concurrencyKey);
    throw new SdkGatewayQuotaError("SDK concurrency exceeded", 429, true);
  }

  const updated = await prisma.inAppAgentScriptExecution.updateMany({
    where: {
      id: params.executionId,
      projectId: params.projectId,
      sdkRequestCount: { lt: params.limits.sdkRequests },
      ingestionEventCount: {
        lte: params.limits.ingestionEvents - (params.eventCount ?? 0),
      },
    },
    data: {
      sdkRequestCount: { increment: 1 },
      ...(params.eventCount
        ? { ingestionEventCount: { increment: params.eventCount } }
        : {}),
    },
  });

  if (updated.count === 0) {
    await redis.decr(concurrencyKey);
    throw new SdkGatewayQuotaError(
      "SDK request or event quota exhausted",
      409,
      false,
    );
  }
}

export async function releaseSdkGatewayConcurrency(executionId: string) {
  if (!redis) {
    return;
  }

  await redis.decr(`sdk-gateway:${executionId}:inflight`);
}

export async function admitModelAttempt(params: {
  executionId: string;
  projectId: string;
  limits: InAppAgentScriptExecutionLimits;
}): Promise<void> {
  if (!redis) {
    throw new SdkGatewayQuotaError(
      "Gateway quota state is unavailable",
      409,
      false,
    );
  }

  const minuteKey = `sdk-gateway:${params.executionId}:model-rpm`;
  const concurrencyKey = `sdk-gateway:${params.executionId}:model-inflight`;

  const rate = await redis.incr(minuteKey);
  if (rate === 1) {
    await redis.expire(minuteKey, 60);
  }
  if (rate > params.limits.modelRequestsPerMinute) {
    throw new SdkGatewayQuotaError("Model rate exceeded", 429, true);
  }

  const inflight = await redis.incr(concurrencyKey);
  if (inflight === 1) {
    await redis.expire(concurrencyKey, 120);
  }
  if (inflight > params.limits.modelConcurrency) {
    await redis.decr(concurrencyKey);
    throw new SdkGatewayQuotaError("Model concurrency exceeded", 429, true);
  }

  const updated = await prisma.inAppAgentScriptExecution.updateMany({
    where: {
      id: params.executionId,
      projectId: params.projectId,
      modelAttemptCount: { lt: params.limits.modelAttempts },
    },
    data: { modelAttemptCount: { increment: 1 } },
  });

  if (updated.count === 0) {
    await redis.decr(concurrencyKey);
    throw new SdkGatewayQuotaError("Model attempt quota exhausted", 409, false);
  }
}

export async function releaseModelConcurrency(executionId: string) {
  if (!redis) {
    return;
  }

  await redis.decr(`sdk-gateway:${executionId}:model-inflight`);
}
