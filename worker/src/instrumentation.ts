import * as Sentry from "@sentry/node";
import { env } from "./env";

type CallbackFn<T> = (span?: Sentry.Span) => T;

export function instrument<T>(
  ctx: { name: string },
  callback: CallbackFn<T>
): T {
  if (env.SENTRY_DSN) {
    return Sentry.startSpan(ctx, callback);
  } else {
    return callback();
  }
}

type CallbackAsyncFn<T> = (span?: Sentry.Span) => Promise<T>;
export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  if (env.SENTRY_DSN) {
    return Sentry.startSpan(ctx, async (span) => {
      const result = await callback(span);
      span?.end();
      return result;
    });
  } else {
    return callback();
  }
}
