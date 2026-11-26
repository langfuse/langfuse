import { logger } from "../logger";
import { recordIncrement } from "../instrumentation";

// A ClickHouse replica can lag behind an acknowledged insert for a few seconds.
const READ_AFTER_WRITE_RETRY_MS = [250, 500, 1000, 2000, 4000];

/** Re-reads rows just written until `visible` holds and records how it went; returns the last read either way. */
export async function readUntilVisible<T>(
  check: "assignments" | "definitions",
  context: { projectId: string; runId: string },
  read: () => Promise<T>,
  visible: (result: T) => boolean,
): Promise<T> {
  const startedAt = Date.now();
  let result = await read();
  let attempts = 1;
  for (const delay of READ_AFTER_WRITE_RETRY_MS) {
    if (visible(result)) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = await read();
    attempts++;
  }
  const outcome = !visible(result)
    ? "not_visible"
    : attempts === 1
      ? "visible"
      : "visible_after_retry";
  recordIncrement("langfuse.topics.publication_checks", 1, { check, outcome });
  if (attempts > 1)
    (outcome === "not_visible" ? logger.error : logger.warn)(
      "Topics publication check waited for ClickHouse visibility",
      {
        ...context,
        check,
        outcome,
        attempts,
        waitedMs: Date.now() - startedAt,
      },
    );
  return result;
}

/** A run's assignments stayed below the coverage needed to publish its map. */
export class TopicAssignmentVisibilityError extends Error {
  readonly name = "TopicAssignmentVisibilityError";
}
