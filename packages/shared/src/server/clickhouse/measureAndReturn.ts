import * as opentelemetry from "@opentelemetry/api";
import { instrumentAsync } from "../instrumentation";

const executionWrapper = async <T, Y>(
  input: T,
  fn: (input: T) => Promise<Y>,
  span?: opentelemetry.Span,
  attributePrefix?: string,
): Promise<[Y, number]> => {
  const startTime = Date.now();
  const res = await fn(input);
  const duration = Date.now() - startTime;
  span?.setAttribute(
    `langfuse.experiment.amts.${attributePrefix}-duration`,
    duration,
  );
  return [res, duration];
};

/**
 * Measures the execution time of a query functions and returns the result based on the experiment configuration.
 * Presently this is but a simple wrapper around single execution, but it is designed to be
 * extended for A/B testing or canary releases.
 */
export const measureAndReturn = async <T, Y>(args: {
  operationName: string;
  projectId: string;
  input: T;
  fn: (input: T) => Promise<Y>;
}): Promise<Y> => {
  return instrumentAsync(
    {
      name: `experiment-${args.operationName}`,
      spanKind: opentelemetry.SpanKind.CLIENT,
    },
    async (currentSpan) => {
      const { input, fn } = args;

      // When we want do to multiple executions for A/B testing or canary releases,
      // or some other form of a more complex wrapper we used to try-catch
      // using the wrapper function and fallback to a simple f(input) when it failed.
      const [[existingResult, _existingDuration]] = await Promise.all([
        executionWrapper(input, fn, currentSpan, "existing"),
      ]);

      return existingResult;
    },
  );
};
