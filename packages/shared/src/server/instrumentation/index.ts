import * as ot from "@opentelemetry/api";
import * as dd from "dd-trace";

type CallbackFn<T> = () => T;

export type SpanCtx = {
  name: string;
  traceScope: string;
  spanKind?: ot.SpanKind; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/trace/api.md#spankind
  rootSpan?: boolean; // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/overview.md#traces
};

export function instrument<T>(ctx: SpanCtx, callback: CallbackFn<T>): T {
  return getTracer(ctx.traceScope).startActiveSpan(
    ctx.name,
    { kind: ctx.spanKind, root: ctx.rootSpan },
    (span) => {
      try {
        return callback();
      } catch (ex) {
        addExceptionToSpan(ex as ot.Exception, span);
        throw ex;
      }
    }
  );
}

type CallbackAsyncFn<T> = () => Promise<T>;

export async function instrumentAsync<T>(
  ctx: SpanCtx,
  callback: CallbackAsyncFn<T>
): Promise<T> {
  return getTracer(ctx.traceScope).startActiveSpan(
    ctx.name,
    { kind: ctx.spanKind, root: ctx.rootSpan },
    async (span) => {
      try {
        return await callback();
      } catch (ex) {
        addExceptionToSpan(ex as ot.Exception, span);
        throw ex;
      }
    }
  );
}

export const getCurrentSpan = () => ot.trace.getActiveSpan();

export const addExceptionToSpan = (ex: unknown, span?: ot.Span) => {
  const activeSpan = span ?? getCurrentSpan();

  if (!activeSpan) {
    return;
  }

  activeSpan.recordException(ex as ot.Exception);
  activeSpan.setStatus({ code: ot.SpanStatusCode.ERROR });
};

export const addUserToSpan = (
  attibutes: { userId?: string; projectId?: string; email?: string },
  span?: ot.Span
) => {
  const activeSpan = span ?? getCurrentSpan();

  if (!activeSpan) {
    return;
  }

  attibutes.userId && activeSpan.setAttribute("user.id", attibutes.userId);
  attibutes.email && activeSpan.setAttribute("user.email", attibutes.email);
  attibutes.projectId &&
    activeSpan.setAttribute("project.id", attibutes.projectId);

  console.log("attibutes.userId", attibutes.userId);
};

export const getTracer = (name: string) => ot.trace.getTracer(name);
export const getMeter = (name: string) => ot.metrics.getMeter(name);

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

export const recordCount = (
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
