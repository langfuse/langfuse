import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { usePagerDutyTestEvent } from "../hooks/usePagerDutyTestEvent";
import { PagerDutyTestEventButtonsView } from "./PagerDutyTestEventButtonsView";

/** PagerDutyTestEventButtons triggers a critical test alert, then offers to resolve it. */
export function PagerDutyTestEventButtons({
  projectId,
  region,
  routingKey,
  actionId,
  disabled = false,
}: {
  projectId: string;
  region: PagerDutyRegion;
  routingKey: string | undefined;
  actionId: string | undefined;
  disabled?: boolean;
}) {
  const testEvent = usePagerDutyTestEvent(projectId);

  return (
    <PagerDutyTestEventButtonsView
      target={{ region, routingKey, actionId }}
      testEvent={testEvent}
      disabled={disabled}
    />
  );
}
