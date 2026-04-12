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
  styleVariant?: "default" | "response-format";
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
  "[--message-insert-inner-radius:7px] [--message-insert-padding:2px] [--message-insert-outer-radius:calc(var(--message-insert-inner-radius)+var(--message-insert-padding))] bg-background inline-flex h-7 items-stretch overflow-hidden rounded-[var(--message-insert-outer-radius)] border border-[rgba(0,0,0,0.08)] p-[var(--message-insert-padding)] shadow-[0_1px_0_rgba(255,255,255,0.5)_inset]";
const bareInsertShellClassName =
  "inline-flex h-7 items-stretch overflow-visible";
const responseFormatInsertRadiusClassName =
  "[--message-insert-inner-radius:7px] [--message-insert-padding:2px] [--message-insert-outer-radius:calc(var(--message-insert-inner-radius)+var(--message-insert-padding))]";

function getInsertPickerChrome(
  styleVariant: NonNullable<SpielwieseMessageInsertRowProps["styleVariant"]>,
) {
  if (styleVariant === "response-format") {
    return {
      pickerClassName:
        "relative z-0 -ml-[2px] rounded-r-[calc(var(--message-insert-outer-radius)-var(--message-insert-padding))]",
      optionClassName:
        "text-foreground/72 hover:bg-background/88 hover:text-foreground inline-flex h-4 items-center rounded-[calc(var(--message-insert-outer-radius)-var(--message-insert-padding))] border-0 bg-transparent pl-1.5 pr-[5px] text-[0.6875rem] font-medium tracking-[0.01em] shadow-none transition-colors outline-none focus-visible:ring-0 active:scale-[0.985]",
      optionsClassName:
        "flex h-full w-max items-center gap-px pl-1 pr-px py-0.5 transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
    };
  }

  return {
    pickerClassName:
      "rounded-r-[calc(var(--message-insert-outer-radius)-var(--message-insert-padding))]",
    optionClassName:
      "text-foreground/72 hover:bg-background/80 hover:text-foreground inline-flex h-full items-center rounded-[calc(var(--message-insert-outer-radius)-var(--message-insert-padding))] border-0 bg-transparent px-2 text-[11px] font-medium",
    optionsClassName:
      "flex h-full w-max items-center gap-px px-[var(--message-insert-padding)] transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
  };
}

type SpielwieseMessageInsertPickerProps = {
  isOpen: boolean;
  nodeId: string;
  pickerId: string;
  pickerTestId: string;
  onClose: () => void;
  onPromptSectionInsert: SpielwieseMessageInsertRowProps["onPromptSectionInsert"];
  styleVariant: NonNullable<SpielwieseMessageInsertRowProps["styleVariant"]>;
};

function SpielwieseMessageInsertPicker({
  isOpen,
  nodeId,
  pickerId,
  pickerTestId,
  onClose,
  onPromptSectionInsert,
  styleVariant,
}: SpielwieseMessageInsertPickerProps) {
  const { optionClassName, optionsClassName, pickerClassName } =
    getInsertPickerChrome(styleVariant);
  const pickerStateClassName = isOpen
    ? "max-w-[14.5rem] bg-[rgba(0,0,0,0.035)]"
    : "pointer-events-none max-w-0 bg-transparent";
  const optionsStateClassName = isOpen
    ? "translate-x-0 opacity-100 delay-75"
    : "-translate-x-0.5 opacity-0 delay-0";

  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        "flex h-full shrink-0 items-stretch overflow-hidden transition-[max-width,background-color] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        pickerClassName,
        pickerStateClassName,
      )}
      data-state={isOpen ? "open" : "closed"}
      data-testid={pickerTestId}
      id={pickerId}
    >
      <div className={cn(optionsClassName, optionsStateClassName)}>
        {insertOptions.map((option) => (
          <Button
            key={option.kind}
            className={optionClassName}
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
  shellClassName?: string;
  shellTestId: string;
};

type SpielwieseInsertRowConfigOptions = Pick<
  SpielwieseMessageInsertRowProps,
  | "controlIdBase"
  | "nodeId"
  | "styleVariant"
  | "testIdBase"
  | "triggerContent"
  | "variant"
>;

function getTextInsertRowConfig({
  resolvedControlIdBase,
  resolvedTestIdBase,
  styleVariant,
  triggerContent,
}: {
  resolvedControlIdBase: string;
  resolvedTestIdBase: string;
  styleVariant: NonNullable<SpielwieseMessageInsertRowProps["styleVariant"]>;
  triggerContent: ReactNode;
}): SpielwieseInsertRowConfig {
  const baseConfig = {
    buttonContent: triggerContent,
    buttonTestId: `${resolvedTestIdBase}-text-trigger`,
    pickerId: `${resolvedControlIdBase}-picker-text`,
    pickerTestId: `${resolvedTestIdBase}-picker-text`,
    rowClassName: "relative inline-flex w-fit pl-[18px]",
    shellTestId: `${resolvedTestIdBase}-text-shell`,
  };

  if (styleVariant === "response-format") {
    return {
      ...baseConfig,
      buttonClassName:
        "text-foreground/72 hover:text-foreground relative z-10 inline-flex h-full items-center rounded-[calc(var(--message-insert-outer-radius)-var(--message-insert-padding))] border-0 bg-background px-2 text-[0.6875rem] font-medium tracking-[0.01em] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-colors outline-none focus-visible:ring-0 hover:bg-background active:scale-[0.985]",
      shellClassName: `${responseFormatInsertRadiusClassName} inline-flex h-6 items-stretch overflow-hidden rounded-[var(--message-insert-outer-radius)] border border-[rgba(0,0,0,0.06)] bg-[rgba(255,255,255,0.52)] p-[var(--message-insert-padding)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]`,
    };
  }

  return {
    ...baseConfig,
    buttonClassName:
      "text-foreground/78 hover:text-foreground h-full rounded-[calc(var(--message-insert-outer-radius)-var(--message-insert-padding))] border-0 bg-transparent px-3 text-[13px] font-medium shadow-none transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-transparent active:scale-[0.985]",
  };
}

function getInsertRowConfig({
  controlIdBase,
  nodeId,
  styleVariant,
  testIdBase,
  triggerContent,
  variant,
}: SpielwieseInsertRowConfigOptions): SpielwieseInsertRowConfig {
  const resolvedControlIdBase = controlIdBase ?? `${nodeId}-message-insert`;
  const resolvedTestIdBase = testIdBase ?? "spielwiese-message-insert";

  if (variant === "text") {
    return getTextInsertRowConfig({
      resolvedControlIdBase,
      resolvedTestIdBase,
      styleVariant,
      triggerContent: triggerContent ?? "New message",
    });
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
  styleVariant,
  onToggle,
}: {
  config: SpielwieseInsertRowConfig;
  isOpen: boolean;
  nodeId: string;
  onClose: () => void;
  onPromptSectionInsert: SpielwieseMessageInsertRowProps["onPromptSectionInsert"];
  surface: NonNullable<SpielwieseMessageInsertRowProps["surface"]>;
  styleVariant: NonNullable<SpielwieseMessageInsertRowProps["styleVariant"]>;
  onToggle: () => void;
}) {
  return (
    <div
      className={
        config.shellClassName ??
        (surface === "bare" ? bareInsertShellClassName : insertShellClassName)
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
        styleVariant={styleVariant}
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
  styleVariant = "default",
  surface = "framed",
  testIdBase,
  triggerContent,
  variant = "compact",
}: SpielwieseMessageInsertRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = getInsertRowConfig({
    controlIdBase,
    nodeId,
    styleVariant,
    testIdBase,
    triggerContent,
    variant,
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
        styleVariant={styleVariant}
        onToggle={() => setIsOpen((currentValue) => !currentValue)}
      />
    </div>
  );
}
