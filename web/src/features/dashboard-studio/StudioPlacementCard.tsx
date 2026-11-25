import { type DashboardDefinition, type FilterState } from "@langfuse/shared";
import { useEffect, useRef, useState } from "react";
import {
  CopyIcon,
  CopyPlusIcon,
  PencilIcon,
  TrashIcon,
  GripVerticalIcon,
} from "@langfuse/icons";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { StudioTextWidget } from "./StudioTextWidget";
import { StudioQueryWidget } from "./StudioQueryWidget";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { serializeStudioPlacement } from "./clipboard";
import { useDashboardStudioCapture } from "./analytics";

export type StudioPlacement = Extract<
  DashboardDefinition["widgets"][number],
  { type: "query" | "text" }
>;

export function StudioPlacementCard({
  projectId,
  placement,
  readPath,
  dateRange,
  filterState,
  onEdit,
  onDelete,
  onDuplicate,
  onCopy,
  onContentHeightChange,
}: {
  projectId: string;
  placement: StudioPlacement;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  onEdit?: (tabId?: string) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onCopy?: () => void;
  onContentHeightChange?: (placementId: string, height: number) => void;
}) {
  const activeTab = useRef<string | undefined>(undefined);
  const [copyStatus, setCopyStatus] = useState("Copy widget");
  const textContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = textContentRef.current;
    if (placement.type !== "text" || !element || !onContentHeightChange) return;
    const reportHeight = () =>
      onContentHeightChange(
        placement.id,
        Math.ceil(
          Math.max(
            element.getBoundingClientRect().height,
            element.scrollHeight,
          ),
        ) + 2,
      );
    const observer = new ResizeObserver(reportHeight);
    observer.observe(element);
    reportHeight();
    return () => observer.disconnect();
  }, [placement.id, placement.type, onContentHeightChange]);
  const track = useDashboardStudioCapture(readPath === "v4");
  const copy = () => {
    if (onCopy) {
      onCopy();
      return;
    }
    copyTextToClipboard(serializeStudioPlacement(placement)).then(
      () => {
        setCopyStatus("Copied");
        track("widget_copied", { widgetKind: placement.type });
      },
      () => setCopyStatus("Copy unavailable"),
    );
  };
  const buttons: NonNullable<DataCardActions["buttons"]> = [
    ...(onEdit
      ? [
          {
            id: "edit",
            label: "Edit widget",
            icon: PencilIcon,
            onClick: () => onEdit(activeTab.current),
          },
        ]
      : []),
    ...(onDuplicate
      ? [
          {
            id: "duplicate",
            label: "Duplicate widget",
            icon: CopyPlusIcon,
            onClick: onDuplicate,
          },
        ]
      : []),
    { id: "copy", label: copyStatus, icon: CopyIcon, onClick: copy },
    ...(onDelete
      ? [
          {
            id: "delete",
            label: "Remove widget",
            icon: TrashIcon,
            onClick: onDelete,
          },
        ]
      : []),
  ];
  if (placement.type === "query")
    return (
      <StudioQueryWidget
        projectId={projectId}
        config={placement.config}
        onTabChange={(id) => {
          activeTab.current = id;
        }}
        readPath={readPath}
        dateRange={dateRange}
        filterState={filterState}
        actions={
          buttons.length ? { draggable: Boolean(onEdit), buttons } : undefined
        }
      />
    );
  return (
    <section className="group bg-background relative flex h-full min-h-0 flex-col rounded-lg border shadow-xs">
      {buttons.length ? (
        <div className="bg-background absolute top-2 right-2 flex items-center gap-1 rounded border p-1 opacity-0 shadow-xs group-focus-within:opacity-100 group-hover:opacity-100">
          <GripVerticalIcon
            size="base"
            __rawClassName="drag-handle cursor-grab"
          />
          {buttons.map((button) => (
            <IconButton
              key={button.id}
              label={button.label}
              icon={button.icon}
              onClick={button.onClick}
              size="sm"
            />
          ))}
        </div>
      ) : null}
      <div ref={textContentRef} className="min-w-0 shrink-0">
        <StudioTextWidget title={placement.title} content={placement.content} />
      </div>
    </section>
  );
}
