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
  assistantAction: {
    label: "Create with AI" | "Edit with AI";
    triggerRef: RefObject<HTMLButtonElement | null>;
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
      {props.assistantAction ? (
        <Button
          ref={props.assistantAction.triggerRef}
          type="button"
          variant="outline"
          disabled={props.assistantAction.disabled}
          className="w-full gap-1.5 sm:w-auto"
          onClick={props.assistantAction.onClick}
        >
          <WandSparkles className="icon-base" aria-hidden="true" />
          {props.assistantAction.label}
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
