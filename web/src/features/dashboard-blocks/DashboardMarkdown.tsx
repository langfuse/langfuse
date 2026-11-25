import { MarkdownView } from "@/src/components/ui/MarkdownView";
import {
  DataCardActionBar,
  type DataCardActions,
} from "@/src/components/design-system/DataCardActionBar/DataCardActionBar";

export function DashboardMarkdown({
  title,
  content,
  actions,
}: {
  title: string;
  content: string;
  actions?: DataCardActions;
}) {
  return (
    <section
      className="ph-no-capture group bg-card rounded-lg border p-4"
      aria-label={title || "Markdown"}
    >
      {(title || actions) && (
        <div className="mb-2 flex items-start justify-between gap-3">
          {title ? (
            <h2 className="min-w-0 text-lg font-bold">{title}</h2>
          ) : (
            <span className="sr-only">Markdown</span>
          )}
          {actions && <DataCardActionBar inline actions={actions} />}
        </div>
      )}
      {content.trim() ? (
        <MarkdownView markdown={content} />
      ) : (
        <p className="text-muted-foreground text-sm">No content.</p>
      )}
    </section>
  );
}
