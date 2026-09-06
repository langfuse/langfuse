import { ListTree } from "lucide-react";

import { Button } from "@/src/components/ui/button";

function RuleCount({ count }: { count: number }) {
  return (
    <span className="bg-muted ml-1 rounded-full px-1.5 py-0.5 text-xs tabular-nums">
      {count}
    </span>
  );
}

export function RuleRelationshipButton({
  count,
  shouldCallAttention = false,
  onClick,
}: {
  count: number;
  shouldCallAttention?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      title={
        shouldCallAttention
          ? "Attach this evaluator to a rule"
          : "View attached rules"
      }
      onClick={onClick}
    >
      <ListTree className="mr-2 h-4 w-4" />
      Rules
      {shouldCallAttention ? (
        <span
          aria-hidden="true"
          className="relative ml-1 inline-flex h-2.5 w-2.5"
        >
          <span className="bg-dark-yellow absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
          <span className="bg-dark-yellow relative inline-flex h-2.5 w-2.5 rounded-full" />
        </span>
      ) : (
        <RuleCount count={count} />
      )}
    </Button>
  );
}
