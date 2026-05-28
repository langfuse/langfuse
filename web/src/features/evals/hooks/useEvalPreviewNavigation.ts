import {
  detailPageListKeys,
  type EventDetailPageListEntry,
  type ListEntry,
  type ObservationDetailPageListEntry,
  type TraceDetailPageListEntry,
  useFirstDetailPageListEntry,
} from "@/src/features/navigate-detail-pages/context";
import { type NextRouter } from "next/router";
import {
  EvalTargetObject,
  type EvalTargetObject as EvalTargetObjectType,
} from "@langfuse/shared";
import {
  isEventTarget,
  isExperimentTarget,
} from "@/src/features/evals/utils/typeHelpers";

export type EvalPreviewPointer = {
  traceId?: string;
  observationId?: string;
  timestamp?: Date;
};

type EvalPreviewDetailPageListEntry =
  | TraceDetailPageListEntry
  | ObservationDetailPageListEntry
  | EventDetailPageListEntry;

export function getEvalPreviewDetailPageListKey(
  target: EvalTargetObjectType,
  useEventsTable: boolean,
) {
  if (target === EvalTargetObject.TRACE) return detailPageListKeys.traces;
  if (isExperimentTarget(target)) return detailPageListKeys.events;
  if (isEventTarget(target)) {
    return useEventsTable
      ? detailPageListKeys.events
      : detailPageListKeys.observations;
  }
  return undefined;
}

function parseTimestamp(timestamp: string | string[] | undefined) {
  if (Array.isArray(timestamp)) return undefined;
  if (!timestamp) return undefined;

  try {
    const date = new Date(decodeURIComponent(timestamp));
    return Number.isNaN(date.getTime()) ? undefined : date;
  } catch {
    return undefined;
  }
}

export function getEvalPreviewPointerFromDetailPageEntry(
  entry: ListEntry | undefined,
  target: EvalTargetObjectType,
): EvalPreviewPointer | undefined {
  if (!entry) return undefined;

  if (target === EvalTargetObject.TRACE) {
    return {
      traceId: entry.id,
      timestamp: parseTimestamp(entry.params?.timestamp),
    };
  }

  const observationEntry = entry as ObservationDetailPageListEntry;
  const traceId = observationEntry.params?.traceId;
  if (!traceId) return undefined;

  return {
    traceId,
    observationId: observationEntry.id,
    timestamp: parseTimestamp(
      observationEntry.params?.startTime ?? observationEntry.params?.timestamp,
    ),
  };
}

export function getEvalPreviewPointerFromUrlQuery(
  query: NextRouter["query"],
  target: EvalTargetObjectType,
): EvalPreviewPointer | undefined {
  const traceId = typeof query.traceId === "string" ? query.traceId : undefined;
  if (!traceId) return undefined;

  const observationId =
    typeof query.observationId === "string" ? query.observationId : undefined;
  const timestamp =
    target === EvalTargetObject.TRACE
      ? parseTimestamp(query.timestamp)
      : (parseTimestamp(query.startTime) ?? parseTimestamp(query.timestamp));

  if (target === EvalTargetObject.TRACE) {
    return { traceId, timestamp };
  }

  return observationId && timestamp
    ? { traceId, observationId, timestamp }
    : undefined;
}

export function buildEvalPreviewNavigationPath({
  basePath,
  entry,
  target,
}: {
  basePath: string;
  entry: ListEntry;
  target: EvalTargetObjectType;
}) {
  const pointer = getEvalPreviewPointerFromDetailPageEntry(entry, target);
  if (!pointer) return basePath;

  const params = new URLSearchParams();

  if (pointer.traceId) params.set("traceId", pointer.traceId);
  if (pointer.observationId) params.set("observationId", pointer.observationId);
  if (pointer.timestamp) {
    params.set(
      target === EvalTargetObject.TRACE ? "timestamp" : "startTime",
      pointer.timestamp.toISOString(),
    );
  }

  return `${basePath}${basePath.includes("?") ? "&" : "?"}${params.toString()}`;
}

export function useFirstEvalPreviewNavigationEntry({
  target,
  useEventsTable,
}: {
  target: EvalTargetObjectType;
  useEventsTable: boolean;
}): EvalPreviewDetailPageListEntry | undefined {
  const key = getEvalPreviewDetailPageListKey(target, useEventsTable);
  return useFirstDetailPageListEntry<EvalPreviewDetailPageListEntry>(key);
}

export function useFirstEvalPreviewPointer({
  target,
  useEventsTable,
}: {
  target: EvalTargetObjectType;
  useEventsTable: boolean;
}): EvalPreviewPointer | undefined {
  const entry = useFirstEvalPreviewNavigationEntry({ target, useEventsTable });
  return getEvalPreviewPointerFromDetailPageEntry(entry, target);
}
