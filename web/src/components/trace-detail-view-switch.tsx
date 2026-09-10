import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { Trace, TraceDetailBody } from "@/src/features/traces";
import { TracePage } from "@/src/features/traces/TracePage";
import {
  Trace as LegacyTrace,
  TraceDetailBody as LegacyTraceDetailBody,
} from "@/src/features/traces-legacy";
import { TracePage as LegacyTracePage } from "@/src/features/traces-legacy/TracePage";

/**
 * The `updatedTraceView` internal flag picks which trace detail
 * implementation renders: `features/traces` when on, the frozen
 * `features/traces-legacy` snapshot when off. Without a project (a public,
 * unauthenticated trace) no flag can be resolved, so legacy wins.
 *
 * Every entry point outside `features/traces` that renders the detail view
 * goes through one of the switches below, so the flag has a single meaning.
 */
const useUpdatedTraceView = (projectId: string | undefined) =>
  useIsFeatureEnabled("updatedTraceView", { projectId });

/** The standalone trace page (`/project/[projectId]/traces/[traceId]`). */
export function TracePageSwitch({
  projectId,
  ...props
}: React.ComponentProps<typeof TracePage> & { projectId: string }) {
  return useUpdatedTraceView(projectId) ? (
    <TracePage {...props} />
  ) : (
    <LegacyTracePage {...props} />
  );
}

/** The detail body rendered inside the peek panels. */
export function TraceDetailBodySwitch({
  projectId,
  ...props
}: React.ComponentProps<typeof TraceDetailBody> & { projectId: string }) {
  return useUpdatedTraceView(projectId) ? (
    <TraceDetailBody {...props} />
  ) : (
    <LegacyTraceDetailBody {...props} />
  );
}

/** The bare trace view, used by the annotation queue processor. */
export function TraceViewSwitch(props: React.ComponentProps<typeof Trace>) {
  return useUpdatedTraceView(props.projectId) ? (
    <Trace {...props} />
  ) : (
    <LegacyTrace {...props} />
  );
}
