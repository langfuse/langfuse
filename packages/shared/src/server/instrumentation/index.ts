import * as opentelemetry from "@opentelemetry/api";
import * as dd from "dd-trace";

// type CallbackFn<T> = () => T;

export type SpanCtx = {
  name: string;
  spanKind?: opentelemetry.SpanKind; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/api.md#spankind
  rootSpan?: boolean; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/overview.md#traces
  traceScope?: string;
};

type AsyncCallbackFn<T> = () => Promise<T>;

export async function instrumentAsync<T>(
  ctx: SpanCtx,
  callback: AsyncCallbackFn<T>
): Promise<T> {
  return await getTracer(ctx.traceScope ?? callback.name).startActiveSpan(
    ctx.name,
    {
      root: ctx.rootSpan,
      kind: ctx.spanKind,
    },
    async (span) => {
      try {
        const result = await callback();
        span.end();
        return result;
      } catch (ex) {
        traceException(ex as opentelemetry.Exception, span);
        span.end();
        throw ex;
      }
    }
  );
}

type SyncCallbackFn<T> = () => T;

export function instrumentSync<T>(
  ctx: SpanCtx,
  callback: SyncCallbackFn<T>
): T {
  return getTracer(ctx.traceScope ?? callback.name).startActiveSpan(
    ctx.name,
    {
      root: ctx.rootSpan,
      kind: ctx.spanKind,
    },
    (span) => {
      try {
        const result = callback();
        span.end();
        return result;
      } catch (ex) {
        traceException(ex as opentelemetry.Exception, span);
        span.end();
        throw ex;
      }
    }
  );
}

export const getCurrentSpan = () => opentelemetry.trace.getActiveSpan();

export const traceException = (
  ex: unknown,
  span?: opentelemetry.Span,
  code?: string
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
  span?: opentelemetry.Span
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

export const recordGauge = (
  stat: string,
  value?: number | undefined,
  tags?:
    | {
        [tag: string]: string | number;
      }
    | undefined
) => {
  dd.dogstatsd.gauge(stat, value, tags);
};

export const recordIncrement = (
  stat: string,
  value?: number | undefined,
  tags?: { [tag: string]: string | number } | undefined
) => {
  dd.dogstatsd.increment(stat, value, tags);
};

export const recordHistogram = (
  stat: string,
  value?: number | undefined,
  tags?: { [tag: string]: string | number } | undefined
) => {
  dd.dogstatsd.histogram(stat, value, tags);
};
