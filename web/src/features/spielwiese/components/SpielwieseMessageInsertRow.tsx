import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";

type SpielwieseMessageInsertRowProps = {
  className?: string;
  controlIdBase?: string;
  nodeId: string;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
  ) => void;
  rowTestId?: string;
  surface?: "bare" | "framed";
  testIdBase?: string;
  triggerContent?: ReactNode;
  variant?: "compact" | "text";
};

const insertOptions: Array<{
  kind: "user" | "system" | "assistant" | "tool";
  label: string;
}> = [
  { kind: "user", label: "User" },
  { kind: "system", label: "Instructions" },
  { kind: "assistant", label: "Assistant" },
  { kind: "tool", label: "Tool" },
];

const insertShellClassName =
  "bg-background inline-flex h-7 items-stretch overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] shadow-[0_1px_0_rgba(255,255,255,0.5)_inset]";
const bareInsertShellClassName = "inline-flex h-7 items-stretch overflow-visible";

function SpielwieseMessageInsertPicker({
  isOpen,
  nodeId,
  pickerId,
  pickerTestId,
  onClose,
  onPromptSectionInsert,
}: {
  isOpen: boolean;
  nodeId: string;
  pickerId: string;
  pickerTestId: string;
  onClose: () => void;
  onPromptSectionInsert: SpielwieseMessageInsertRowProps["onPromptSectionInsert"];
}) {
  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        "flex h-full shrink-0 items-stretch overflow-hidden border-l transition-[max-width,border-color,background-color] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        isOpen
          ? "max-w-[14.5rem] border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.035)]"
          : "pointer-events-none max-w-0 border-transparent bg-transparent",
      )}
      data-state={isOpen ? "open" : "closed"}
      data-testid={pickerTestId}
      id={pickerId}
    >
      <div
        className={cn(
          "flex w-max items-center gap-0.5 pr-px pl-0 transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
          isOpen
            ? "translate-x-0 opacity-100 delay-75"
            : "translate-x-1 opacity-0 delay-0",
        )}
      >
        {insertOptions.map((option) => (
          <Button
            key={option.kind}
            className="text-foreground/72 hover:bg-background/80 hover:text-foreground h-5 rounded-md px-2 text-[11px] font-medium"
            disabled={!isOpen}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              onPromptSectionInsert(nodeId, option.kind);
              onClose();
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

type SpielwieseInsertRowConfig = {
  ariaLabel?: string;
  buttonClassName: string;
  buttonContent: ReactNode;
  buttonTestId: string;
  pickerId: string;
  pickerTestId: string;
  rowClassName: string;
  shellTestId: string;
};

function getInsertRowConfig(
  nodeId: string,
  variant: NonNullable<SpielwieseMessageInsertRowProps["variant"]>,
  {
    controlIdBase,
    testIdBase,
    triggerContent,
  }: Pick<
    SpielwieseMessageInsertRowProps,
    "controlIdBase" | "testIdBase" | "triggerContent"
  >,
): SpielwieseInsertRowConfig {
  const resolvedControlIdBase = controlIdBase ?? `${nodeId}-message-insert`;
  const resolvedTestIdBase = testIdBase ?? "spielwiese-message-insert";

  if (variant === "text") {
    return {
      buttonClassName:
        "text-foreground/78 hover:text-foreground h-full rounded-none border-0 bg-transparent px-3 text-[13px] font-medium shadow-none transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-transparent active:scale-[0.985]",
      buttonContent: triggerContent ?? "New message",
      buttonTestId: `${resolvedTestIdBase}-text-trigger`,
      pickerId: `${resolvedControlIdBase}-picker-text`,
      pickerTestId: `${resolvedTestIdBase}-picker-text`,
      rowClassName: "relative inline-flex w-fit pl-[18px]",
      shellTestId: `${resolvedTestIdBase}-text-shell`,
    };
  }

  return {
    ariaLabel: "Toggle new message tray",
    buttonClassName:
      "text-foreground/78 hover:text-foreground inline-flex size-7 items-center justify-center rounded-none border-0 bg-transparent p-0 shadow-none transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-transparent active:scale-[0.985]",
    buttonContent: triggerContent ?? (
      <Plus aria-hidden="true" className="size-3.5 shrink-0 stroke-[2.2px]" />
    ),
    buttonTestId: `${resolvedTestIdBase}-compact-trigger`,
    pickerId: `${resolvedControlIdBase}-picker-compact`,
    pickerTestId: `${resolvedTestIdBase}-picker-compact`,
    rowClassName:
      "relative inline-flex w-fit items-start pt-0 pb-[6px] pl-[10px]",
    shellTestId: `${resolvedTestIdBase}-compact-shell`,
  };
}

function SpielwieseMessageInsertTrigger({
  config,
  isOpen,
  nodeId,
  onClose,
  onPromptSectionInsert,
  surface,
  onToggle,
}: {
  config: SpielwieseInsertRowConfig;
  isOpen: boolean;
  nodeId: string;
  onClose: () => void;
  onPromptSectionInsert: SpielwieseMessageInsertRowProps["onPromptSectionInsert"];
  surface: NonNullable<SpielwieseMessageInsertRowProps["surface"]>;
  onToggle: () => void;
}) {
  return (
    <div
      className={
        surface === "bare" ? bareInsertShellClassName : insertShellClassName
      }
      data-testid={config.shellTestId}
    >
      <Button
        aria-controls={config.pickerId}
        aria-expanded={isOpen}
        aria-label={config.ariaLabel}
        className={config.buttonClassName}
        data-testid={config.buttonTestId}
        size="sm"
        type="button"
        variant="ghost"
        onClick={onToggle}
      >
        {config.buttonContent}
      </Button>
      <SpielwieseMessageInsertPicker
        isOpen={isOpen}
        nodeId={nodeId}
        pickerId={config.pickerId}
        pickerTestId={config.pickerTestId}
        onClose={onClose}
        onPromptSectionInsert={onPromptSectionInsert}
      />
    </div>
  );
}

export function SpielwieseMessageInsertRow({
  className,
  controlIdBase,
  nodeId,
  onPromptSectionInsert,
  rowTestId = "spielwiese-message-insert-row",
  surface = "framed",
  testIdBase,
  triggerContent,
  variant = "compact",
}: SpielwieseMessageInsertRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = getInsertRowConfig(nodeId, variant, {
    controlIdBase,
    testIdBase,
    triggerContent,
  });

  const closePicker = () => {
    setIsOpen(false);
  };

  return (
    <div className={cn(config.rowClassName, className)} data-testid={rowTestId}>
      <SpielwieseMessageInsertTrigger
        config={config}
        isOpen={isOpen}
        nodeId={nodeId}
        onClose={closePicker}
        onPromptSectionInsert={onPromptSectionInsert}
        surface={surface}
        onToggle={() => setIsOpen((currentValue) => !currentValue)}
      />
    </div>
  );
}
