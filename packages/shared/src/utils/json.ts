import { env } from "../env";
import { InternalServerError } from "../errors";
import { logger } from "../server/logger";
import { JsonNested } from "./zod";
import { parse, isSafeNumber, isNumber } from "lossless-json";

/**
 * Deeply parses a JSON string or object for nested stringified JSON
 * @param json JSON string or object to parse
 * @returns Parsed JSON object
 */
export function deepParseJson(json: unknown): unknown {
  if (typeof json === "string") {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed === "number") return json; // numbers that were strings in the input should remain as strings
      return deepParseJson(parsed); // Recursively parse parsed value
    } catch (e) {
      return json; // If it's not a valid JSON string, just return the original string
    }
  } else if (typeof json === "object" && json !== null) {
    // Handle arrays
    if (Array.isArray(json)) {
      for (let i = 0; i < json.length; i++) {
        json[i] = deepParseJson(json[i]);
      }
    } else {
      // Handle nested objects
      for (const key in json) {
        // Ensure we only iterate over the object's own properties
        if (Object.prototype.hasOwnProperty.call(json, key)) {
          (json as Record<string, unknown>)[key] = deepParseJson(
            (json as Record<string, unknown>)[key],
          );
        }
      }
    }
    return json;
  }

  return json;
}

export const parseJsonPrioritised = (
  json: string,
): JsonNested | string | undefined => {
  assertJsonSize(json);
  try {
    return parse(json, null, (value) => {
      if (isNumber(value)) {
        if (isSafeNumber(value)) {
          // Safe numbers (integers and decimals) can be converted to Number
          return Number(value.valueOf());
        } else {
          // For large integers beyond safe limits, preserve string representation
          return value.toString();
        }
      }
      return value;
    }) as JsonNested;
  } catch (error) {
    return json;
  }
};

export const assertJsonSize = (json: string) => {
  // Large number of observations in trace with large input / output / metadata will lead to
  // high CPU and memory consumption in the convertObservation step, where parsing occurs
  // Thus, limit the size of the payload to 5MB, follows NextJS response size limitation:
  // https://nextjs.org/docs/messages/api-routes-response-size-limit
  // See also LFE-4882 for more details

  const size = json.length;

  if (size >= env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES) {
    const errorMessage = `Payload for arbitrary json is too large: ${(size / 1e6).toFixed(2)}MB exceeds limit of ${(env.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES / 1e6).toFixed(2)}MB`;

    logger.error(errorMessage);

    throw new InternalServerError(errorMessage);
  }
};
