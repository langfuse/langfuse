import { Button } from "@/src/components/ui/button";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { cn } from "@/src/utils/tailwind";
import { api } from "@/src/utils/api";

interface ReactionBarProps {
  projectId: string;
  commentId: string;
  onReactionToggle: (emoji: string, hasReacted: boolean) => void;
}

export function ReactionBar({
  projectId,
  commentId,
  onReactionToggle,
}: ReactionBarProps) {
  const { data: reactions } = api.commentReactions.listForComment.useQuery({
    projectId,
    commentId,
  });

  return (
    <div className="flex flex-wrap items-center gap-1">
      {(reactions ?? []).map((reaction) => {
        const button = (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 gap-1 rounded-full px-2 text-sm transition-colors",
              reaction.hasReacted
                ? "bg-primary/10 hover:bg-primary/20"
                : "bg-muted/20 hover:bg-muted/40",
            )}
            onClick={() =>
              onReactionToggle(reaction.emoji, reaction.hasReacted)
            }
          >
            <span>{reaction.emoji}</span>
            <span className="text-muted-foreground/80 text-[0.6rem]">
              {reaction.count}
            </span>
          </Button>
        );

        // Only show hover card with user details if user has permission
        if (!reaction.users) {
          return <div key={reaction.emoji}>{button}</div>;
        }

        return (
          <HoverCard
            key={reaction.emoji}
            openDelay={200}
            placement="top"
            content={
              <div className="w-fit p-2">
                <div className="flex flex-col gap-1">
                  {reaction.users.map((user) => (
                    <div
                      key={user.id}
                      className="text-muted-foreground text-xs"
                    >
                      {user.name || "Unknown user"}
                    </div>
                  ))}
                </div>
              </div>
            }
          >
            {({ getTriggerProps }) => (
              <span className="inline-flex" {...getTriggerProps()}>
                {button}
              </span>
            )}
          </HoverCard>
        );
      })}
    </div>
  );
}
