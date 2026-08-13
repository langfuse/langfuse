import { evaluateJsonPath } from "@langfuse/shared";
import { z } from "zod";

import {
  getVisibleSessionObservations,
  normalizeSessionObservationsResponse,
  type SessionObservationVisibilityFields,
} from "@/src/components/session/sessionVisibleObservations";

const JSON_PATH_MAX_LENGTH = 1_000;

const storedMetadataJsonPathsSchema = z
  .object({
    version: z.literal(1),
    paths: z
      .array(z.string().trim().min(1).max(JSON_PATH_MAX_LENGTH).startsWith("$"))
      .min(1),
  })
  .transform(({ version, paths }) => ({
    version,
    paths: [...new Set(paths)],
  }));

export type StoredMetadataJsonPaths = z.infer<
  typeof storedMetadataJsonPathsSchema
>;

export const metadataJsonPathsStorageKey = (projectId: string) =>
  `modern-session:metadata-jsonpaths:v1:${projectId}`;

export const parseStoredMetadataJsonPaths = (
  raw: unknown,
): StoredMetadataJsonPaths | null => {
  const result = storedMetadataJsonPathsSchema.safeParse(raw);
  return result.success ? result.data : null;
};

export type MetadataJsonPathResolution =
  | { state: "match"; value: unknown; displayValue: string }
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
    return { state: "match", value, displayValue };
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

export const findFirstVisibleSessionObservation = async <
  TObservation extends SessionObservationVisibilityFields,
>({
  traces,
  loadObservations,
  signal,
}: {
  traces: readonly { id: string }[];
  loadObservations: (
    traceId: string,
  ) => Promise<
    | readonly TObservation[]
    | { observations?: readonly TObservation[] }
    | undefined
  >;
  signal: AbortSignal;
}): Promise<TObservation | null> => {
  for (const trace of traces) {
    signal.throwIfAborted();
    const response = await loadObservations(trace.id);
    signal.throwIfAborted();
    const observations = normalizeSessionObservationsResponse(response) ?? [];
    const firstVisible = getVisibleSessionObservations(observations, trace.id)
      .visibleObservations[0];
    if (firstVisible) return firstVisible;
  }

  return null;
};
