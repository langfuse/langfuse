import { evaluateJsonPath } from "@langfuse/shared";
import { z } from "zod";

const JSON_PATH_MAX_LENGTH = 1_000;

const storedMetadataJsonPathsSchema = z
  .array(z.string().trim().min(1).max(JSON_PATH_MAX_LENGTH).startsWith("$"))
  .transform((paths) => [...new Set(paths)]);

export type StoredMetadataJsonPaths = z.infer<
  typeof storedMetadataJsonPathsSchema
>;

export type FirstVisibleObservationMetadataState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error" }
  | { state: "empty" }
  | { state: "ready"; metadata: unknown; metadataTruncated: boolean };

export type SessionMetadataJsonPathState = {
  paths: readonly string[];
  source: FirstVisibleObservationMetadataState;
  onEditorOpenChange: (open: boolean) => void;
  onSave: (path: string) => void;
  onRemove: (path: string) => void;
};

export const metadataJsonPathsStorageKey = (projectId: string) =>
  `modern-session:metadata-jsonpaths:v1:${projectId}`;

export const parseStoredMetadataJsonPaths = (
  raw: unknown,
): StoredMetadataJsonPaths => {
  const result = storedMetadataJsonPathsSchema.safeParse(raw);
  return result.success ? result.data : [];
};

export type MetadataJsonPathResolution =
  | { state: "match"; displayValue: string }
  | { state: "no-match" }
  | { state: "invalid"; message: string };

export const resolveMetadataJsonPath = (
  metadata: unknown,
  rawPath: string,
): MetadataJsonPathResolution => {
  const path = rawPath.trim();
  if (!path.startsWith("$")) {
    return { state: "invalid", message: "JSONPath must start with $." };
  }
  if (path.length > JSON_PATH_MAX_LENGTH) {
    return {
      state: "invalid",
      message: `JSONPath must be at most ${JSON_PATH_MAX_LENGTH} characters.`,
    };
  }

  try {
    const value = evaluateJsonPath(metadata ?? {}, path);
    if (value === undefined) return { state: "no-match" };

    const displayValue =
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : value === null
            ? "null"
            : (JSON.stringify(value) ?? String(value));
    return { state: "match", displayValue };
  } catch (error) {
    return {
      state: "invalid",
      message: error instanceof Error ? error.message : "Invalid JSONPath.",
    };
  }
};

export const getMetadataJsonPathLabel = (path: string): string => {
  const dotProperty = path.match(/\.([A-Za-z_$][\w$]*)$/)?.[1];
  if (dotProperty) return dotProperty;

  const bracketProperty = path.match(/\[['"]([^'"]+)['"]\]$/)?.[1];
  return bracketProperty ?? path;
};
