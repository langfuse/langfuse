import { createHash } from "node:crypto";

export const generateBatchActionId = (
  projectId: string,
  actionId: string,
  tableName: string,
) => {
  return `${projectId}-${tableName}-${actionId}`;
};

const TERMINAL_BATCH_ACTION_JOB_STATES = new Set(["completed", "failed"]);

export function normalizeBatchActionMaterial(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeBatchActionMaterial(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeBatchActionMaterial(child)]),
    );
  }
  return value ?? null;
}

export function batchActionMaterialKey(
  query: unknown,
  targetId?: string | null,
): string {
  return JSON.stringify(
    normalizeBatchActionMaterial({
      query,
      targetId: targetId ?? null,
    }),
  );
}

export function batchActionOperationJobId(
  baseId: string,
  query: unknown,
  targetId?: string | null,
): string {
  const digest = createHash("sha256")
    .update(batchActionMaterialKey(query, targetId))
    .digest("hex")
    .slice(0, 16);
  return `${baseId}-${digest}`;
}

export type RetainedBatchActionJob = {
  state: string;
  query: unknown;
  targetId?: string | null;
};

/**
 * The base id is the BullMQ dedup key the UI polls. A completed or failed
 * job keeps that id, so a later request has to replace it. A different
 * request that arrives while the retained job is still running gets its
 * own id instead of being dropped onto the old payload.
 */
export function planBatchActionQueueJob(params: {
  baseId: string;
  query: unknown;
  targetId?: string | null;
  existing: RetainedBatchActionJob | null;
}): { jobId: string; removeExisting: boolean } {
  if (!params.existing) {
    return { jobId: params.baseId, removeExisting: false };
  }

  if (TERMINAL_BATCH_ACTION_JOB_STATES.has(params.existing.state)) {
    return { jobId: params.baseId, removeExisting: true };
  }

  const sameRequest =
    batchActionMaterialKey(params.query, params.targetId) ===
    batchActionMaterialKey(
      params.existing.query,
      params.existing.targetId,
    );
  if (sameRequest) {
    return { jobId: params.baseId, removeExisting: false };
  }

  return {
    jobId: batchActionOperationJobId(
      params.baseId,
      params.query,
      params.targetId,
    ),
    removeExisting: false,
  };
}
