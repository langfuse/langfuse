import { instrumentAsync } from "../instrumentation";
import * as opentelemetry from "@opentelemetry/api";
import { env } from "../../env";
import { logger } from "../logger";

const executionWrapper = async <T, Y>(
  input: T,
  fn: (input: T) => Promise<Y>, // eslint-disable-line no-unused-vars
  span?: opentelemetry.Span,
  attributePrefix?: string,
): Promise<[Y, number]> => {
  const startTime = Date.now();
  const res = await fn(input);
  const duration = Date.now() - startTime;
  span?.setAttribute(`${attributePrefix}-duration`, duration);
  return [res, duration];
};

export const measureAndReturn = async <T, Y>(args: {
  operationName: string;
  projectId: string;
  input: T;
  existingExecution: (input: T) => Promise<Y>; // eslint-disable-line no-unused-vars
  newExecution: (input: T) => Promise<Y>; // eslint-disable-line no-unused-vars
}): Promise<Y> => {
  return instrumentAsync(
    {
      name: `experiment-${args.operationName}`,
      spanKind: opentelemetry.SpanKind.CLIENT,
    },
    async (currentSpan) => {
      const { input, existingExecution, newExecution } = args;

      if (
        env.LANGFUSE_EXPERIMENT_COMPARE_READ_FROM_AGGREGATING_MERGE_TREES !==
        "true"
      ) {
        currentSpan.setAttribute(`run-experiment`, "disabled");
        return existingExecution(input);
      }

      // If not whitelisted, apply sampling logic
      if (
        !env.LANGFUSE_EXPERIMENT_WHITELISTED_PROJECT_IDS.includes(
          args.projectId,
        ) &&
        Math.random() > env.LANGFUSE_EXPERIMENT_SAMPLING_RATE
      ) {
        currentSpan.setAttribute(`run-experiment`, "sampled-out");
        return existingExecution(input);
      }

      currentSpan.setAttribute(`run-experiment`, "true");

      try {
        const [[existingResult, existingDuration], [newResult, newDuration]] =
          await Promise.all([
            executionWrapper(input, existingExecution, currentSpan, "existing"),
            executionWrapper(input, newExecution, currentSpan, "new"),
          ]);
        // Positive duration difference means new is faster
        const durationDifference = existingDuration - newDuration;
        currentSpan?.setAttribute(
          "execution-time-difference",
          durationDifference,
        );

        if (
          env.LANGFUSE_EXPERIMENT_ADD_QUERY_RESULT_TO_SPAN_PROJECT_IDS.some(
            (p) => p === args.projectId,
          )
        ) {
          currentSpan?.setAttribute(
            "existing-result",
            JSON.stringify(existingResult),
          );
          currentSpan?.setAttribute("new-result", JSON.stringify(newResult));
        }

        return env.LANGFUSE_EXPERIMENT_RETURN_NEW_RESULT === "true"
          ? newResult
          : existingResult;
      } catch (e) {
        logger.error(
          "Failed to run experiment wrapper. Retrying existing query",
          e,
        );
        return existingExecution(input);
      }
    },
  );
};
