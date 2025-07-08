/**
 * Shared helper for TRPC streaming responses using async generators
 * Returns an AsyncGenerator that yields progressive JSON chunks
 * Manually handles dates to preserve types like TRPC does
 * FIXME: For testing purposes only!
 */
export async function* streamTRPCResponse<
  T extends { input?: any; output?: any; metadata?: any },
>(data: T): AsyncGenerator<string, void, unknown> {
  // Delegate to the chunk generator
  yield* generateStreamingChunks(data);
}

/**
 * Async generator that yields data in progressive chunks
 * Manually handles dates and other special types to match TRPC behavior
 */
async function* generateStreamingChunks<
  T extends { input?: any; output?: any; metadata?: any },
>(data: T): AsyncGenerator<string> {
  const { input, output, metadata, ...baseData } = data;

  // Start JSON structure
  yield "{";

  // Stream all base properties first
  let first = true;
  for (const [key, value] of Object.entries(baseData)) {
    if (!first) yield ",";
    yield `"${key}":${serializeValue(value)}`;
    first = false;
  }

  // Stream the large fields if they exist
  if (metadata !== undefined) {
    if (!first) yield ",";
    yield '"metadata":';
    yield serializeValue(metadata);
    first = false;
  }

  if (input !== undefined) {
    if (!first) yield ",";
    yield '"input":';
    yield serializeValue(input);
    first = false;
  }

  if (output !== undefined) {
    if (!first) yield ",";
    yield '"output":';
    yield serializeValue(output);
    first = false;
  }

  // Close JSON structure
  yield "}";
}

/**
 * Serialize a value while preserving Date objects as Date objects (not strings)
 * This matches how TRPC handles serialization with SuperJSON
 */
function serializeValue(value: any): string {
  // Custom replacer function to handle dates and other special types
  return JSON.stringify(value, (key, val) => {
    // Keep dates as dates (they'll be handled by the receiving TRPC client with SuperJSON)
    if (val instanceof Date) {
      return val;
    }
    return val;
  });
}

/**
 * Helper to reconstruct complete object from streamed chunks
 * Used on the client side to rebuild the original object
 */
export function reconstructFromChunks(chunks: string[]): any {
  const completeJson = chunks.join("");
  return JSON.parse(completeJson, (key, value) => {
    // Try to parse ISO date strings back to Date objects
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)
    ) {
      return new Date(value);
    }
    return value;
  });
}
