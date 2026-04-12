import type { ReactNode } from "react";
import { ArrowLeft, Plus } from "lucide-react";
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
};

const spielwieseAgentNodeCardNavButtonClassName =
  "text-foreground/52 hover:text-foreground hover:bg-background/88 h-6 w-6 shrink-0 rounded-[8px] border border-transparent bg-transparent px-0 shadow-none transition-[background-color,border-color,box-shadow,color] hover:border-[rgba(0,0,0,0.08)] hover:shadow-[inset_0_1px_0_hsl(var(--background)/0.96)] disabled:opacity-38";

function SpielwieseAgentNodeCardNavButton({
  ariaLabel,
  areNavButtonsVisible,
  children,
  disabled,
  onClick,
  testId,
}: {
  ariaLabel: string;
  areNavButtonsVisible: boolean;
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <div
      className={`flex shrink-0 px-1.5 transition-opacity duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] ${
        areNavButtonsVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
      data-testid={`${testId}-shell`}
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
        onClick={onShowPrimary}
      >
        <ArrowLeft className="size-3.5" />
      </SpielwieseAgentNodeCardNavButton>
      <div
        className="min-w-0 flex-1 transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]"
        data-testid={`${testIdBase}-viewport`}
      >
        {currentCard}
      </div>
      <SpielwieseAgentNodeCardNavButton
        ariaLabel={`Add a new card after ${nodeId}`}
        areNavButtonsVisible={areNavButtonsVisible}
        disabled={isSecondaryCardActive}
        testId={`${testIdBase}-add-button`}
        onClick={onShowSecondary}
      >
        <Plus className="size-3.5" />
      </SpielwieseAgentNodeCardNavButton>
    </div>
  );
}
