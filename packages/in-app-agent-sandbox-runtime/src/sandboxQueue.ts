/**
 * Serializes async tasks so only one runs at a time, in call order.
 *
 * The HTTP server handles requests concurrently, but sandbox operations share
 * mutable state on disk (the tool_calls directory, workspace files). Chaining
 * every task onto the previous one's settlement turns overlapping requests
 * into a queue instead of letting them race on the filesystem.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();

  return function runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
