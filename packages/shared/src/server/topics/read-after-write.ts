import { logger } from "../logger";
import { recordIncrement } from "../instrumentation";

// A ClickHouse replica can lag behind an acknowledged insert for a few seconds.
const READ_AFTER_WRITE_RETRY_MS = [250, 500, 1000, 2000, 4000];

/**
 * Re-reads rows just written until `visible` holds and records how it went; returns the last read either way.
 * A failed read is retried too; if the last attempt fails, its error is thrown.
 */
export async function readUntilVisible<T>(
  check: "assignments" | "definitions",
  context: { projectId: string; runId: string },
  read: () => Promise<T>,
  visible: (result: T) => boolean,
): Promise<T> {
  const startedAt = Date.now();
  const attempt = async (): Promise<{ result: T } | { error: unknown }> => {
    try {
      return { result: await read() };
    } catch (error) {
      return { error };
    }
  };
  const isVisible = (read: { result: T } | { error: unknown }) =>
    "result" in read && visible(read.result);
  let last = await attempt();
  let attempts = 1;
  for (const delay of READ_AFTER_WRITE_RETRY_MS) {
    if (isVisible(last)) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    last = await attempt();
    attempts++;
  }
  let outcome = "visible";
  if ("error" in last) outcome = "read_failed";
  else if (!isVisible(last)) outcome = "not_visible";
  else if (attempts > 1) outcome = "visible_after_retry";
  recordIncrement("langfuse.topics.publication_checks", 1, { check, outcome });
  if (attempts > 1)
    (outcome === "visible_after_retry" ? logger.warn : logger.error)(
      "Topics publication check waited for ClickHouse visibility",
      {
        ...context,
        check,
        outcome,
        attempts,
        waitedMs: Date.now() - startedAt,
      },
    );
  if ("error" in last) throw last.error;
  return last.result;
}

/** A run's assignments stayed below the coverage needed to publish its map. */
export class TopicAssignmentVisibilityError extends Error {
  readonly name = "TopicAssignmentVisibilityError";
}
