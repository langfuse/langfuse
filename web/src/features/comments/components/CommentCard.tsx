import { type ReactNode } from "react";
import { cva } from "class-variance-authority";

import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { cn } from "@/src/utils/tailwind";

const commentCardVariants = cva(
  "min-w-0 max-w-full rounded-2xl px-3 py-2.5 transition-colors",
  {
    variants: {
      highlighted: {
        true: "ring-primary-accent ring-2 ring-inset",
        false: null,
      },
      isOwnComment: {
        true: "bg-primary/10 rounded-br-sm",
        false: "bg-muted rounded-bl-sm",
      },
    },
  },
);

type CommentCardProps = {
  id: string;
  authorName: string;
  authorImage: string | null;
  timestamp: string;
  content: string;
  highlighted: boolean;
  isOwnComment: boolean;
  actions: ReactNode;
  footer: ReactNode;
  location: ReactNode;
};

export function CommentCard({
  id,
  authorName,
  authorImage,
  timestamp,
  content,
  highlighted,
  isOwnComment,
  actions,
  footer,
  location,
}: CommentCardProps) {
  return (
    <article
      id={`comment-${id}`}
      className={cn(
        "ph-no-capture flex min-w-0 items-start gap-2",
        isOwnComment && "flex-row-reverse",
      )}
    >
      <div className="shrink-0 pt-5">
        <Avatar
          size="sm"
          src={authorImage ?? undefined}
          displayName={authorName}
          aria-hidden="true"
        />
      </div>
      <div
        className={cn(
          "flex max-w-[85%] min-w-0 flex-col gap-1",
          isOwnComment ? "items-end" : "items-start",
        )}
      >
        <span
          className="text-muted-foreground max-w-full truncate px-1 text-xs"
          title={authorName}
        >
          {isOwnComment ? "You" : authorName}
        </span>
        <div className={commentCardVariants({ highlighted, isOwnComment })}>
          <MarkdownView
            markdown={content}
            className="text-foreground p-0 text-sm leading-6 wrap-anywhere [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_h4]:text-sm [&_h5]:text-sm [&_h6]:text-sm"
          />
          {location ? (
            <div className="text-muted-foreground min-w-0 pt-2 text-xs">
              {location}
            </div>
          ) : null}
        </div>
        <div className="text-muted-foreground flex min-h-6 max-w-full flex-wrap items-center gap-x-2 gap-y-1 px-1">
          <span className="text-[11px]">{timestamp}</span>
          {footer ? (
            <div className="flex flex-wrap items-center gap-1">{footer}</div>
          ) : null}
          {actions}
        </div>
      </div>
    </article>
  );
}
