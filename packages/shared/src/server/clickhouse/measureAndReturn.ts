import { instrumentAsync } from "../instrumentation";
import * as opentelemetry from "@opentelemetry/api";
import { env } from "../../env";
import { logger } from "../logger";

const executionWrapper = async <T, Y>(
  input: T,
  fn: (input: T) => Promise<Y>,
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
  existingExecution: (input: T) => Promise<Y>;
  newExecution: (input: T) => Promise<Y>;
}): Promise<Y> => {
  return instrumentAsync(
    {
      name: `experiment-${args.operationName}`,
      spanKind: opentelemetry.SpanKind.CLIENT,
    },
    async (currentSpan) => {
      const { input, existingExecution, newExecution } = args;

      currentSpan.setAttribute(
        `run-experiment`,
        env.LANGFUSE_EXPERIMENT_COMPARE_READ_FROM_AGGREGATING_MERGE_TREES,
      );

      if (
        env.LANGFUSE_EXPERIMENT_COMPARE_READ_FROM_AGGREGATING_MERGE_TREES !==
        "true"
      ) {
        return existingExecution(input);
      }

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

        return existingResult;
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
