import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { EvaluatorAssistantActionButton } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupFooter/components/EvaluatorAssistantActionButton/EvaluatorAssistantActionButton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

type EvaluatorSetupFooterViewBaseProps = {
  closeLabel: string;
  saveLabel: string;
  isSaving: boolean;
  saveDisabled: boolean;
  disabledReason: string | null;
  assistantAction: {
    label: "Create with AI" | "Edit with AI";
    disabled: boolean;
    onClick: () => void;
  } | null;
  onClose: () => void;
  onSave: () => void;
};

export type EvaluatorSetupFooterViewProps = EvaluatorSetupFooterViewBaseProps &
  ({ mode: "create"; children: ReactNode } | { mode: "edit" });

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
        <ArrowRight className="icon-base shrink-0" aria-hidden="true" />
      ) : null}
    </Button>
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 sm:px-6">
      {props.mode === "create" ? (
        <p className="text-muted-foreground min-w-0 basis-full text-sm sm:flex-1 sm:basis-0">
          {props.children}
        </p>
      ) : null}
      <div className="ml-auto flex w-full flex-wrap justify-end gap-2 sm:w-auto">
        {props.assistantAction ? (
          <EvaluatorAssistantActionButton {...props.assistantAction} />
        ) : null}
        <Button type="button" variant="outline" onClick={onClose}>
          {closeLabel}
        </Button>
        {disabledReason ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-not-allowed" tabIndex={0}>
                {saveButton}
              </span>
            </TooltipTrigger>
            <TooltipContent>{disabledReason}</TooltipContent>
          </Tooltip>
        ) : (
          saveButton
        )}
      </div>
    </div>
  );
}
