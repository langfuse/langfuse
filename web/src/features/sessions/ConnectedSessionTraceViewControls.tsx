import { useState } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import {
  sessionTraceFilterColumns,
  sessionTraceFilterSchema,
  type FilterState,
} from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac";
import { InlineFilterBuilder } from "@/src/features/filters";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Dialog as DialogRoot } from "@/src/components/ui/dialog";
import { ModernSessionSaveViewDialogContent } from "./ModernSessionSaveViewDialogContent";

export function ConnectedSessionTraceViewControls({
  projectId,
  filters,
  onChange,
}: {
  projectId: string;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}) {
  const [dialog, setDialog] = useState<"filters" | "save" | "views" | null>(
    null,
  );
  const [draft, setDraft] = useState(filters);
  const [selectedViewId, setSelectedViewId] = useQueryParam(
    "sessionViewId",
    StringParam,
  );
  const canRead = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:read",
  });
  const canWrite = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:CUD",
  });
  const views = api.sessionViews.list.useQuery(
    { projectId },
    { enabled: canRead },
  );
  const options = api.sessions.filterOptionsFromEvents.useQuery(
    { projectId },
    { enabled: canRead && dialog === "filters" },
  );
  const filterColumns = sessionTraceFilterColumns.map((column) =>
    column.id === "traceTags" && column.type === "arrayOptions"
      ? { ...column, options: options.data?.tags ?? [] }
      : column,
  );
  const selectedView = views.data?.find((view) => view.id === selectedViewId);
  const utils = api.useUtils();
  const save = api.sessionViews.save.useMutation({
    onSuccess: async (view, input) => {
      await utils.sessionViews.list.invalidate({ projectId });
      setSelectedViewId(view.id);
      onChange(sessionTraceFilterSchema.parse(input.filters));
      setDialog(null);
    },
  });
  const remove = api.sessionViews.delete.useMutation({
    onSuccess: async (_, input) => {
      await utils.sessionViews.list.invalidate({ projectId });
      if (selectedViewId === input.id) setSelectedViewId(null);
    },
  });
  const isSelectedViewApplied =
    selectedView &&
    JSON.stringify(selectedView.filters) === JSON.stringify(filters);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
      <Button
        variant="secondary"
        size="sm"
        text={`Filter traces${filters.length > 0 ? ` (${filters.length})` : ""}`}
        onClick={() => {
          setDraft(filters);
          setDialog("filters");
        }}
      />
      {canRead ? (
        <Button
          variant="secondary"
          size="sm"
          text={isSelectedViewApplied ? selectedView.name : "Saved views"}
          onClick={() => setDialog("views")}
        />
      ) : null}
      {filters.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          text="Clear filters"
          onClick={() => {
            setSelectedViewId(null);
            onChange([]);
          }}
        />
      ) : null}
      <DialogRoot
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        {dialog === "filters" ? (
          <Dialog
            size="lg"
            title="Filter traces"
            actions={[
              ...(canWrite
                ? [
                    {
                      label: "Save as new view",
                      onClick: () => {
                        save.reset();
                        setDialog("save");
                      },
                    },
                  ]
                : []),
              ...(canWrite && selectedView
                ? [
                    {
                      label: "Update view",
                      loading: save.isPending,
                      onClick: () =>
                        save.mutate({
                          projectId,
                          id: selectedView.id,
                          name: selectedView.name,
                          filters: draft,
                        }),
                    },
                  ]
                : []),
              {
                label: "Apply filters",
                onClick: () => {
                  onChange(draft);
                  setDialog(null);
                },
              },
            ]}
          >
            <Dialog.Body>
              <p className="text-muted-foreground mb-4 text-sm">
                Keep matching traces. Root observation filters must match the
                same root; retained transcripts remain complete.
              </p>
              <InlineFilterBuilder
                columns={filterColumns}
                filterState={draft}
                onChange={setDraft}
              />
              {save.error ? (
                <p role="alert" className="text-destructive mt-2">
                  {save.error.message}
                </p>
              ) : null}
            </Dialog.Body>
          </Dialog>
        ) : null}
        {dialog === "save" ? (
          <>
            <ModernSessionSaveViewDialogContent
              isSaving={save.isPending}
              onCancel={() => setDialog("filters")}
              onSave={(name) =>
                save.mutate({ projectId, name, filters: draft })
              }
              error={save.error?.message}
            />
          </>
        ) : null}
        {dialog === "views" ? (
          <Dialog title="Session saved views">
            <Dialog.Body>
              {views.isPending ? <p>Loading views…</p> : null}
              {views.error ? <p role="alert">{views.error.message}</p> : null}
              {views.data?.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No saved views yet. Save your trace filters as a new view.
                </p>
              ) : null}
              {views.data?.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center justify-between gap-2 py-1"
                >
                  <Button
                    variant="ghost"
                    text={view.name}
                    onClick={() => {
                      setSelectedViewId(view.id);
                      onChange(view.filters);
                      setDialog(null);
                    }}
                  />
                  {canWrite ? (
                    <Button
                      variant="ghost"
                      text="Delete"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ projectId, id: view.id })}
                    />
                  ) : null}
                </div>
              ))}
              {remove.error ? <p role="alert">{remove.error.message}</p> : null}
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  text="Close"
                  onClick={() => setDialog(null)}
                />
              </div>
            </Dialog.Body>
          </Dialog>
        ) : null}
      </DialogRoot>
    </div>
  );
}
