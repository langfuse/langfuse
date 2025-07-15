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

type AsyncCallbackFn<T> = (span: opentelemetry.Span) => Promise<T>; // eslint-disable-line no-unused-vars

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
      const baggage = opentelemetry.propagation.getBaggage(
        opentelemetry.context.active(),
      );
      if (baggage) {
        baggage
          .getAllEntries()
          .forEach(([k, v]) => span.setAttribute(k, v.value));
      }
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

type SyncCallbackFn<T> = (span: opentelemetry.Span) => T; // eslint-disable-line no-unused-vars

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
      const baggage = opentelemetry.propagation.getBaggage(
        opentelemetry.context.active(),
      );
      if (baggage) {
        baggage
          .getAllEntries()
          .forEach(([k, v]) => span.setAttribute(k, v.value));
      }
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
  attributes: {
    userId?: string;
    projectId?: string;
    email?: string;
    orgId?: string;
    plan?: string;
  },
  span?: opentelemetry.Span,
) => {
  const activeSpan = span ?? getCurrentSpan();

  if (!activeSpan) {
    return;
  }

  const ctx = opentelemetry.context.active();
  let baggage =
    opentelemetry.propagation.getBaggage(ctx) ??
    opentelemetry.propagation.createBaggage();

  if (attributes.userId) {
    baggage = baggage.setEntry("user.id", {
      value: attributes.userId,
    });
    activeSpan.setAttribute("user.id", attributes.userId);
  }
  if (attributes.email) {
    baggage = baggage.setEntry("user.email", {
      value: attributes.email,
    });
    activeSpan.setAttribute("user.email", attributes.email);
  }
  if (attributes.projectId) {
    baggage = baggage.setEntry("langfuse.project.id", {
      value: attributes.projectId,
    });
    activeSpan.setAttribute("langfuse.project.id", attributes.projectId);
  }
  if (attributes.orgId) {
    baggage = baggage.setEntry("langfuse.org.id", {
      value: attributes.orgId,
    });
    activeSpan.setAttribute("langfuse.org.id", attributes.orgId);
  }
  if (attributes.plan) {
    baggage = baggage.setEntry("langfuse.org.plan", {
      value: attributes.plan,
    });
    activeSpan.setAttribute("langfuse.org.plan", attributes.plan);
  }

  return opentelemetry.propagation.setBaggage(ctx, baggage);
};

export const getTracer = (name: string) => opentelemetry.trace.getTracer(name);

const cloudWatchClient = new CloudWatchClient();
let lastFlushTime = 0;
let metricCache: Record<string, number> = {};

// Caches metrics and flushes them on schedule
const sendCloudWatchMetric = (key: string, value: number, replace: boolean) => {
  // Store the latest value for each metric key. If replace is false (e.g. for increments) we add the value to the existing value.
  metricCache[key] = replace ? value : (metricCache[key] || 0) + value;

  const currentTime = Date.now();
  const flushInterval = 30 * 1000; // 30 seconds

  // Check if it's time to flush the metrics
  if (currentTime - lastFlushTime >= flushInterval) {
    flushMetricsToCloudWatch();
  }
};

// Flush all cached metrics in a single API call
const flushMetricsToCloudWatch = () => {
  if (Object.keys(metricCache).length === 0) return;

  lastFlushTime = Date.now();

  const metricData = Object.entries(metricCache).map(([key, value]) => ({
    MetricName: key,
    Value: value,
  }));

  // Clear the cache after preparing the metrics
  metricCache = {};

  cloudWatchClient
    .send(
      new PutMetricDataCommand({
        Namespace: "Langfuse",
        MetricData: metricData,
      }),
    )
    .catch((error) => {
      logger.warn("Failed to send metrics to CloudWatch", error);
    });
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
    sendCloudWatchMetric(stat, value ?? 0, true);
  }
  dd.dogstatsd.gauge(stat, value, tags);
};

export const recordIncrement = (
  stat: string,
  value?: number | undefined,
  tags?: { [tag: string]: string | number } | undefined,
) => {
  if (env.ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING === "true") {
    sendCloudWatchMetric(stat, value ?? 1, false);
  }
  dd.dogstatsd.increment(stat, value, tags);
};

export const recordHistogram = (
  stat: string,
  value?: number | undefined,
  tags?: { [tag: string]: string | number } | undefined,
) => {
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
