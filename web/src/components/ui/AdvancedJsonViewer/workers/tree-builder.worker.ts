/**
 * Web Worker for building trees from large JSON datasets
 *
 * Runs tree building off the main thread to prevent UI blocking.
 * Uses the same iterative buildTreeFromJSON function as sync builds.
 *
 * Message protocol:
 * - Input: { type: "build", data: unknown, config: {...} }
 * - Output: { type: "success", tree: TreeState } | { type: "error", error: string }
 */

import type { TreeState } from "../utils/treeStructure";
import { buildTreeFromJSON } from "../utils/treeStructure";

/**
 * Message types for worker communication
 */
interface BuildTreeMessage {
  type: "build";
  data: unknown;
  config: Parameters<typeof buildTreeFromJSON>[1];
}

interface SuccessMessage {
  type: "success";
  tree: TreeState;
  buildTime: number;
}

interface ErrorMessage {
  type: "error";
  error: string;
}

type WorkerMessage = BuildTreeMessage;
type _WorkerResponse = SuccessMessage | ErrorMessage;

/**
 * Handle incoming messages
 */
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === "build") {
    try {
      const startTime = performance.now();

      const tree = buildTreeFromJSON(message.data, message.config);

      const buildTime = performance.now() - startTime;

      // Send success response
      const response: SuccessMessage = {
        type: "success",
        tree,
        buildTime,
      };

      self.postMessage(response);
    } catch (error) {
      console.error("[tree-builder.worker] Build failed:", error);

      // Send error response
      const response: ErrorMessage = {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };

      self.postMessage(response);
    }
  }
};

// Export empty object to make this a module
export {};
