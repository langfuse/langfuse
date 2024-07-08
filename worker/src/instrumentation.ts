require("dd-trace").init({
  profiling: true,
  runtimeMetrics: true,
});

type CallbackAsyncFn<T> = () => Promise<T>; //span?: Sentry.Span

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  return callback();
}
