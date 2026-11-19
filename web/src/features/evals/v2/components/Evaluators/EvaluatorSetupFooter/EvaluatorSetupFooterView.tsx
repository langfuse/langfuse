import { ArrowRight } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

type EvaluatorSetupFooterViewBaseProps = {
  closeLabel: string;
  saveLabel: string;
  isSaving: boolean;
  saveDisabled: boolean;
  disabledReason: string | null;
  onClose: () => void;
  onSave: () => void;
};

export type EvaluatorSetupFooterViewProps =
  EvaluatorSetupFooterViewBaseProps & {
    mode: "create" | "edit";
  };

export function EvaluatorSetupFooterView(props: EvaluatorSetupFooterViewProps) {
  const {
    closeLabel,
    saveLabel,
    isSaving,
    saveDisabled,
    disabledReason,
    onClose,
    onSave,
  } = props;
  const saveButton = (
    <Button
      type="button"
      disabled={saveDisabled}
      loading={isSaving}
      className={cn("gap-1.5", disabledReason && "pointer-events-none")}
      onClick={onSave}
    >
      {saveLabel}
      {props.mode === "create" ? (
        <ArrowRight size="base" aria-hidden="true" />
      ) : null}
    </Button>
  );

  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-3">
      <Button type="button" variant="outline" onClick={onClose}>
        {closeLabel}
      </Button>
      {disabledReason ? (
        <Tooltip label={disabledReason}>
          {({ getTriggerProps }) => (
            <span
              {...getTriggerProps()}
              className="inline-flex cursor-not-allowed"
              tabIndex={0}
            >
              {saveButton}
            </span>
          )}
        </Tooltip>
      ) : (
        saveButton
      )}
    </div>
  );
}
