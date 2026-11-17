import { createHash } from "node:crypto";
import type { buildAgentsActivityDemoPlan } from "./agents-activity-demo-plan";
import { activityDemoOtlpPayload } from "./agents-activity-demo-replay";

const digest = (value: string, length: number) =>
  createHash("sha256").update(value).digest("hex").slice(0, length);
const traceId = (value: string) => digest(`trace:${value}`, 32);
const spanId = (trace: string, span: string) =>
  digest(`span:${trace}:${span}`, 16);

/** Preserve authored history while assigning stable, trace-scoped OTLP identifiers. */
export function buildActivityDemoApiPayload(
  plan: ReturnType<typeof buildAgentsActivityDemoPlan>,
) {
  const events = plan.events.map((event) => ({
    ...event,
    id: spanId(event.trace_id, event.span_id),
    trace_id: traceId(event.trace_id),
    span_id: spanId(event.trace_id, event.span_id),
    parent_span_id: event.parent_span_id
      ? spanId(event.trace_id, event.parent_span_id)
      : "",
    agent_run_id: event.agent_run_id
      ? spanId(event.trace_id, event.agent_run_id)
      : "",
  }));
  const scores = plan.scores.map((score) => ({
    ...score,
    id: digest(`score:${score.id}`, 32),
    trace_id: score.trace_id ? traceId(score.trace_id) : null,
    observation_id:
      score.trace_id && score.observation_id
        ? spanId(score.trace_id, score.observation_id)
        : null,
  }));
  return activityDemoOtlpPayload(events, scores);
}
