import { type ReactNode } from "react";
import { cva } from "class-variance-authority";

import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";

const commentCardVariants = cva(
  "ph-no-capture grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md px-2 py-3 transition-colors",
  {
    variants: {
      highlighted: {
        true: "bg-accent/40 ring-primary-accent ring-1 ring-inset",
        false: null,
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
  actions,
  footer,
  location,
}: CommentCardProps) {
  return (
    <article
      id={`comment-${id}`}
      className={commentCardVariants({ highlighted })}
    >
      <Avatar
        size="md"
        src={authorImage ?? undefined}
        displayName={authorName}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-h-7 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className="text-foreground truncate text-sm font-bold"
              title={authorName}
            >
              {authorName}
            </span>
            <span className="text-muted-foreground text-xs">{timestamp}</span>
          </div>
          {actions ? (
            <div className="text-muted-foreground flex shrink-0 items-center gap-1">
              {actions}
            </div>
          ) : null}
        </div>
        <MarkdownView
          markdown={content}
          className="text-foreground p-0 text-sm leading-6 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_h4]:text-sm [&_h5]:text-sm [&_h6]:text-sm"
        />
        {location ? (
          <div className="text-muted-foreground min-w-0 text-xs">
            {location}
          </div>
        ) : null}
        {footer ? (
          <div className="flex flex-wrap items-center gap-1.5">{footer}</div>
        ) : null}
      </div>
    </article>
  );
}
