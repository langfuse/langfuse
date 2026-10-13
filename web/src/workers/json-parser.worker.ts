/**
 * Web Worker for background JSON parsing.
 *
 * Parses large trace I/O off the main thread so the UI keeps rendering.
 *
 * This file is NOT compiled by Next.js. `scripts/build-json-parser-worker.mjs`
 * bundles it with esbuild into `generated/json-parser.worker.source.ts`, a plain
 * string the client starts as a blob (see `jsonParserWorkerClient.ts`). That is
 * why it imports `deepParseJsonIterative` from its own module rather than from
 * the `@langfuse/shared` barrel: the barrel pulls ~1MB into a bundle whose whole
 * job is one 3.7KB function.
 */

import { deepParseJsonIterative } from "@langfuse/shared/src/utils/json";

import {
  WORKER_PARSE_LIMITS,
  type ParseRequest,
  type ParseResponse,
} from "./json-parser.protocol";

self.onmessage = function (e: MessageEvent<ParseRequest>) {
  const { id, input, output, metadata } = e.data;

  const startTime = performance.now();

  try {
    const response: ParseResponse = {
      id,
      parsedInput: deepParseJsonIterative(input, WORKER_PARSE_LIMITS),
      parsedOutput: deepParseJsonIterative(output, WORKER_PARSE_LIMITS),
      parsedMetadata: deepParseJsonIterative(metadata, WORKER_PARSE_LIMITS),
      parseTime: performance.now() - startTime,
    };

    self.postMessage(response);
  } catch (error) {
    // Answer with the unparsed data: an exception in here must never leave a
    // request unanswered, and the client reports the carried error message.
    const response: ParseResponse = {
      id,
      parsedInput: input,
      parsedOutput: output,
      parsedMetadata: metadata,
      parseTime: performance.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };

    self.postMessage(response);
  }
};
