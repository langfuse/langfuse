import { parentPort } from "worker_threads";
import { Model } from "@langfuse/shared";
import { tokenCount } from "./usage";

// Worker thread entry point
if (parentPort) {
  parentPort.on(
    "message",
    (data: { model: Model; text: unknown; id: string }) => {
      try {
        const result = tokenCount({ model: data.model, text: data.text });
        parentPort!.postMessage({ id: data.id, result, error: null });
      } catch (error) {
        parentPort!.postMessage({
          id: data.id,
          result: undefined,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );
}
