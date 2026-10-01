import type { ReactNode, RefObject } from "react";
import { ArrowRight, WandSparkles } from "lucide-react";
import { Button } from "@/src/components/ui/button";
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
  onClose: () => void;
  onSave: () => void;
};

export type EvaluatorSetupFooterViewProps = EvaluatorSetupFooterViewBaseProps &
  (
    | { mode: "create"; children: ReactNode }
    | {
        mode: "edit";
        editWithAI: {
          triggerRef: RefObject<HTMLButtonElement | null>;
          disabled: boolean;
          onClick: () => void;
        } | null;
      }
  );

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
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : null}
    </Button>
  );

  return (
    <div className="flex shrink-0 items-center gap-4 border-t px-6 py-3">
      {props.mode === "create" ? (
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">
          {props.children}
        </p>
      ) : null}
      {props.mode === "edit" && props.editWithAI ? (
        <Button
          ref={props.editWithAI.triggerRef}
          type="button"
          variant="outline"
          disabled={props.editWithAI.disabled}
          className="gap-1.5"
          onClick={props.editWithAI.onClick}
        >
          <WandSparkles className="h-4 w-4" aria-hidden="true" />
          Edit with AI
        </Button>
      ) : null}
      <div className="ml-auto flex shrink-0 gap-2">
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
