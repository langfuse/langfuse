import { JSONPath } from "jsonpath-plus";

import { MediaReferenceStringSchema } from "./IORepresentation/chatML/types";

// Matches the format parsed by MediaReferenceStringSchema.
export const MEDIA_REFERENCE_PATTERN = /@@@langfuseMedia:.+?@@@/g;

/**
 * Scans a JSON value for `@@@langfuseMedia:...@@@` reference strings and
 * returns each occurrence with the JSONPath of the containing string.
 * References must be the entire string value; references embedded in
 * surrounding text and malformed references are ignored.
 */
export function findMediaReferences(value: unknown) {
  // Dataset item fields are arbitrary JSON, so the root may itself be a reference
  if (typeof value === "string") {
    const reference = parseReference(value, "$");
    return reference ? [reference] : [];
  }

  if (typeof value !== "object" || value === null) return [];

  // The @string() type selector needs no filter expression, so script
  // evaluation can stay disabled. MediaReferenceStringSchema decides which
  // strings are references.
  const nodes = JSONPath({
    path: "$..*@string()",
    json: value,
    resultType: "all",
    eval: false,
  }) as { value: string; path: string }[];

  return nodes
    .map((node) => parseReference(node.value, node.path))
    .filter((reference) => reference !== null);
}

function parseReference(value: string, jsonPath: string) {
  const parsed = MediaReferenceStringSchema.safeParse(value);

  return parsed.success ? { ...parsed.data, jsonPath } : null;
}
