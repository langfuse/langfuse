import * as opentelemetry from "@opentelemetry/api";
import * as dd from "dd-trace";

// type CallbackFn<T> = () => T;

export type SpanCtx = {
  name: string;
  spanKind?: opentelemetry.SpanKind; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/api.md#spankind
  rootSpan?: boolean; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/overview.md#traces
  traceScope?: string;
};

type CallbackFn<T> = () => T | Promise<T>;

export function instrument<T>(
  ctx: SpanCtx,
  callback: CallbackFn<T>
): T extends Promise<any> ? Promise<T> : T {
  return getTracer(ctx.traceScope ?? callback.name).startActiveSpan(
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
        traceException(ex as opentelemetry.Exception, span);
        span.end();
        throw ex;
      };

      try {
        const result = callback();
        if (result instanceof Promise) {
          return result
            .then(handleResult)
            .catch(handleError) as T extends Promise<any> ? Promise<T> : T;
        } else {
          return handleResult(result) as T extends Promise<any>
            ? Promise<T>
            : T;
        }
      } catch (ex) {
        return handleError(ex) as T extends Promise<any> ? Promise<T> : T;
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
    message: ex instanceof Error ? ex.message : String(ex),
    name: ex instanceof Error ? ex.name : "Error",
    stack: ex instanceof Error ? ex.stack : undefined,
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
