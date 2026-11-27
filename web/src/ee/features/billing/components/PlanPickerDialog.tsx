import { X } from "@langfuse/icons";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type ComponentProps, useRef, useState } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  type CloudPlan,
  cloudPlans,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";
import { defaultPickedPlan } from "@/src/ee/features/billing/fns/defaultPickedPlan";
import { planPickerAction } from "@/src/ee/features/billing/fns/planPickerAction";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
import { type PlanPickerSubscription } from "@/src/ee/features/billing/types/PlanPickerSubscription";

import { KeepPlanConfirmDialog } from "./KeepPlanConfirmDialog";
import { PlanChangeConfirmDialog } from "./PlanChangeConfirmDialog";
import { PlanPicker } from "./PlanPicker/PlanPicker";
import { ReactivateSubscriptionConfirmDialog } from "./ReactivateSubscriptionConfirmDialog";

type PlanChangeDirection = "upgrade" | "downgrade";

type PlanPickerDialogProps = {
  currentPlan: CloudPlan;
  subscription: PlanPickerSubscription;
  isProcessing: boolean;
  onClose: () => void;
  onCheckout: (plan: CloudPlan) => void;
  onChangePlan: (plan: CloudPlan) => void;
  onKeepPlan: () => void;
  onReactivate: () => void;
  /** A person picked a plan in the list; not called for the plan the picker opens on. */
  onAfterPickPlan: (plan: CloudPlan, direction: PlanChangeDirection) => void;
  onAfterOpenConfirm: (plan: CloudPlan, direction: PlanChangeDirection) => void;
};

type Confirming =
  | {
      kind: "change";
      plan: CloudPlan;
      change: ComponentProps<typeof PlanChangeConfirmDialog>["change"];
    }
  | { kind: "keep" }
  | { kind: "reactivate" };

type PrimaryAction = ComponentProps<typeof PlanPicker>["primaryAction"];

const PAYMENT_METHOD_REQUIRED =
  "Payment method required. Update your billing details first.";

/**
 * The plan picker in a dialog of its own: wider than the design system's
 * dialog and one fixed height, with what is due beside the buttons. Its button
 * starts checkout or opens the terms of the change.
 */
export function PlanPickerDialog({
  currentPlan,
  subscription,
  isProcessing,
  onClose,
  onCheckout,
  onChangePlan,
  onKeepPlan,
  onReactivate,
  onAfterPickPlan,
  onAfterOpenConfirm,
}: PlanPickerDialogProps) {
  const [pickedPlan, setPickedPlan] = useState(() =>
    defaultPickedPlan(currentPlan, subscription.pending),
  );
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const container = useLayerContainer("modal");
  const contentRef = useRef<HTMLDivElement>(null);
  const [popoverContainer, setPopoverContainer] =
    useState<HTMLDivElement | null>(null);

  const currentName = pricingPlans[currentPlan].name;
  const pickedName = pricingPlans[pickedPlan].name;
  const directionTo = (plan: CloudPlan): PlanChangeDirection =>
    cloudPlans.indexOf(plan) > cloudPlans.indexOf(currentPlan)
      ? "upgrade"
      : "downgrade";

  const openChangeConfirm = (
    change: Extract<Confirming, { kind: "change" }>["change"],
  ) => {
    setConfirming({ kind: "change", plan: pickedPlan, change });
    onAfterOpenConfirm(pickedPlan, directionTo(pickedPlan));
  };

  const action = planPickerAction(currentPlan, pickedPlan, subscription);
  // The close button says what closing means when the other button changes the plan.
  const isChangeOffered =
    action === "checkout" ||
    action === "upgrade" ||
    action === "downgrade" ||
    action === "switch-now";

  const opens = (label: string, onClick: () => void): PrimaryAction => ({
    label,
    isLoading: false,
    disabledReason: null,
    onClick,
  });

  const primaryAction = (): PrimaryAction => {
    switch (action) {
      case "none":
      case "scheduled":
        return null;
      case "checkout":
        return {
          label: "Continue to checkout",
          isLoading: isProcessing,
          disabledReason: null,
          onClick: () => onCheckout(pickedPlan),
        };
      case "upgrade":
        return opens(`Upgrade to ${pickedName}`, () =>
          openChangeConfirm("upgrade"),
        );
      case "downgrade":
        return opens(`Downgrade to ${pickedName}`, () =>
          openChangeConfirm("downgrade"),
        );
      case "switch-now":
        return opens(`Switch to ${pickedName}`, () =>
          openChangeConfirm("switch-now"),
        );
      case "keep":
        return opens(`Keep ${currentName}`, () =>
          setConfirming({ kind: "keep" }),
        );
      case "reactivate":
        return opens(`Keep ${currentName}`, () =>
          setConfirming({ kind: "reactivate" }),
        );
      case "payment-method-required":
        return {
          label: `Switch to ${pickedName}`,
          isLoading: false,
          disabledReason: PAYMENT_METHOD_REQUIRED,
          onClick: () => undefined,
        };
    }
  };

  const confirmDialog = (state: Confirming) => {
    switch (state.kind) {
      case "change":
        return (
          <PlanChangeConfirmDialog
            change={state.change}
            currentPlanName={currentName}
            newPlanName={pricingPlans[state.plan].name}
            isProcessing={isProcessing}
            onConfirm={() => onChangePlan(state.plan)}
          />
        );
      case "keep":
        return (
          <KeepPlanConfirmDialog
            isProcessing={isProcessing}
            onConfirm={onKeepPlan}
          />
        );
      case "reactivate":
        return (
          <ReactivateSubscriptionConfirmDialog
            isProcessing={isProcessing}
            onConfirm={onReactivate}
          />
        );
    }
  };

  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/25 dark:bg-black/45" />
      <DialogPrimitive.Content
        ref={contentRef}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          const picked = contentRef.current?.querySelector<HTMLElement>(
            '[role="radio"][data-state="checked"]',
          );
          if (!picked) return;
          event.preventDefault();
          picked.focus();
        }}
        className="bg-modal fixed top-0 left-0 flex h-dvh w-full flex-col shadow-lg sm:top-[50%] sm:left-[50%] sm:h-[46rem] sm:max-h-[90vh] sm:max-w-[60rem] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg"
      >
        <div className="isolate flex min-h-0 flex-1 flex-col overflow-hidden text-sm sm:rounded-lg">
          <header className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4 pb-3">
            <DialogPrimitive.Title className="text-lg leading-none font-bold tracking-tight">
              Change plan
            </DialogPrimitive.Title>
            <div className="flex items-center gap-3">
              <DialogPrimitive.Close className="ring-offset-background focus-visible:ring-ring hover:bg-accent text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md focus:outline-hidden focus-visible:ring-1">
                <X size="base" aria-hidden />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </header>
          <PopoverLayerProvider container={popoverContainer}>
            <PlanPicker
              currentPlan={currentPlan}
              pickedPlan={pickedPlan}
              subscription={subscription}
              primaryAction={primaryAction()}
              closeLabel={isChangeOffered ? `Keep ${currentName}` : "Close"}
              onClose={onClose}
              onPickPlan={(plan) => {
                if (plan === pickedPlan) return;
                setPickedPlan(plan);
                if (plan !== currentPlan)
                  onAfterPickPlan(plan, directionTo(plan));
              }}
            />
            {confirming ? (
              <DialogController<Confirming>
                initialState={() => confirming}
                onDismiss={() => setConfirming(null)}
                renderDialog={({ state }) => confirmDialog(state)}
              >
                {() => null}
              </DialogController>
            ) : null}
          </PopoverLayerProvider>
        </div>
        <div
          className="isolate"
          data-layer="popover"
          ref={setPopoverContainer}
        />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
