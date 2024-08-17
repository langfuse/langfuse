import * as opentelemetry from "@opentelemetry/api";
import * as dd from "dd-trace";

// type CallbackFn<T> = () => T;

export type SpanCtx = {
  name: string;
  traceScope: string;
  spanKind?: opentelemetry.SpanKind; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/api.md#spankind
  rootSpan?: boolean; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/overview.md#traces
};

type CallbackFn<T> = () => T | Promise<T>;

export function instrument<T>(
  ctx: SpanCtx,
  callback: CallbackFn<T>
): Promise<T> | T {
  return getTracer(ctx.traceScope).startActiveSpan(
    ctx.name,
    {
      root: ctx.rootSpan,
      kind: ctx.spanKind,
    },
    (span) => {
      const handleResult = (result: T) => {
        span.end();
        return result;
      };

      const handleError = (ex: unknown) => {
        addExceptionToSpan(ex as opentelemetry.Exception, span);
        span.end();
        throw ex;
      };

      try {
        const result = callback();
        if (result instanceof Promise) {
          return result.then(handleResult).catch(handleError);
        } else {
          return handleResult(result);
        }
      } catch (ex) {
        return handleError(ex);
      }
    }
  );
}

export const getCurrentSpan = () => opentelemetry.trace.getActiveSpan();

export const addExceptionToSpan = (
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
    message: ex instanceof Error ? ex.message : String(ex),
    name: ex instanceof Error ? ex.name : "Error",
    stack: ex instanceof Error ? ex.stack : undefined,
  };

  activeSpan.recordException(exception);

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
