import {
  type ProgressiveQueryEvent,
  type QueryProgress,
} from "@langfuse/shared";
import { getTRPCErrorFromUnknown } from "@trpc/server";
import { handleTRPCError } from "@/src/server/api/trpc";

export async function* progressiveQuery<T>(
  execute: (reportProgress: (progress: QueryProgress) => void) => Promise<T>,
) {
  let pendingProgress: QueryProgress | null = null;
  let isSettled = false;
  let resolveWait: (() => void) | null = null;

  const wake = () => {
    resolveWait?.();
    resolveWait = null;
  };

  const execution = execute((progress) => {
    // Only the latest unread update matters. This bounds streamed chunks when
    // ClickHouse reports faster than the HTTP response can be consumed.
    pendingProgress = progress;
    wake();
  });

  execution.then(
    () => {
      isSettled = true;
      wake();
    },
    () => {
      isSettled = true;
      wake();
    },
  );

  while (!isSettled) {
    if (pendingProgress) {
      const event: ProgressiveQueryEvent<T> = {
        type: "progress",
        progress: pendingProgress,
      };
      pendingProgress = null;
      yield event;
      continue;
    }

    await new Promise<void>((resolve) => {
      resolveWait = resolve;
      if (pendingProgress || isSettled) {
        wake();
      }
    });
  }

  if (pendingProgress) {
    yield {
      type: "progress",
      progress: pendingProgress,
    } satisfies ProgressiveQueryEvent<T>;
  }

  let data: T;
  try {
    data = await execution;
  } catch (error) {
    throw handleTRPCError(getTRPCErrorFromUnknown(error));
  }

  yield {
    type: "result",
    data,
  } satisfies ProgressiveQueryEvent<T>;
}
