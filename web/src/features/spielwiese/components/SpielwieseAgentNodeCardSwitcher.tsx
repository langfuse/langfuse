import type { ReactNode } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "../ui/button";

type SpielwieseAgentNodeCardSwitcherProps = {
  activeView: "primary" | "secondary";
  nodeId: string;
  onShowPrimary: () => void;
  onShowSecondary: () => void;
  primaryCard: ReactNode;
  secondaryCard: ReactNode;
};

const spielwieseAgentNodeCardNavButtonClassName =
  "bg-background text-foreground/52 hover:bg-background hover:text-foreground h-8 w-8 shrink-0 rounded-[10px] border border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:opacity-38";

function SpielwieseAgentNodeCardNavButton({
  ariaLabel,
  children,
  disabled,
  onClick,
  testId,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
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
  );
}

export function SpielwieseAgentNodeCardSwitcher({
  activeView,
  nodeId,
  onShowPrimary,
  onShowSecondary,
  primaryCard,
  secondaryCard,
}: SpielwieseAgentNodeCardSwitcherProps) {
  const isSecondaryCardActive = activeView === "secondary";
  const currentCard = isSecondaryCardActive ? secondaryCard : primaryCard;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <SpielwieseAgentNodeCardNavButton
        ariaLabel={`Show previous card for ${nodeId}`}
        disabled={!isSecondaryCardActive}
        testId="spielwiese-agent-node-card-back-button"
        onClick={onShowPrimary}
      >
        <ArrowLeft className="size-3.5" />
      </SpielwieseAgentNodeCardNavButton>
      <div
        className="min-w-0 flex-1 transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]"
        data-testid="spielwiese-agent-node-card-viewport"
      >
        {currentCard}
      </div>
      <SpielwieseAgentNodeCardNavButton
        ariaLabel={`Add a new card after ${nodeId}`}
        disabled={isSecondaryCardActive}
        testId="spielwiese-agent-node-card-add-button"
        onClick={onShowSecondary}
      >
        <Plus className="size-3.5" />
      </SpielwieseAgentNodeCardNavButton>
    </div>
  );
}
