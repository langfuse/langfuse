import { type ReactNode } from "react";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterOutputs } from "@/src/utils/api";

export function ConnectedAnnotationQueueSessionViewSettings({
  projectId,
  value,
  onChange,
  disabled,
  children,
}: {
  projectId: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
  children: (controls: {
    selectedView: RouterOutputs["sessionViews"]["list"][number] | undefined;
    canReadViews: boolean;
    canSaveViews: boolean;
  }) => ReactNode;
}) {
  const canReadViews = useHasProjectAccess({
    projectId,
    scope: "SessionViews:read",
  });
  const canSaveViews = useHasProjectAccess({
    projectId,
    scope: "SessionViews:CUD",
  });
  const views = api.sessionViews.list.useQuery(
    { projectId },
    { enabled: canReadViews },
  );
  const projectViews = views.data?.filter(
    (view) => view.ownership === "PROJECT",
  );
  const selectedView = projectViews?.find((view) => view.id === value);

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
            {!canReadViews && (
              <p className="text-muted-foreground text-xs">
                You don&apos;t have permission to choose saved views.
              </p>
            )}
            {canReadViews && views.isPending && (
              <Skeleton className="h-9 w-full" />
            )}
            {canReadViews && views.isError && (
              <div className="flex items-center gap-2">
                <p role="alert" className="text-destructive text-xs">
                  Could not load saved views.
                </p>
                <Button
                  text="Retry"
                  variant="ghost"
                  onClick={() => views.refetch()}
                />
              </div>
            )}
            {canReadViews && views.isSuccess && (
              <div className="ph-no-capture">
                <SelectInput
                  aria-label="Session view"
                  placeholder="Select a session view"
                  value={value ?? "default"}
                  options={[
                    { value: "default", label: "Default session view" },
                    ...(projectViews ?? []).map((view) => ({
                      value: view.id,
                      label: view.name,
                    })),
                  ]}
                  onValueChange={(viewId) =>
                    onChange(viewId === "default" ? null : viewId)
                  }
                  disabled={disabled}
                  noCapture
                />
              </div>
            )}
            {selectedView && (
              <p className="text-muted-foreground text-xs">
                Changes to this saved view apply everywhere it is used.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {children({ selectedView, canReadViews, canSaveViews })}
            </div>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
