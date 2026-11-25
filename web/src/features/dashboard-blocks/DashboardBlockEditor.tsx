import dynamic from "next/dynamic";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { type FilterState } from "@langfuse/shared";
import { type SavedMultiQueryConfig } from "@langfuse/shared/dashboards";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { useSaveDashboardBlock } from "./useDashboardBlockMutations";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { type BlockEditorRequest } from "./dashboard-block-context";
import { DashboardMarkdownEditor } from "./DashboardMarkdownEditor";
import { DashboardBlockPlacement } from "./DashboardBlockPlacement";
import { Skeleton } from "@/src/components/ui/skeleton";
const MultiQueryEditor = dynamic(
  () =>
    import("./multi-query/MultiQueryEditor").then(
      (module) => module.MultiQueryEditor,
    ),
  { loading: () => <Skeleton className="h-80 w-full" /> },
);

export function DashboardBlockEditor({
  request,
  projectId,
  dashboardId,
  canEdit,
  readPath,
  dateRange,
  filterState,
  placementOptions,
  onSaved,
  onPlacementChanged,
  onPreview,
  onCancel,
}: {
  request: BlockEditorRequest;
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  placementOptions: { value: string | null; label: string }[];
  onSaved: () => void;
  onPlacementChanged: () => void;
  onPreview: () => void;
  onCancel: () => void;
}) {
  const [id] = useState(() => request.block?.id ?? uuidv4());
  const [beforePlacementId, setBeforePlacementId] = useState(
    request.block?.beforePlacementId ?? null,
  );
  const updatePlacement = (next: string | null) => {
    if (next === beforePlacementId) return;
    setBeforePlacementId(next);
    onPlacementChanged();
  };
  const mutation = useSaveDashboardBlock({ projectId, dashboardId, onSaved });
  const error = saveErrorMessage(mutation.isError, mutation.error?.data?.code);
  const save = (
    content:
      | {
          kind: "markdown";
          config: { version: 1; title: string; content: string };
        }
      | { kind: "multiQuery"; config: SavedMultiQueryConfig },
  ) => {
    if (!canEdit || mutation.isPending) return;
    mutation.mutate({
      projectId,
      dashboardId,
      blockPatch: {
        op: "upsert",
        id,
        expectedRevision: request.block?.revision ?? 0,
        beforePlacementId,
        ...content,
      },
    });
  };
  if (!canEdit)
    return (
      <Dialog title="Editing unavailable" closeLabel="Close" noCapture>
        <Dialog.Body>
          <p className="text-muted-foreground text-sm">
            This block is no longer available for editing. No changes have been
            saved.
          </p>
        </Dialog.Body>
      </Dialog>
    );
  if (request.kind === "markdown")
    return (
      <DashboardMarkdownEditor
        initial={
          request.block?.kind === "markdown"
            ? request.block.config
            : { version: 1, title: "", content: "" }
        }
        beforePlacementId={beforePlacementId}
        placementOptions={request.block ? [] : placementOptions}
        pending={mutation.isPending}
        error={error}
        onPlacementChange={updatePlacement}
        onSave={(config) => save({ kind: "markdown", config })}
        onCancel={onCancel}
        onPreview={onPreview}
      />
    );
  return (
    <Dialog
      title={request.block ? "Edit multi-query chart" : "New multi-query chart"}
      size="xxl"
      noCapture
      requireExplicitClose={mutation.isPending}
    >
      <Dialog.Body>
        {!request.block && placementOptions.length > 1 && (
          <DashboardBlockPlacement
            value={beforePlacementId}
            options={placementOptions}
            disabled={mutation.isPending}
            onChange={updatePlacement}
          />
        )}
        <MultiQueryEditor
          initialTabId={request.initialTabId}
          initial={
            request.block?.kind === "multiQuery"
              ? request.block.config
              : undefined
          }
          projectId={projectId}
          dateRange={dateRange}
          filterState={filterState}
          readPath={readPath}
          savePending={mutation.isPending}
          saveError={error}
          onSave={(config) => save({ kind: "multiQuery", config })}
          onCancel={onCancel}
        />
      </Dialog.Body>
    </Dialog>
  );
}

function saveErrorMessage(failed: boolean, code: string | undefined) {
  if (!failed) return undefined;
  if (code === "CONFLICT")
    return "This block was changed elsewhere. Your draft is still here. Cancel and reopen it to load the latest saved version.";
  return "The block could not be saved. Your draft is still here; try again.";
}
