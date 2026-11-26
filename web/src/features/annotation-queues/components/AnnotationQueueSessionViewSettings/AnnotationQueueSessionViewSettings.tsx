import { type RouterOutputs } from "@/src/utils/api";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Skeleton } from "@/src/components/ui/skeleton";

export function AnnotationQueueSessionViewSettings({
  viewsState,
  value,
  onChange,
  disabled,
  canSaveViews,
  onCreate,
  onEdit,
}: {
  viewsState:
    | { status: "forbidden" | "pending" }
    | { status: "error"; onRetry: () => void }
    | { status: "success"; views: RouterOutputs["sessionViews"]["list"] };
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
  canSaveViews: boolean;
  onCreate: () => void;
  onEdit: (view: RouterOutputs["sessionViews"]["list"][number]) => void;
}) {
  const selectedView =
    viewsState.status === "success"
      ? viewsState.views.find(
          (view) => view.ownership === "PROJECT" && view.id === value,
        )
      : undefined;
  return (
    <Accordion type="single" collapsible>
      <Accordion.Item value="session-view">
        <Accordion.Trigger size="sm">Session view</Accordion.Trigger>
        <Accordion.Content>
          <div className="flex flex-col gap-3 py-3">
            <p className="text-muted-foreground text-xs">
              Choose a project view for everyone annotating this queue. Private
              views cannot be used by queues.
            </p>
            {viewsState.status === "forbidden" && (
              <p className="text-muted-foreground text-xs">
                You don&apos;t have permission to choose saved views.
              </p>
            )}
            {viewsState.status === "pending" && (
              <Skeleton className="h-9 w-full" />
            )}
            {viewsState.status === "error" && (
              <div className="flex items-center gap-2">
                <p role="alert" className="text-destructive text-xs">
                  Could not load saved views.
                </p>
                <Button
                  text="Retry"
                  variant="ghost"
                  onClick={viewsState.onRetry}
                />
              </div>
            )}
            {viewsState.status === "success" && (
              <div className="ph-no-capture">
                <SelectInput
                  aria-label="Session view"
                  placeholder="Select a session view"
                  value={value ?? "default"}
                  options={[
                    { value: "default", label: "Default session view" },
                    ...viewsState.views
                      .filter((view) => view.ownership === "PROJECT")
                      .map((view) => ({ value: view.id, label: view.name })),
                  ]}
                  onValueChange={(id) => onChange(id === "default" ? null : id)}
                  disabled={disabled}
                  noCapture
                />
              </div>
            )}
            {viewsState.status === "success" &&
              viewsState.views.some((view) => view.id === value) && (
                <p className="text-muted-foreground text-xs">
                  Changes to this saved view apply everywhere it is used.
                </p>
              )}
            <div className="flex flex-wrap gap-2">
              <Button
                text="Create view"
                variant="secondary"
                disabled={
                  disabled || !canSaveViews || viewsState.status === "forbidden"
                }
                onClick={onCreate}
              />
              {selectedView && (
                <Button
                  text="Edit view"
                  variant="ghost"
                  disabled={disabled || !canSaveViews || !selectedView.canEdit}
                  onClick={() => onEdit(selectedView)}
                />
              )}
            </div>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
