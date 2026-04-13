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
  "text-foreground/66 pointer-events-none fixed z-[160] inline-flex max-w-[calc(100vw-1.25rem)] rounded-[8px] border border-black/6 bg-[rgba(251,251,249,0.96)] px-2 py-0.5 text-[0.625rem] leading-[0.95rem] font-medium whitespace-nowrap shadow-[0_4px_10px_rgba(15,23,42,0.05)] backdrop-blur-sm";

const cardNavTooltipEdgeInset = 10;
const cardNavTooltipEstimatedWidth = 88;
const cardNavTooltipEdgeSnapThreshold =
  cardNavTooltipEdgeInset + cardNavTooltipEstimatedWidth / 2;

type CardNavTooltipPosition = {
  left: number;
  top: number;
  transform: string;
};

function getCardNavTooltipPosition(
  triggerElement: HTMLElement,
): CardNavTooltipPosition {
  const triggerRect = triggerElement.getBoundingClientRect();
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;

  if (triggerCenterX <= cardNavTooltipEdgeSnapThreshold) {
    return {
      left: cardNavTooltipEdgeInset,
      top: triggerRect.top - 4,
      transform: "translate(0, -100%)",
    };
  }

  if (triggerCenterX >= viewportWidth - cardNavTooltipEdgeSnapThreshold) {
    return {
      left: viewportWidth - cardNavTooltipEdgeInset,
      top: triggerRect.top - 4,
      transform: "translate(-100%, -100%)",
    };
  }

  return {
    left: triggerCenterX,
    top: triggerRect.top - 4,
    transform: "translate(-50%, -100%)",
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
        transform: position.transform,
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
