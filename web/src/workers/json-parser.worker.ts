/**
 * Web Worker for background JSON parsing
 *
 * Parses large JSON data off the main thread using the iterative
 * deepParseJsonIterative function to prevent UI blocking.
 */

import { deepParseJsonIterative } from "@langfuse/shared";

export interface ParseRequest {
  id: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
}

export interface ParseResponse {
  id: string;
  parsedInput: unknown;
  parsedOutput: unknown;
  parsedMetadata: unknown;
  parseTime: number;
}

self.onmessage = function (e: MessageEvent<ParseRequest>) {
  const { id, input, output, metadata } = e.data;

  const startTime = performance.now();

  try {
    // Parse with high limits since we're off the main thread
    const parsedInput = deepParseJsonIterative(input, {
      maxDepth: Infinity,
      maxSize: 10_000_000, // 10MB
    });

    const parsedOutput = deepParseJsonIterative(output, {
      maxDepth: Infinity,
      maxSize: 10_000_000,
    });

    const parsedMetadata = deepParseJsonIterative(metadata, {
      maxDepth: Infinity,
      maxSize: 10_000_000,
    });

    const elapsed = performance.now() - startTime;

    const response: ParseResponse = {
      id,
      parsedInput,
      parsedOutput,
      parsedMetadata,
      parseTime: elapsed,
    };

    self.postMessage(response);
  } catch (error) {
    console.error("[json-parser.worker] Parse error:", error);
    // Send back unparsed data on error
    self.postMessage({
      id,
      parsedInput: input,
      parsedOutput: output,
      parsedMetadata: metadata,
      parseTime: performance.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
