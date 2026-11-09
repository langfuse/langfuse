import type { IconComponent } from "@langfuse/icons";

export function LlmConnectionEmptyState({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: IconComponent;
  title: string;
}) {
  return (
    <div className="border-border flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center">
      <span className="flex size-8 items-center justify-center rounded-md border">
        <Icon size="base" color="muted" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-bold">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </div>
  );
}
