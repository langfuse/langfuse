import {
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "../ui/button";

type SpielwieseAgentNodeCardSwitcherProps = {
  activeView: "primary" | "secondary";
  areNavButtonsVisible: boolean;
  testIdBase?: string;
  nodeId: string;
  onShowPrimary: () => void;
  onShowSecondary: () => void;
  primaryCard: ReactNode;
  secondaryCard: ReactNode;
  viewportClassName?: string;
  viewportTransitionState?: string;
};

const spielwieseAgentNodeCardNavButtonClassName =
  "text-foreground/52 hover:text-foreground hover:bg-background/88 h-6 w-6 shrink-0 rounded-[8px] border border-transparent bg-transparent px-0 shadow-none transition-[background-color,border-color,box-shadow,color] hover:border-[rgba(0,0,0,0.08)] hover:shadow-[inset_0_1px_0_hsl(var(--background)/0.96)] disabled:opacity-38";
const spielwieseAgentNodeCardNavTooltipClassName =
  "text-foreground/72 pointer-events-none fixed z-[160] inline-flex -translate-x-1/2 -translate-y-full rounded-[11px] border border-black/8 bg-[rgba(255,255,255,0.98)] px-2.5 py-1.5 text-[0.6875rem] leading-[1.05rem] font-normal whitespace-nowrap shadow-[0_10px_22px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.04)] backdrop-blur-sm";

type CardNavTooltipPosition = {
  left: number;
  top: number;
};

function getCardNavTooltipPosition(
  triggerElement: HTMLElement,
): CardNavTooltipPosition {
  const triggerRect = triggerElement.getBoundingClientRect();
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;

  return {
    left: Math.max(16, Math.min(viewportWidth - 16, triggerCenterX)),
    top: triggerRect.top - 4,
  };
}

function CardNavTooltipPortal({
  label,
  position,
  testId,
}: {
  label: string;
  position: CardNavTooltipPosition;
  testId: string;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <span
      className={spielwieseAgentNodeCardNavTooltipClassName}
      data-testid={`${testId}-tooltip`}
      role="tooltip"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
      }}
    >
      {label}
    </span>,
    document.body,
  );
}

function useCardNavTooltipState() {
  const [tooltipPosition, setTooltipPosition] =
    useState<CardNavTooltipPosition | null>(null);

  const showTooltip = (currentTarget: EventTarget | null) => {
    if (!(currentTarget instanceof HTMLElement)) {
      return;
    }

    setTooltipPosition(getCardNavTooltipPosition(currentTarget));
  };

  const hideTooltip = () => setTooltipPosition(null);

  return {
    tooltipPosition,
    triggerProps: {
      onBlurCapture: (event: FocusEvent<HTMLElement>) => {
        const nextFocusedElement = event.relatedTarget;

        if (
          !(nextFocusedElement instanceof Node) ||
          !event.currentTarget.contains(nextFocusedElement)
        ) {
          hideTooltip();
        }
      },
      onFocusCapture: (event: FocusEvent<HTMLElement>) =>
        showTooltip(event.currentTarget),
      onMouseEnter: (event: MouseEvent<HTMLElement>) =>
        showTooltip(event.currentTarget),
      onMouseLeave: hideTooltip,
    },
  };
}

function SpielwieseAgentNodeCardNavButton({
  ariaLabel,
  areNavButtonsVisible,
  children,
  disabled,
  onClick,
  testId,
  tooltipLabel,
}: {
  ariaLabel: string;
  areNavButtonsVisible: boolean;
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  testId: string;
  tooltipLabel: string;
}) {
  const { tooltipPosition, triggerProps } = useCardNavTooltipState();

  return (
    <div
      className={`flex shrink-0 px-1.5 transition-opacity duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] ${
        areNavButtonsVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
      data-testid={`${testId}-shell`}
    >
      <span
        className="relative inline-flex shrink-0"
        data-testid={`${testId}-trigger`}
        {...triggerProps}
      >
        <Button
          aria-label={ariaLabel}
          className={spielwieseAgentNodeCardNavButtonClassName}
          data-testid={testId}
          disabled={disabled}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onClick}
        >
          {children}
        </Button>
      </span>
      {tooltipPosition ? (
        <CardNavTooltipPortal
          label={tooltipLabel}
          position={tooltipPosition}
          testId={testId}
        />
      ) : null}
    </div>
  );
}

export function SpielwieseAgentNodeCardSwitcher({
  activeView,
  areNavButtonsVisible,
  testIdBase = "spielwiese-agent-node-card",
  nodeId,
  onShowPrimary,
  onShowSecondary,
  primaryCard,
  secondaryCard,
  viewportClassName,
  viewportTransitionState,
}: SpielwieseAgentNodeCardSwitcherProps) {
  const isSecondaryCardActive = activeView === "secondary";
  const currentCard = isSecondaryCardActive ? secondaryCard : primaryCard;

  return (
    <div className="flex min-w-0 items-center gap-0">
      <SpielwieseAgentNodeCardNavButton
        ariaLabel={`Show previous card for ${nodeId}`}
        areNavButtonsVisible={areNavButtonsVisible}
        disabled={!isSecondaryCardActive}
        testId={`${testIdBase}-back-button`}
        tooltipLabel="Prev version"
        onClick={onShowPrimary}
      >
        <ArrowLeft className="size-3.5" />
      </SpielwieseAgentNodeCardNavButton>
      <div
        className={`min-w-0 flex-1 transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] ${viewportClassName ?? ""}`}
        data-collapse-transition={viewportTransitionState ?? "idle"}
        data-testid={`${testIdBase}-viewport`}
      >
        {currentCard}
      </div>
      <SpielwieseAgentNodeCardNavButton
        ariaLabel={`Add a new card after ${nodeId}`}
        areNavButtonsVisible={areNavButtonsVisible}
        disabled={isSecondaryCardActive}
        testId={`${testIdBase}-add-button`}
        tooltipLabel="New version"
        onClick={onShowSecondary}
      >
        <Plus className="size-3.5" />
      </SpielwieseAgentNodeCardNavButton>
    </div>
  );
}
