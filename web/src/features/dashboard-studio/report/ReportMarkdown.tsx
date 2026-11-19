import { PencilIcon } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { MarkdownView } from "@/src/components/ui/MarkdownView";

export function ReportMarkdown({
  title,
  content,
  onEdit,
  editLabel = "Edit note",
}: {
  title: string;
  content: string;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="group ph-no-capture relative min-w-0">
      {onEdit && (
        <div className="absolute top-0 right-0 z-10 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <IconButton
            icon={PencilIcon}
            label={editLabel}
            size="sm"
            onClick={onEdit}
          />
        </div>
      )}
      <div className={onEdit ? "pr-9" : undefined}>
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
