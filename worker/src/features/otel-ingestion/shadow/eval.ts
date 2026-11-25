import type { ObservationEvalSchedulerDeps } from "../../evaluation/observationEval/types";
import {
  recordTraceActivity,
  type TraceSpanActivity,
} from "../../traceDispatch/traceRuleRecording";
import type { OtelSchedulingHooks } from "../processingHooks";
import type { ShadowScope } from "./context";

function traceRecordingIdentity(
  projectId: string,
  activity: readonly TraceSpanActivity[],
) {
  // The writers estimate bytes differently and can finish spans in different orders.
  return {
    projectId,
    activity: activity
      .map(({ traceId, spanStartTimeISO, ruleIds }) =>
        JSON.stringify([traceId, spanStartTimeISO, [...ruleIds].sort()]),
      )
      .sort(),
  };
}

function captureObservationWrites(
  scope: ShadowScope,
  real: ObservationEvalSchedulerDeps,
): ObservationEvalSchedulerDeps {
  return {
    uploadObservationToS3: (params) =>
      scope.effect("eval-snapshot-upload", params, () =>
        real.uploadObservationToS3(params),
      ),
    upsertJobExecution: (params) =>
      scope.effect("eval-job-execution", params, () =>
        real.upsertJobExecution(params),
      ),
    enqueueEvalJob: (params) =>
      scope.effect("eval-job-enqueue", params, () =>
        real.enqueueEvalJob(params),
      ),
  };
}

export function schedulingHooks(scope: ShadowScope): OtelSchedulingHooks {
  return {
    observationWrites: (real) => captureObservationWrites(scope, real),
    recordTraceActivity: (projectId, activity) =>
      scope.effect(
        "trace-recording-write",
        traceRecordingIdentity(projectId, activity),
        () => recordTraceActivity(projectId, activity),
      ),
  };
}
