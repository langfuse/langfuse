import { type Prisma } from "@langfuse/shared";

export const getFormattedPayload = (
  payload: Prisma.JsonValue | undefined,
): string => {
  if (!payload) return "{}";

  if (typeof payload === "string") {
    // Check if it's a double-stringified JSON
    try {
      const parsed = JSON.parse(payload);
      return typeof parsed === "string"
        ? parsed
        : JSON.stringify(parsed, null, 2);
    } catch {
      // If parsing fails, return as-is (it's just a regular string)
      return payload;
    }
  }

  // It's already an object, stringify it
  return JSON.stringify(payload, null, 2);
};
