import * as Sentry from "@sentry/nextjs";
import { type Span } from "@sentry/nextjs";

type CallbackFn<T> = (span?: Span) => T;

export function instrument<T>(
  ctx: { name: string },
  callback: CallbackFn<T>,
): T {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return Sentry.startSpan(ctx, callback);
  } else {
    return callback();
  }
}

type CallbackAsyncFn<T> = (span?: Span) => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>,
): Promise<T> {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return Sentry.startSpan(ctx, async (span) => {
      return callback(span);
    });
  } else {
    return callback();
  }
}
