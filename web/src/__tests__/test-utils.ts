import {
  EvalExecutionQueue,
  LLMAsJudgeExecutionQueue,
  SecondaryEvalExecutionQueue,
  SecondaryIngestionQueue,
  SecondaryOtelIngestionQueue,
  createBasicAuthHeader,
  getQueue,
  IngestionQueue,
  logger,
  OtelIngestionQueue,
  QueueName,
  TraceUpsertQueue,
} from "@langfuse/shared/src/server";
import { type z } from "zod";

export const getQueues = () => {
  const queues: string[] = Object.values(QueueName);
  queues.push(
    ...IngestionQueue.getShardNames(),
    ...SecondaryIngestionQueue.getShardNames(),
    ...EvalExecutionQueue.getShardNames(),
    ...SecondaryEvalExecutionQueue.getShardNames(),
    ...LLMAsJudgeExecutionQueue.getShardNames(),
    ...OtelIngestionQueue.getShardNames(),
    ...SecondaryOtelIngestionQueue.getShardNames(),
    ...TraceUpsertQueue.getShardNames(),
  );

  const listOfQueuesToIgnore = [
    QueueName.DataRetentionQueue,
    QueueName.BlobStorageIntegrationQueue,
    QueueName.DeadLetterRetryQueue,
    QueueName.PostHogIntegrationQueue,
    QueueName.CloudFreeTierUsageThresholdQueue,
  ];

  return queues
    .filter(
      (queueName) => !listOfQueuesToIgnore.includes(queueName as QueueName),
    )
    .map((queueName) =>
      queueName.startsWith(QueueName.IngestionQueue)
        ? IngestionQueue.getInstance({ shardName: queueName })
        : queueName.startsWith(QueueName.IngestionSecondaryQueue)
          ? SecondaryIngestionQueue.getInstance({ shardName: queueName })
          : queueName.startsWith(QueueName.EvaluationExecution)
            ? EvalExecutionQueue.getInstance({ shardName: queueName })
            : queueName.startsWith(QueueName.EvaluationExecutionSecondaryQueue)
              ? SecondaryEvalExecutionQueue.getInstance({
                  shardName: queueName,
                })
              : queueName.startsWith(QueueName.LLMAsJudgeExecution)
                ? LLMAsJudgeExecutionQueue.getInstance({
                    shardName: queueName,
                  })
                : queueName.startsWith(QueueName.TraceUpsert)
                  ? TraceUpsertQueue.getInstance({ shardName: queueName })
                  : queueName.startsWith(QueueName.OtelIngestionSecondaryQueue)
                    ? SecondaryOtelIngestionQueue.getInstance({
                        shardName: queueName,
                      })
                    : queueName.startsWith(QueueName.OtelIngestionQueue)
                      ? OtelIngestionQueue.getInstance({
                          shardName: queueName,
                        })
                      : getQueue(
                          queueName as Exclude<
                            QueueName,
                            | QueueName.IngestionQueue
                            | QueueName.IngestionSecondaryQueue
                            | QueueName.EvaluationExecution
                            | QueueName.EvaluationExecutionSecondaryQueue
                            | QueueName.LLMAsJudgeExecution
                            | QueueName.TraceUpsert
                            | QueueName.OtelIngestionQueue
                            | QueueName.OtelIngestionSecondaryQueue
                          >,
                        ),
    );
};

export const disconnectQueues = async (disconnectTimeoutMs = 2_000) => {
  await Promise.all(
    getQueues().map(async (queue) => {
      if (queue) {
        let timeoutId: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            queue.disconnect(),
            new Promise<void>((resolve) => {
              timeoutId = setTimeout(resolve, disconnectTimeoutMs);
            }),
          ]);
        } catch (error) {
          logger.error(`Error disconnecting queue ${queue.name}: ${error}`);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
    }),
  );
};

export type IngestionAPIResponse = {
  errors: ErrorIngestion[];
  successes: SuccessfulIngestion[];
};

export type SuccessfulIngestion = {
  id: string;
  status: number;
};

export type ErrorIngestion = {
  id: string;
  status: number;
  message: string;
  error: string;
};

export async function makeAPICall<T = IngestionAPIResponse>(
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  auth?: string,
  customHeaders?: Record<string, string>,
): Promise<{ body: T; status: number }> {
  const finalUrl = `http://localhost:3000${url.startsWith("/") ? url : `/${url}`}`;
  const authorization =
    auth || createBasicAuthHeader("pk-lf-1234567890", "sk-lf-1234567890");
  const options = {
    method: method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: authorization,
      ...customHeaders,
    },
    ...(method !== "GET" &&
      body !== undefined && { body: JSON.stringify(body) }),
  };
  const response = await fetch(finalUrl, options);

  // Handle 204 No Content - no body to parse
  if (response.status === 204) {
    return { body: {} as T, status: response.status };
  }

  // Clone the response before attempting to parse JSON
  const clonedResponse = response.clone();

  try {
    const responseBody = (await response.json()) as T;
    return { body: responseBody, status: response.status };
  } catch (error) {
    // Handle JSON parsing errors using the cloned response
    const responseText = await clonedResponse.text();
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}. Response status: ${response.status}. Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}. Response text: ${responseText}. Method: ${method}, URL: ${finalUrl}, Request body: ${body ? JSON.stringify(body) : "none"}`,
    );
  }
}

export async function makeZodVerifiedAPICall<T extends z.ZodType>(
  responseZodSchema: T,
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  auth?: string,
  statusCode = 200,
): Promise<{ body: z.infer<T>; status: number }> {
  const { body: resBody, status } = await makeAPICall(method, url, body, auth);
  if (status !== statusCode) {
    throw new Error(
      `API call did not return ${statusCode}, returned status ${status}, body ${JSON.stringify(resBody)}`,
    );
  }
  const typeCheckResult = responseZodSchema.safeParse(resBody);
  if (!typeCheckResult.success) {
    console.error(typeCheckResult.error);
    throw new Error(
      `API call (${method} ${url}) did not return valid response, returned status ${status}, body ${JSON.stringify(resBody)}, error ${typeCheckResult.error}`,
    );
  }
  return { body: resBody, status };
}

export async function makeZodVerifiedAPICallSilent<T extends z.ZodType>(
  responseZodSchema: T,
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  auth?: string,
): Promise<{ body: z.infer<T>; status: number }> {
  const { body: resBody, status } = await makeAPICall(method, url, body, auth);

  if (status === 200) {
    const typeCheckResult = responseZodSchema.safeParse(resBody);
    if (!typeCheckResult.success) {
      console.error(typeCheckResult.error);
      throw new Error(
        `API call (${method} ${url}) did not return valid response, returned status ${status}, body ${JSON.stringify(resBody)}, error ${typeCheckResult.error}`,
      );
    }
  }

  return { body: resBody, status };
}
