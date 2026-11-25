import { CopyPlusIcon, PencilIcon } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { MarkdownView } from "@/src/components/ui/MarkdownView";

export function ReportMarkdown({
  title,
  content,
  onEdit,
  editLabel = "Edit widget",
  onDuplicate,
  widgetId,
}: {
  title: string;
  content: string;
  onEdit?: () => void;
  editLabel?: string;
  onDuplicate?: () => void;
  widgetId?: string;
}) {
  return (
    <div
      id={widgetId ? "report-widget-" + widgetId : undefined}
      tabIndex={widgetId ? -1 : undefined}
      className="group/widget ph-no-capture relative min-w-0 outline-none"
    >
      {onEdit && (
        <div className="bg-background pointer-events-none absolute top-0 right-0 z-10 flex items-center gap-1 rounded-md opacity-0 group-focus-within/widget:pointer-events-auto group-focus-within/widget:opacity-100 group-hover/widget:pointer-events-auto group-hover/widget:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
          <IconButton
            icon={PencilIcon}
            label={editLabel}
            size="sm"
            onClick={onEdit}
          />
          {onDuplicate && (
            <IconButton
              icon={CopyPlusIcon}
              label="Duplicate widget"
              size="sm"
              onClick={onDuplicate}
            />
          )}
        </div>
      )}
      <div className={onEdit ? "pr-16" : undefined}>
        {title && (
          <h3 className="mb-2 text-base font-bold tracking-tight">{title}</h3>
        )}
        <MarkdownView
          markdown={content}
          className="[&_p]:max-w-[88ch] [&_td]:px-2 [&_td]:align-top [&_td]:wrap-anywhere [&_td]:whitespace-normal sm:[&_td]:px-4 [&_th]:px-2 [&_th]:align-top sm:[&_th]:px-4"
        />
      </div>
    </div>
  );
}
