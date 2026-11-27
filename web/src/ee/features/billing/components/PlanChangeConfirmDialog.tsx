import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

type PlanChangeConfirmDialogProps = {
  /** `switch-now` replaces a legacy subscription at once. */
  change: "upgrade" | "downgrade" | "switch-now";
  currentPlanName: string;
  newPlanName: string;
  isProcessing: boolean;
  onConfirm: () => void;
};

function ChangeTerms({ change }: Pick<PlanChangeConfirmDialogProps, "change">) {
  switch (change) {
    case "switch-now":
      return (
        <>
          <p>
            We will end your current subscription now and start a new one
            immediately.
          </p>
          <p>
            You will receive an invoice today that includes (1) the base fee for
            the new plan for a fresh billing period starting today and (2) your
            base-fee and usage to date on the previous subscription.
          </p>
          <p>
            By confirming, you accept the immediate invoice and plan activation
            starting now.
          </p>
        </>
      );
    case "upgrade":
      return (
        <>
          <p>
            You will be charged a prorated base fee today for the remainder of
            this billing period. Features update immediately; usage-based
            charges continue for the rest of the billing period.
          </p>
          <p>
            Example: if your plan is $199/month and you upgrade halfway through
            the month to a $499/month plan, the prorated charge is roughly $99.5
            + $249.5 (plus taxes). Exact amounts depend on timing and tax.
          </p>
          <p>
            By confirming, you accept the prorated charge and immediate plan
            change.
          </p>
        </>
      );
    case "downgrade":
      return (
        <>
          <p>
            No charge is made today. You stay on your current plan until the end
            of this billing period, then we switch you to the new plan. You can
            switch back anytime.
          </p>
          <p>
            Usage continues to be billed under your current plan until the
            switch. By confirming, you schedule the change at period end and
            understand features will adjust at that time.
          </p>
        </>
      );
  }
}

/** The terms of a plan change, accepted before it is made. */
export function PlanChangeConfirmDialog({
  change,
  currentPlanName,
  newPlanName,
  isProcessing,
  onConfirm,
}: PlanChangeConfirmDialogProps) {
  return (
    <Dialog
      title={`Confirm Your Change: ${currentPlanName} → ${newPlanName}`}
      closeLabel="Cancel"
      actions={[
        { label: "Confirm", loading: isProcessing, onClick: onConfirm },
      ]}
    >
      <Dialog.Body>
        <ChangeTerms change={change} />
      </Dialog.Body>
    </Dialog>
  );
}
