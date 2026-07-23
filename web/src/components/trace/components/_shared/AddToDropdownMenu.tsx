/**
 * "+ Add to" grouped actions menu for the trace/observation details panel
 * header, matching the session inspector's menu structure
 * (web/src/components/session/inspector/ObservationInspector.tsx):
 * Add to dataset / Annotate / Add comment behind one bordered dropdown.
 *
 * Overlay lifecycle (web/AGENTS.md): the dataset Dialog and annotate Drawer
 * mount as SIBLINGS of the DropdownMenu, so the menu closes before they open.
 * The comment drawer is owned by the caller (controlled state) — the menu item
 * only opens it.
 *
 * Preserved behavior from the previous separate buttons:
 * - "In N dataset(s)" links to existing dataset items (same query).
 * - PostHog captures for dataset-form and annotate-form opens.
 * - Access gating per scope (datasets:CUD, scores:CUD, comments:read/CUD).
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Database,
  MessageSquare,
  Plus,
  SquarePen,
} from "lucide-react";
import { parseJsonPrioritised, type Prisma } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Drawer, DrawerContent } from "@/src/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";

export interface AddToDropdownMenuProps {
  projectId: string;
  traceId: string;
  /** Set for observation-level menus; undefined for trace-level. */
  observationId?: string;
  /** Prefill for the dataset item form; undefined disables the item (loading). */
  datasetPrefill?: {
    input: Prisma.JsonValue | null;
    output: Prisma.JsonValue | null;
    metadata: MetadataDomainClient;
  };
  /** Rendered inside the sibling annotate Drawer while it is open. */
  annotateContent: ReactNode;
  isAnnotateDrawerOpen: boolean;
  onAnnotateDrawerOpenChange: (open: boolean) => void;
  /** Picks the PostHog event (score:update vs score:create form open). */
  hasExistingScores: boolean;
  /** Hidden in annotation mode (annotation panel is shown separately). */
  showAnnotate: boolean;
  /** Opens the caller-owned comment drawer. */
  onOpenComments: () => void;
  commentCount: number | undefined;
}

const normalizePrefillValue = (
  value: Prisma.JsonValue | null,
): Prisma.JsonValue | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const parsed = parseJsonPrioritised(value);
    return parsed !== undefined ? parsed : value;
  }
  return value;
};

export function AddToDropdownMenu({
  projectId,
  traceId,
  observationId,
  datasetPrefill,
  annotateContent,
  isAnnotateDrawerOpen,
  onAnnotateDrawerOpenChange,
  hasExistingScores,
  showAnnotate,
  onOpenComments,
  commentCount,
}: AddToDropdownMenuProps) {
  const capture = usePostHogClientCapture();
  const [isDatasetFormOpen, setIsDatasetFormOpen] = useState(false);

  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });
  const hasAnnotationAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const hasCommentReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const hasCommentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });
  const commentsDisabled =
    !hasCommentReadAccess || (!hasCommentWriteAccess && !commentCount);

  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);
  const objectInDatasets =
    api.datasets.datasetItemsBasedOnTraceOrObservation.useQuery(
      { projectId, traceId, observationId },
      { enabled: isAuthenticatedAndProjectMember },
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 px-2.5">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add to
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!hasDatasetAccess || !datasetPrefill}
            onClick={() => {
              setIsDatasetFormOpen(true);
              capture("dataset_item:new_from_trace_form_open", {
                object: observationId ? "observation" : "trace",
              });
            }}
          >
            <Database className="mr-2 h-3.5 w-3.5" />
            Add to dataset
          </DropdownMenuItem>
          {showAnnotate ? (
            <DropdownMenuItem
              disabled={!hasAnnotationAccess}
              onClick={() => {
                onAnnotateDrawerOpenChange(true);
                capture(
                  hasExistingScores
                    ? "score:update_form_open"
                    : "score:create_form_open",
                  { type: "trace", source: "TraceDetail" },
                );
              }}
            >
              <SquarePen className="mr-2 h-3.5 w-3.5" />
              Annotate
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={commentsDisabled}
            onClick={onOpenComments}
          >
            <MessageSquare className="mr-2 h-3.5 w-3.5" />
            Add comment
            {commentCount ? (
              <span className="text-muted-foreground ml-auto pl-2 font-mono text-[10px]">
                {commentCount > 99 ? "99+" : commentCount}
              </span>
            ) : null}
          </DropdownMenuItem>
          {objectInDatasets.data && objectInDatasets.data.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {`In ${objectInDatasets.data.length} dataset(s)`}
              </DropdownMenuLabel>
              {objectInDatasets.data.map(
                ({ id: datasetItemId, datasetName, datasetId }) => (
                  <DropdownMenuItem key={datasetItemId} asChild>
                    <Link
                      href={`/project/${projectId}/datasets/${datasetId}/items/${datasetItemId}`}
                    >
                      <span
                        className="max-w-[260px] truncate"
                        title={datasetName}
                      >
                        {datasetName}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ),
              )}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sibling overlays — the dropdown closes before these mount. */}
      <Dialog
        open={hasDatasetAccess && isDatasetFormOpen}
        onOpenChange={setIsDatasetFormOpen}
      >
        <DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none">
          <DialogHeader>
            <DialogTitle>Add item to datasets</DialogTitle>
          </DialogHeader>
          {isDatasetFormOpen && datasetPrefill ? (
            <NewDatasetItemForm
              traceId={traceId}
              observationId={observationId}
              projectId={projectId}
              input={normalizePrefillValue(datasetPrefill.input)}
              output={normalizePrefillValue(datasetPrefill.output)}
              metadata={datasetPrefill.metadata}
              onFormSuccess={() => setIsDatasetFormOpen(false)}
              className="h-full overflow-y-auto"
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Drawer
        open={isAnnotateDrawerOpen}
        onOpenChange={onAnnotateDrawerOpenChange}
      >
        <DrawerContent className="p-3">
          {isAnnotateDrawerOpen ? annotateContent : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}
