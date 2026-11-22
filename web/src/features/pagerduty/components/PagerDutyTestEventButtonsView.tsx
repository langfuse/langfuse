import { CircleCheck, Send } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import {
  type PagerDutyTestEventState,
  type PagerDutyTestEventTarget,
} from "../hooks/usePagerDutyTestEvent";
import { PagerDutyTestEventDialogController } from "./PagerDutyTestEventDialogController";

/** PagerDutyTestEventButtonsView sends a critical test alert after a warning, then offers to resolve it. */
export function PagerDutyTestEventButtonsView({
  target,
  testEvent,
  disabled = false,
}: {
  target: PagerDutyTestEventTarget;
  testEvent: PagerDutyTestEventState;
  disabled?: boolean;
}) {
  const isDisabled =
    disabled || !testEvent.canSend || !(target.routingKey || target.actionId);

  return (
    <PagerDutyTestEventDialogController testEvent={testEvent}>
      {({ openDialog }) => (
        <TestEventButton
          target={target}
          testEvent={testEvent}
          disabled={isDisabled}
          onSend={() => openDialog(target)}
        />
      )}
    </PagerDutyTestEventDialogController>
  );
}

/** TestEventButton shows the send button, or the resolve button while the test alert is open. */
function TestEventButton({
  target,
  testEvent,
  disabled,
  onSend,
}: {
  target: PagerDutyTestEventTarget;
  testEvent: PagerDutyTestEventState;
  disabled: boolean;
  onSend: () => void;
}) {
  if (testEvent.isTestAlertOpen) {
    return (
      <Button
        type="button"
        text="Resolve test event"
        variant="secondary"
        size="sm"
        icon={CircleCheck}
        disabled={disabled || testEvent.isResolving}
        onClick={() => testEvent.onResolve(target)}
      />
    );
  }
  return (
    <Button
      type="button"
      text="Send test event"
      variant="secondary"
      size="sm"
      icon={Send}
      disabled={disabled}
      onClick={onSend}
    />
  );
}
