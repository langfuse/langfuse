import * as Sentry from "@sentry/nextjs";
import { type Span } from "@sentry/nextjs";

type CallbackFn<T> = (span?: Span) => T;

export function instrument<T>(
  ctx: { name: string },
  callback: CallbackFn<T>,
): T {
  return Sentry.startSpan(ctx, callback);
}

type CallbackAsyncFn<T> = (span?: Span) => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>,
): Promise<T> {
  return Sentry.startSpan({ ...ctx }, async (span) => {
    return await callback(span);
  });
}
