import { cn } from "@/src/utils/tailwind";
import { MarkdownView } from "@/src/components/ui/MarkdownView";
import {
  DataCardActionBar,
  type DataCardActions,
} from "@/src/components/design-system/DataCardActionBar/DataCardActionBar";

export function DashboardMarkdown({
  title,
  content,
  actions,
  fillContainer = false,
}: {
  title: string;
  content: string;
  actions?: DataCardActions;
  fillContainer?: boolean;
}) {
  return (
    <section
      className={cn(
        "ph-no-capture group bg-card rounded-lg border p-4",
        fillContainer && "flex h-full min-h-0 flex-col overflow-hidden",
      )}
      aria-label={title || "Markdown"}
    >
      {(title || actions) && (
        <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
          {title ? (
            <h2 className="min-w-0 text-lg font-bold">{title}</h2>
          ) : (
            <span className="sr-only">Markdown</span>
          )}
          {actions && <DataCardActionBar inline actions={actions} />}
        </div>
      )}
      <div
        className={cn(fillContainer && "min-h-0 flex-1 overflow-auto")}
        tabIndex={fillContainer ? 0 : undefined}
        role={fillContainer ? "region" : undefined}
        aria-label={fillContainer ? "Markdown content" : undefined}
      >
        {content.trim() ? (
          <MarkdownView markdown={content} />
        ) : (
          <p className="text-muted-foreground text-sm">No content.</p>
        )}
      </div>
    </section>
  );
}
