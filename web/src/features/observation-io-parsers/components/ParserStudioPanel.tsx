import * as SheetPrimitive from "@radix-ui/react-dialog";
import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2, Trash2, X } from "lucide-react";
import { type ColumnDefinition } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetOverlay, SheetPortal } from "@/src/components/ui/sheet";
import { usePeekPanelState } from "@/src/components/table/peek/usePeekPanelState";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { cn } from "@/src/utils/tailwind";
import {
  ParserFilterMatches,
  type ParserPreviewPointer,
} from "@/src/features/observation-io-parsers/components/ParserFilterMatches";
import { ParserDraftForm } from "@/src/features/observation-io-parsers/components/ParserDraftForm";
import { ParserDraftPreview } from "@/src/features/observation-io-parsers/components/ParserDraftPreview";
import { type ParserDraft } from "@/src/features/observation-io-parsers/lib/parserDraft";

export function ParserStudioPanel({
  open,
  onOpenChange,
  projectId,
  draft,
  parserFilterColumns,
  isSaving,
  isDeleting = false,
  onDraftChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  draft: ParserDraft | null;
  parserFilterColumns: ColumnDefinition[];
  isSaving: boolean;
  isDeleting?: boolean;
  onDraftChange: (draft: ParserDraft) => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewPointers, setPreviewPointers] = useState<
    ParserPreviewPointer[]
  >([]);
  const [previewPointer, setPreviewPointer] =
    useState<ParserPreviewPointer | null>(null);
  const isMobile = useIsMobile();
  const panel = usePeekPanelState({
    isOpen: open,
    isExpanded,
    onExpandedChange: setIsExpanded,
    resizeAriaLabel: "Resize parser studio",
  });

  useEffect(() => {
    if (!open) {
      setIsExpanded(false);
      setPreviewPointers([]);
      setPreviewPointer(null);
    }
  }, [open]);

  const handlePointersChange = useCallback(
    (pointers: ParserPreviewPointer[]) => {
      setPreviewPointers(pointers);
      setPreviewPointer((current) => {
        if (
          current &&
          pointers.some(
            (pointer) => pointer.observationId === current.observationId,
          )
        ) {
          return current;
        }

        return pointers[0] ?? null;
      });
    },
    [],
  );

  const currentPreviewIndex = previewPointer
    ? previewPointers.findIndex(
        (pointer) => pointer.observationId === previewPointer.observationId,
      )
    : -1;
  const canNavigatePreview =
    currentPreviewIndex >= 0 && previewPointers.length > 1;
  const navigatePreview = (direction: "previous" | "next") => {
    if (!canNavigatePreview) return;

    const delta = direction === "previous" ? -1 : 1;
    const nextIndex =
      (currentPreviewIndex + delta + previewPointers.length) %
      previewPointers.length;
    setPreviewPointer(previewPointers[nextIndex]!);
  };

  if (!draft) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          aria-describedby={undefined}
          style={isMobile ? { width: "100vw" } : panel.panelStyle}
          className={cn(
            "bg-background top-banner-offset h-screen-with-banner fixed right-0 bottom-0 flex max-h-full min-h-0 max-w-none flex-col gap-0 border-l",
            "shadow-[-12px_0_32px_-16px_rgb(0_0_0_/_0.30)]",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-100 data-[state=open]:duration-100",
            panel.isResizing && "select-none",
          )}
        >
          <SheetPrimitive.Title className="sr-only">
            {draft.id ? "Edit parser" : "Add parser"}
          </SheetPrimitive.Title>

          <div className="bg-header flex min-h-12 shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">
                {draft.id ? "Edit parser" : "Add parser"}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                Configure filters and preview the parsed observation output.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    panel.isExpanded
                      ? "Collapse parser studio"
                      : "Expand parser studio"
                  }
                  onClick={panel.toggleExpanded}
                >
                  {panel.isExpanded ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {onDelete ? (
                <Button
                  variant="destructive-secondary"
                  size="sm"
                  className="gap-1"
                  loading={isDeleting}
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              ) : null}
              <Button
                onClick={onSave}
                disabled={isSaving || isDeleting || !draft.name}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close parser studio"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(28rem,36rem)_minmax(0,1fr)]">
            <div className="min-h-0 overflow-auto border-r p-4">
              <ParserDraftForm
                draft={draft}
                parserFilterColumns={parserFilterColumns}
                onChange={onDraftChange}
              />
            </div>
            <div className="grid min-h-0 grid-rows-[minmax(14rem,0.85fr)_minmax(18rem,1.15fr)] gap-4 overflow-hidden p-4">
              <ParserFilterMatches
                projectId={projectId}
                filters={draft.filters}
                selectedObservationId={previewPointer?.observationId}
                onPointersChange={handlePointersChange}
                onSelect={setPreviewPointer}
              />
              <div className="flex min-h-0 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">Parsed preview</div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={!canNavigatePreview}
                      onClick={() => navigatePreview("previous")}
                    >
                      Previous
                    </Button>
                    <span className="text-muted-foreground min-w-12 text-center text-xs">
                      {currentPreviewIndex >= 0
                        ? `${currentPreviewIndex + 1} / ${previewPointers.length}`
                        : "0 / 0"}
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={!canNavigatePreview}
                      onClick={() => navigatePreview("next")}
                    >
                      Next
                    </Button>
                  </div>
                </div>
                <ParserDraftPreview
                  projectId={projectId}
                  draft={draft}
                  pointer={previewPointer}
                />
              </div>
            </div>
          </div>

          {!isMobile && (
            <div
              {...panel.resizeHandleProps}
              className="group/resize absolute inset-y-0 -left-1 z-20 flex w-3 cursor-ew-resize touch-none justify-center focus-visible:outline-hidden"
            >
              <div
                aria-hidden="true"
                className={cn(
                  "h-full w-1 rounded-full transition-colors",
                  "group-hover/resize:bg-muted-foreground/40 group-focus-visible/resize:bg-muted-foreground/50",
                  panel.isResizing && "bg-muted-foreground/50",
                )}
              />
            </div>
          )}
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
