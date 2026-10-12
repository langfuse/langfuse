import { z } from "zod";
import { prisma } from "../db";

// The minimum stays at least 2x the 30 s dispatch interval so event batches of
// one trace are not dispatched separately. The maximum stays below the 2 h
// pending TTL, after which idle traces are dropped before dispatch. The DB does
// not enforce these, so every write goes through this schema.
export const TRACE_IDLE_MS_MIN = 60_000;
export const TRACE_IDLE_MS_MAX = 3_600_000;

export const tracingReadinessSettingsSchema = z.object({
  traceIdleMs: z
    .number()
    .int()
    .min(TRACE_IDLE_MS_MIN)
    .max(TRACE_IDLE_MS_MAX)
    .nullable(),
});

export type TracingReadinessSettings = z.infer<
  typeof tracingReadinessSettingsSchema
>;

/** Null fields mean the deployment default; a project without a row has all nulls. */
export async function getTracingReadinessSettings(
  projectId: string,
): Promise<TracingReadinessSettings> {
  const row = await prisma.tracingReadinessSettings.findUnique({
    where: { projectId },
    select: { traceIdleMs: true },
  });
  return { traceIdleMs: row?.traceIdleMs ?? null };
}

export async function saveTracingReadinessSettings(
  projectId: string,
  settings: TracingReadinessSettings,
): Promise<TracingReadinessSettings> {
  const data = tracingReadinessSettingsSchema.parse(settings);
  const row = await prisma.tracingReadinessSettings.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
    select: { traceIdleMs: true },
  });
  return { traceIdleMs: row.traceIdleMs };
}
