import type { IconComponent } from "@langfuse/icons";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: IconComponent;
  title: string;
  description: string;
  /** Actions rendered below the description, e.g. buttons */
  children?: ReactNode;
};

function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: EmptyStateProps) {
  return (
    <div className="border-border bg-muted/30 flex flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-10 text-center">
      <span className="bg-background flex size-8 items-center justify-center rounded-md border">
        <Icon size="base" color="muted" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export { EmptyState };
