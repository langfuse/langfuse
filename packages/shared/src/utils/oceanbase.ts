import { env } from "../env";
import { JsonNested } from "./zod";
import { parse, isSafeNumber, isNumber } from "lossless-json";

export function isOceanBase(): boolean {
  return env.OCEANBASE_ENABLED === "true";
}

export const cleanUndefinedValues = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return null;
  }
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (obj[key] === undefined) {
      obj[key] = null;
    } else if (typeof obj[key] === "number") {
      if (obj[key] > 1000000000000 && obj[key] < 3000000000000) {
        obj[key] = new Date(obj[key])
          .toISOString()
          .replace("T", " ")
          .replace("Z", "");
      }
    } else if (obj[key] && typeof obj[key] === "object") {
      obj[key] = JSON.stringify(obj[key]);
    }
  }

  return obj;
};

export const cleanTimeValues = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return null;
  }
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (obj[key] === undefined) {
      obj[key] = null;
    } else if (typeof obj[key] === "number") {
      if (obj[key] > 1000000000000 && obj[key] < 3000000000000) {
        obj[key] = new Date(obj[key])
          .toISOString()
          .replace("T", " ")
          .replace("Z", "");
      }
    }
  }

  return obj;
};

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
  } catch {
    return json;
  }
};

export function parseJsonArray(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  // 如果已经是数组，直接返回（PostgreSQL）
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  // 如果是字符串，尝试解析（MySQL/OceanBase）
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return [];
    }
  }

  // 如果已经是对象/数组（解析后的 JSON），直接转换
  const parsed = deepParseJson(value);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => String(item));
  }

  return [];
}
