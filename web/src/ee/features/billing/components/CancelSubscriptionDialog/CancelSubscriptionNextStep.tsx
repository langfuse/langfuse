import {
  type CancellationNextStep,
  cancellationNextStepContent,
  type CancellationReason,
  cancellationReasons,
} from "@/src/ee/features/billing/utils/cancellationReasons";

export function CancelSubscriptionNextStep({
  reason,
  nextStep,
}: {
  reason: CancellationReason;
  nextStep: CancellationNextStep;
}) {
  const reasonLabel = cancellationReasons.find(
    (option) => option.id === reason,
  )?.label;
  const content = cancellationNextStepContent[nextStep];

  return (
    <div className="bg-muted/50 flex flex-col gap-1 rounded-md border p-3">
      <p className="text-muted-foreground text-xs">You said: {reasonLabel}</p>
      <p className="font-medium">{content.title}</p>
      <p className="text-muted-foreground">{content.detail}</p>
    </div>
  );
}
