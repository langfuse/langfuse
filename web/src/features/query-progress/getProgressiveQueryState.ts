import { type ProgressiveQueryEvent } from "@langfuse/shared";

export function getProgressiveQueryState<T>(
  events: ProgressiveQueryEvent<T>[] | undefined,
  previousData?: T,
) {
  let data = previousData;
  let progress = null;
  let hasResult = false;

  for (const event of events ?? []) {
    if (event.type === "progress") {
      progress = event.progress;
      continue;
    }

    data = event.data;
    hasResult = true;
    progress = null;
  }

  return { data, hasResult, progress };
}
