import {
  AgentGraphDataSchema,
  type AgentGraphDataResponse,
} from "@/src/features/trace-graph-view/types";

export function mapAgentGraphRecord(
  record: unknown,
  scope: "trace" | "session",
): AgentGraphDataResponse | null {
  const parsed = AgentGraphDataSchema.safeParse(record);
  if (!parsed.success) return null;

  const data = parsed.data;
  const hasLangGraphData = data.step != null && data.node != null;
  if (!hasLangGraphData && data.type === "EVENT") return null;

  if (scope === "session") {
    if (!data.trace_id) return null;

    return {
      id: `${data.trace_id}:${data.id}`,
      selectionId: data.id,
      traceId: data.trace_id,
      node: hasLangGraphData ? (data.node ?? null) : data.name,
      step: hasLangGraphData ? (data.step ?? null) : 0,
      parentObservationId: data.parent_observation_id
        ? `${data.trace_id}:${data.parent_observation_id}`
        : null,
      name: data.name,
      startTime: data.start_time,
      endTime: data.end_time ?? undefined,
      observationType: data.type,
    };
  }

  return {
    id: data.id,
    node: hasLangGraphData ? (data.node ?? null) : data.name,
    step: hasLangGraphData ? (data.step ?? null) : 0,
    parentObservationId: data.parent_observation_id || null,
    name: data.name,
    startTime: data.start_time,
    endTime: data.end_time ?? undefined,
    observationType: data.type,
  };
}
