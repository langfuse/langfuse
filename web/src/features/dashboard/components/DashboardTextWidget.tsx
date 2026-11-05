import { GripVerticalIcon, PencilIcon, TrashIcon } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";

export interface TextPlacement {
  type: "text";
  id: string;
  title: string;
  content: string;
  x: number;
  y: number;
  x_size: number;
  y_size: number;
}

export function DashboardTextWidget({
  placement,
  onEdit,
  onDelete,
}: {
  placement: TextPlacement;
  onEdit: (() => void) | undefined;
  onDelete: (() => void) | undefined;
}) {
  return (
    <section className="ph-no-capture bg-background flex h-full min-w-0 flex-col gap-2 overflow-y-auto rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        {placement.title ? (
          <h3 className="min-w-0 flex-1 text-lg font-bold break-words">
            {placement.title}
          </h3>
        ) : (
          <span />
        )}
        {onEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <span className="drag-handle text-muted-foreground hidden cursor-grab lg:inline-flex">
              <GripVerticalIcon />
            </span>
            <IconButton
              icon={PencilIcon}
              label="Edit text tile"
              size="sm"
              onClick={onEdit}
            />
            {onDelete && (
              <IconButton
                icon={TrashIcon}
                label="Delete text tile"
                size="sm"
                onClick={() => {
                  if (confirm("Delete this text tile?")) onDelete();
                }}
              />
            )}
          </div>
        )}
      </div>
      {placement.content && (
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
          {placement.content}
        </p>
      )}
    </section>
  );
}
