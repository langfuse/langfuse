import * as nr from "newrelic";

type CallbackAsyncFn<T> = () => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  return nr.startSegment(ctx.name, true, async function () {
    return callback();
  });
}
