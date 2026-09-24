import { TEXT_RESOURCE_CONTENT_TYPES } from "@langfuse/shared";

export function isTextLike(contentType: string): boolean {
  const normalizedContentType = contentType.split(";")[0]!.trim().toLowerCase();
  return (
    normalizedContentType.startsWith("text/") ||
    TEXT_RESOURCE_CONTENT_TYPES.has(normalizedContentType) ||
    /^application\/[^/]+\+(json|xml)$/.test(normalizedContentType)
  );
}
