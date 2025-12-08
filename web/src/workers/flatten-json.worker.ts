/**
 * Web Worker for background JSON flattening
 *
 * Flattens large JSON data off the main thread using the iterative
 * flattenJSON function to prevent UI blocking during expand/collapse operations.
 */

import {
  flattenJSON,
  calculateTotalLineCount,
} from "@/src/components/ui/AdvancedJsonViewer/utils/flattenJson";
import type {
  FlatJSONRow,
  ExpansionState,
  FlattenConfig,
} from "@/src/components/ui/AdvancedJsonViewer/types";

export interface FlattenRequest {
  id: string;
  data: unknown;
  expansionState: ExpansionState;
  config?: FlattenConfig;
}

export interface FlattenResponse {
  id: string;
  flatRows: FlatJSONRow[];
  totalLineCount: number;
  flattenTime: number;
  error?: string;
}

self.onmessage = function (e: MessageEvent<FlattenRequest>) {
  const { id, data, expansionState, config } = e.data;

  const startTime = performance.now();

  try {
    // Flatten JSON with provided expansion state
    const flatRows = flattenJSON(data, expansionState, config);

    // Calculate total line count for line number width
    const totalLineCount = calculateTotalLineCount(data);

    const elapsed = performance.now() - startTime;

    const response: FlattenResponse = {
      id,
      flatRows,
      totalLineCount,
      flattenTime: elapsed,
    };

    self.postMessage(response);
  } catch (error) {
    console.error("[flatten-json.worker] Flatten error:", error);
    // Send back error
    self.postMessage({
      id,
      flatRows: [],
      totalLineCount: 0,
      flattenTime: performance.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
