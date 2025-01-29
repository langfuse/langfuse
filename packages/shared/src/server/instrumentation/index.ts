import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import * as opentelemetry from "@opentelemetry/api";
import * as dd from "dd-trace";
import { env } from "../../env";
import { logger } from "../logger";

// type CallbackFn<T> = () => T;

export type TCarrier = {
  traceparent?: string;
  tracestate?: string;
};

export type SpanCtx = {
  name: string;
  spanKind?: opentelemetry.SpanKind; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/api.md#spankind
  rootSpan?: boolean; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/overview.md#traces
  traceScope?: string;
  traceContext?: TCarrier;
};

type AsyncCallbackFn<T> = (span: opentelemetry.Span) => Promise<T>;

export async function instrumentAsync<T>(
  ctx: SpanCtx,
  callback: AsyncCallbackFn<T>,
): Promise<T> {
  const activeContext = ctx.traceContext
    ? opentelemetry.propagation.extract(
        opentelemetry.context.active(),
        ctx.traceContext,
      )
    : opentelemetry.context.active();

  return getTracer(ctx.traceScope ?? callback.name).startActiveSpan(
    ctx.name,
    {
      root: !ctx.traceContext && ctx.rootSpan,
      kind: ctx.spanKind,
    },
    activeContext,
    async (span) => {
      try {
        const result = await callback(span);
        span.end();
        return result;
      } catch (ex) {
        traceException(ex as opentelemetry.Exception, span);
        span.end();
        throw ex;
      }
    },
  );
}

type SyncCallbackFn<T> = (span: opentelemetry.Span) => T;

export function instrumentSync<T>(
  ctx: SpanCtx,
  callback: SyncCallbackFn<T>,
): T {
  const activeContext = ctx.traceContext
    ? opentelemetry.propagation.extract(
        opentelemetry.context.active(),
        ctx.traceContext,
      )
    : opentelemetry.context.active();

  return getTracer(ctx.traceScope ?? callback.name).startActiveSpan(
    ctx.name,
    {
      root: !ctx.traceContext && ctx.rootSpan,
      kind: ctx.spanKind,
    },
    activeContext,
    (span) => {
      try {
        const result = callback(span);
        span.end();
        return result;
      } catch (ex) {
        traceException(ex as opentelemetry.Exception, span);
        span.end();
        throw ex;
      }
    },
  );
}

export const getCurrentSpan = () => opentelemetry.trace.getActiveSpan();

export const traceException = (
  ex: unknown,
  span?: opentelemetry.Span,
  code?: string,
) => {
  const activeSpan = span ?? getCurrentSpan();

  if (!activeSpan) {
    return;
  }

  const exception = {
    code: code,
    message:
      ex instanceof Error
        ? ex.message
        : typeof ex === "object" && ex !== null && "message" in ex
          ? JSON.stringify(ex.message)
          : JSON.stringify(ex),
    name:
      ex instanceof Error
        ? ex.name
        : typeof ex === "object" && ex !== null && "name" in ex
          ? JSON.stringify(ex.name)
          : "Error",
    stack:
      ex instanceof Error
        ? JSON.stringify(ex.stack)
        : typeof ex === "object" && ex !== null && "stack" in ex
          ? JSON.stringify(ex.stack)
          : undefined,
  };

  // adds an otel event
  activeSpan.recordException(exception);

  //adds tags for datadog error tracking
  activeSpan.setAttributes({
    "error.stack": exception.stack,
    "error.message": exception.message,
    "error.type": exception.name,
  });

  activeSpan.setStatus({
    code: opentelemetry.SpanStatusCode.ERROR,
    message: exception.message,
  });
};

export const addUserToSpan = (
  attributes: { userId?: string; projectId?: string; email?: string },
  span?: opentelemetry.Span,
) => {
  const activeSpan = span ?? getCurrentSpan();

  if (!activeSpan) {
    return;
  }

  attributes.userId && activeSpan.setAttribute("user.id", attributes.userId);
  attributes.email && activeSpan.setAttribute("user.email", attributes.email);
  attributes.projectId &&
    activeSpan.setAttribute("project.id", attributes.projectId);
};

export const getTracer = (name: string) => opentelemetry.trace.getTracer(name);

const cloudWatchClient = new CloudWatchClient();
const cloudWatchLastSubmitted: Record<string, number> = {};
const sendCloudWatchMetric = (key: string, value: number | undefined) => {
  const currentTime = Date.now();
  const interval = 30 * 1000;

  // Check if the function has been executed in the last 30s for this key
  if (
    !cloudWatchLastSubmitted[key] ||
    currentTime - cloudWatchLastSubmitted[key] >= interval
  ) {
    cloudWatchLastSubmitted[key] = currentTime;
    cloudWatchClient
      .send(
        new PutMetricDataCommand({
          Namespace: "Langfuse",
          MetricData: [
            {
              MetricName: key,
              Value: value ?? 0,
            },
          ],
        }),
      )
      .catch((error) => {
        logger.warn("Failed to send metric to CloudWatch", error);
      });
  }
};

export const recordGauge = (
  stat: string,
  value?: number | undefined,
  tags?:
    | {
        [tag: string]: string | number;
      }
    | undefined,
) => {
  if (env.ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING === "true") {
    sendCloudWatchMetric(stat, value);
  }
  dd.dogstatsd.gauge(stat, value, tags);
};

export const recordIncrement = (
  stat: string,
  value?: number | undefined,
  tags?: { [tag: string]: string | number } | undefined,
) => {
  if (env.ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING === "true") {
    sendCloudWatchMetric(stat, value);
  }
  dd.dogstatsd.increment(stat, value, tags);
};

export const recordHistogram = (
  stat: string,
  value?: number | undefined,
  tags?: { [tag: string]: string | number } | undefined,
) => {
  if (env.ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING === "true") {
    sendCloudWatchMetric(stat, value);
  }
  dd.dogstatsd.histogram(stat, value, tags);
};

export const recordDistribution = (
  stat: string,
  value?: number | undefined,
  tags?: { [tag: string]: string | number } | undefined,
) => {
  dd.dogstatsd.distribution(stat, value, tags);
};

/**
 * Converts a queue name to the matching datadog metric name.
 * Consumer only needs to append the relevant suffix.
 *
 * Example: `legacy-ingestion-queue` -> `langfuse.queue.legacy_ingestion`
 */
export const convertQueueNameToMetricName = (queueName: string): string => {
  return (
    "langfuse.queue." + queueName.replace(/-/g, "_").replace(/_queue$/, "")
  );
};
