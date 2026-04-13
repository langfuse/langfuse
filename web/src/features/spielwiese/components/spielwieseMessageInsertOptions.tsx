import {
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { buttonVariants } from "../ui/button";
import { cn } from "@/src/utils/tailwind";

export type SpielwieseMessageInsertKind =
  | "user"
  | "system"
  | "assistant"
  | "tool";

type SpielwieseMessageInsertOption = {
  kind: SpielwieseMessageInsertKind;
  label: string;
  tooltip?: {
    description: string;
    pseudoLinkLabel?: string;
  };
};

const spielwieseMessageInsertOptions: SpielwieseMessageInsertOption[] = [
  { kind: "user", label: "User" },
  {
    kind: "system",
    label: "Instructions",
    tooltip: {
      description: "What the agent should follow before replying.",
    },
  },
  {
    kind: "assistant",
    label: "Assistant",
    tooltip: {
      description: "Multi-shot answer expectation for the reply.",
      pseudoLinkLabel: "Docs",
    },
  },
  {
    kind: "tool",
    label: "Tool",
    tooltip: {
      description: "Expected tool call and returned result.",
    },
  },
];

const spielwieseMessageInsertTooltipClassName =
  "text-foreground/76 pointer-events-none fixed z-[260] max-w-[11rem] rounded-[8px] bg-[rgba(251,251,249,0.96)] px-2 py-1.5 text-[0.6875rem] leading-[1.05rem] shadow-[0_14px_32px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.06)] backdrop-blur-sm";
const spielwieseMessageInsertTooltipPseudoLinkClassName =
  "text-foreground/58 inline border-b border-black/10 text-[0.625rem] leading-[inherit] font-medium tracking-[0.01em]";

type InsertTooltipPosition = {
  left: number;
  top: number;
  transform: string;
};

function getInsertTooltipPosition(
  triggerElement: HTMLElement,
): InsertTooltipPosition {
  const triggerRect = triggerElement.getBoundingClientRect();
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;

  return {
    left: triggerCenterX,
    top: triggerRect.top - 6,
    transform: "translate(-50%, -100%)",
  };
}

function InsertOptionTooltipPortal({
  children,
  position,
  testId,
}: {
  children: ReactNode;
  position: InsertTooltipPosition;
  testId: string;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={spielwieseMessageInsertTooltipClassName}
      data-testid={testId}
      role="tooltip"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform: position.transform,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function InsertOptionTooltipContent({
  option,
  pickerTestId,
}: {
  option: SpielwieseMessageInsertOption;
  pickerTestId: string;
}) {
  if (!option.tooltip) {
    return null;
  }

  return (
    <p>
      {option.tooltip.description}{" "}
      {option.tooltip.pseudoLinkLabel ? (
        <span
          className={spielwieseMessageInsertTooltipPseudoLinkClassName}
          data-testid={`${pickerTestId}-${option.kind}-tooltip-pseudo-link`}
        >
          {option.tooltip.pseudoLinkLabel}
        </span>
      ) : null}
    </p>
  );
}

function useInsertOptionTooltipState() {
  const [tooltipPosition, setTooltipPosition] =
    useState<InsertTooltipPosition | null>(null);

  const showTooltip = (currentTarget: EventTarget | null) => {
    if (!(currentTarget instanceof HTMLElement)) {
      return;
    }

    setTooltipPosition(getInsertTooltipPosition(currentTarget));
  };

  return {
    hideTooltip: () => setTooltipPosition(null),
    tooltipPosition,
    triggerProps: {
      onBlur: () => setTooltipPosition(null),
      onFocus: (event: FocusEvent<HTMLElement>) =>
        showTooltip(event.currentTarget),
      onMouseEnter: (event: MouseEvent<HTMLElement>) =>
        showTooltip(event.currentTarget),
      onMouseLeave: () => setTooltipPosition(null),
    },
  };
}

function TooltipOptionButton({
  isOpen,
  onSelect,
  option,
  optionClassName,
  pickerTestId,
}: {
  isOpen: boolean;
  onSelect: () => void;
  option: SpielwieseMessageInsertOption;
  optionClassName: string;
  pickerTestId: string;
}) {
  const { hideTooltip, tooltipPosition, triggerProps } =
    useInsertOptionTooltipState();

  return (
    <>
      <button
        aria-label={option.label}
        className={cn(
          buttonVariants({ size: "sm", variant: "ghost" }),
          optionClassName,
        )}
        data-testid={`${pickerTestId}-${option.kind}-option`}
        tabIndex={isOpen ? 0 : -1}
        type="button"
        onClick={() => {
          hideTooltip();
          onSelect();
        }}
        {...triggerProps}
      >
        {option.label}
      </button>
      {tooltipPosition ? (
        <InsertOptionTooltipPortal
          position={tooltipPosition}
          testId={`${pickerTestId}-${option.kind}-tooltip`}
        >
          <InsertOptionTooltipContent
            option={option}
            pickerTestId={pickerTestId}
          />
        </InsertOptionTooltipPortal>
      ) : null}
    </>
  );
}

function PlainOptionButton({
  isOpen,
  onSelect,
  option,
  optionClassName,
  pickerTestId,
}: {
  isOpen: boolean;
  onSelect: () => void;
  option: SpielwieseMessageInsertOption;
  optionClassName: string;
  pickerTestId: string;
}) {
  return (
    <button
      aria-label={option.label}
      className={cn(
        buttonVariants({ size: "sm", variant: "ghost" }),
        optionClassName,
      )}
      data-testid={`${pickerTestId}-${option.kind}-option`}
      tabIndex={isOpen ? 0 : -1}
      type="button"
      onClick={onSelect}
    >
      {option.label}
    </button>
  );
}

export function getVisibleInsertOptions(
  optionKinds: SpielwieseMessageInsertKind[] | undefined,
) {
  if (!optionKinds || optionKinds.length === 0) {
    return spielwieseMessageInsertOptions;
  }

  return spielwieseMessageInsertOptions.filter((option) =>
    optionKinds.includes(option.kind),
  );
}

export function SpielwieseMessageInsertOptions({
  isOpen,
  nodeId,
  onClose,
  onPromptSectionInsert,
  optionClassName,
  optionKinds,
  optionsClassName,
  pickerTestId,
}: {
  isOpen: boolean;
  nodeId: string;
  onClose: () => void;
  onPromptSectionInsert: (
    nodeId: string,
    kind: SpielwieseMessageInsertKind,
  ) => void;
  optionClassName: string;
  optionKinds?: SpielwieseMessageInsertKind[];
  optionsClassName: string;
  pickerTestId: string;
}) {
  const visibleOptions = getVisibleInsertOptions(optionKinds);

  return (
    <div className={optionsClassName}>
      {visibleOptions.map((option) => {
        const handleSelect = () => {
          onPromptSectionInsert(nodeId, option.kind);
          onClose();
        };

        if (!option.tooltip) {
          return (
            <PlainOptionButton
              isOpen={isOpen}
              key={option.kind}
              onSelect={handleSelect}
              option={option}
              optionClassName={optionClassName}
              pickerTestId={pickerTestId}
            />
          );
        }

        return (
          <TooltipOptionButton
            isOpen={isOpen}
            key={option.kind}
            onSelect={handleSelect}
            option={option}
            optionClassName={optionClassName}
            pickerTestId={pickerTestId}
          />
        );
      })}
    </div>
  );
}
