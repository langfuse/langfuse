import { env } from "./env";

type CallbackAsyncFn<T> = () => Promise<T>; //span?: Sentry.Span

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  if (env.SENTRY_DSN) {
    // return Sentry.startSpan(ctx, async (span) => {
    //   return callback(span);
    // });
    return callback();
  } else {
    return callback();
  }
}
