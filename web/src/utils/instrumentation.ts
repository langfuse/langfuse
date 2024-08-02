type CallbackFn<T> = () => T;

export function instrument<T>(
  ctx: { name: string },
  callback: CallbackFn<T>,
): T {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return callback();
  } else {
    return callback();
  }
}

type CallbackAsyncFn<T> = () => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>,
): Promise<T> {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // return Sentry.startSpan(ctx, async (span) => {
    const result = await callback();
    return result;
    //   span?.end();
    //   return result;
    // });
  } else {
    return callback();
  }
}
