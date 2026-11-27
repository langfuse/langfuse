import { Button } from "@/src/components/ui/button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

export type EvaluatorSetupFooterViewProps = {
  closeLabel: string;
  saveLabel: string;
  isSaving: boolean;
  saveDisabled: boolean;
  disabledReason: string | null;
  onClose: () => void;
  onSave: () => void;
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
      className={disabledReason ? "pointer-events-none" : undefined}
      onClick={onSave}
    >
      {saveLabel}
    </Button>
  );

  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2.5">
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
