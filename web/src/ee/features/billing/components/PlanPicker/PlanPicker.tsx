import { Button } from "@/src/components/design-system/Button/Button";
import { DisabledActionTooltip } from "@/src/components/design-system/DisabledActionTooltip/DisabledActionTooltip";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import {
  type CloudPlan,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { planChangeDue } from "@/src/ee/features/billing/fns/planChangeDue";
import {
  type PlanPickerAction,
  planPickerAction,
} from "@/src/ee/features/billing/fns/planPickerAction";
import { planPickerRows } from "@/src/ee/features/billing/fns/planPickerRows";
import { type PlanPickerSubscription } from "@/src/ee/features/billing/types/PlanPickerSubscription";

import { PlanPickerBar } from "./PlanPickerBar";
import { PlanPickerChange } from "./PlanPickerChange";
import { PlanPickerList } from "./PlanPickerList";
import {
  PlanPickerStatus,
  type PlanPickerStatusValue,
} from "./PlanPickerStatus";

type PlanPickerProps = {
  currentPlan: CloudPlan;
  pickedPlan: CloudPlan;
  subscription: PlanPickerSubscription;
  onPickPlan: (plan: CloudPlan) => void;
  /** The button that starts the change; missing when the picked plan needs none. */
  primaryAction: {
    label: string;
    isLoading: boolean;
    /** Set when the change cannot start: the button is disabled and says why on hover. */
    disabledReason: string | null;
    onClick: () => void;
  } | null;
  closeLabel: string;
  onClose: () => void;
};

const statusOf = (
  currentPlan: CloudPlan,
  subscription: PlanPickerSubscription,
): PlanPickerStatusValue | null => {
  const planName = pricingPlans[currentPlan].name;
  const { pending, periodEnd, trialPlanName } = subscription;
  if (trialPlanName !== null) return { kind: "trial", planName: trialPlanName };
  if (pending?.kind === "cancel")
    return { kind: "cancel-scheduled", planName, endsOn: periodEnd };
  if (pending?.kind === "switch")
    return {
      kind: "switch-scheduled",
      planName,
      nextPlanName: pricingPlans[pending.to].name,
      startsOn: periodEnd,
    };
  // Nothing scheduled: the list already says which plan is yours, what it costs and when it renews.
  return null;
};

const scheduledName = (pending: PlanPickerSubscription["pending"]) => {
  if (pending === null) return null;
  switch (pending.kind) {
    case "cancel":
      return "cancellation";
    case "switch":
      return `switch to ${pricingPlans[pending.to].name}`;
  }
};

/** Says what a change does to something already scheduled; nothing when the pick leaves it alone. */
const pendingNoteOf = (
  action: PlanPickerAction,
  pending: PlanPickerSubscription["pending"],
): string | null => {
  const scheduled = scheduledName(pending);
  if (scheduled === null) return null;
  switch (action) {
    case "upgrade":
    case "switch-now":
      return `This also removes the scheduled ${scheduled}.`;
    case "downgrade":
      return `This replaces the scheduled ${scheduled}.`;
    case "none":
    case "scheduled":
    case "checkout":
    case "keep":
    case "reactivate":
    case "payment-method-required":
      return null;
  }
};

/** Pick a plan on the left, see what it changes on the right, and what is due below. */
export function PlanPicker({
  currentPlan,
  pickedPlan,
  subscription,
  onPickPlan,
  primaryAction,
  closeLabel,
  onClose,
}: PlanPickerProps) {
  const action = planPickerAction(currentPlan, pickedPlan, subscription);
  const status = statusOf(currentPlan, subscription);
  const isPaymentMethodMissing =
    subscription.hasSubscription && !subscription.hasValidPaymentMethod;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {status !== null || isPaymentMethodMissing ? (
        <div className="flex flex-col gap-2 px-5 pb-4">
          {status !== null ? <PlanPickerStatus status={status} /> : null}
          {isPaymentMethodMissing ? (
            <Banner variant="error">
              No valid payment method. Update your billing details to change
              plan.
            </Banner>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 overflow-y-auto border-t md:grid-cols-[25rem_minmax(0,1fr)] md:overflow-hidden">
        <div className="flex flex-col gap-4 border-b p-2 md:border-r md:border-b-0">
          <PlanPickerList
            rows={planPickerRows(currentPlan, subscription)}
            pickedPlan={pickedPlan}
            onPickPlan={onPickPlan}
          />
          <div className="mt-auto flex justify-center">
            <Button
              variant="text"
              size="sm"
              text="Compare all plans"
              href="https://langfuse.com/pricing"
            />
          </div>
          <p className="text-muted-foreground mx-3 mb-2 border-t pt-3 text-xs">
            <span className="text-foreground font-bold">
              Need a custom plan?
            </span>{" "}
            Yearly contracts, invoices and volume pricing go through our team.{" "}
            <Button
              variant="text"
              size="sm"
              text="Talk to sales"
              href="https://langfuse.com/talk-to-us"
            />
          </p>
        </div>
        <div className="min-h-0 md:overflow-y-auto">
          <PlanPickerChange
            currentPlan={currentPlan}
            pickedPlan={pickedPlan}
            pendingNote={pendingNoteOf(action, subscription.pending)}
          />
        </div>
      </div>

      <footer className="bg-muted flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t px-5 py-3">
        <PlanPickerBar
          cells={planChangeDue(action, currentPlan, pickedPlan, subscription)}
        />
        <div className="flex items-center gap-2">
          <Button variant="ghost" text={closeLabel} onClick={onClose} />
          {primaryAction?.disabledReason ? (
            <DisabledActionTooltip label={primaryAction.disabledReason}>
              <Button text={primaryAction.label} disabled />
            </DisabledActionTooltip>
          ) : null}
          {primaryAction && !primaryAction.disabledReason ? (
            <Button
              text={primaryAction.label}
              loading={primaryAction.isLoading}
              onClick={primaryAction.onClick}
            />
          ) : null}
        </div>
      </footer>
    </div>
  );
}
