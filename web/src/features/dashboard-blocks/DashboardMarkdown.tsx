import { MarkdownView } from "@/src/components/ui/MarkdownView";
import { MoreVertical } from "@langfuse/icons";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";

export function DashboardMarkdown({
  title,
  content,
  actions,
}: {
  title: string;
  content: string;
  actions?: Pick<DataCardActions, "menu">;
}) {
  const menu = actions?.menu ?? [];
  const hasMenu = menu.length > 0;
  return (
    <section
      className="ph-no-capture group bg-card rounded-lg border p-4"
      aria-label={title || "Markdown"}
    >
      {(title || hasMenu) && (
        <div className="mb-2 flex items-start justify-between gap-3">
          {title ? (
            <h2 className="min-w-0 text-lg font-bold">{title}</h2>
          ) : (
            <span className="sr-only">Markdown</span>
          )}
          {hasMenu && (
            <DropdownMenu items={menu} ariaLabel="Markdown actions">
              {({ getTriggerProps }) => (
                <IconButton
                  {...getTriggerProps()}
                  icon={MoreVertical}
                  label="Markdown actions"
                />
              )}
            </DropdownMenu>
          )}
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
