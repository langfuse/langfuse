import { env } from "./env";
import * as Sentry from "@sentry/node";

type CallbackAsyncFn<T> = (span?: Sentry.Span) => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  if (env.SENTRY_DSN) {
    return Sentry.startSpan(ctx, async (span) => {
      return callback(span);
    });
  } else {
    return callback();
  }
}
