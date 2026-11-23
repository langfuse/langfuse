import { type ReactNode, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { SessionCustomizationDialog } from "@/src/features/sessions/SessionCustomizationDialog/SessionCustomizationDialog";
import { api, type RouterOutputs } from "@/src/utils/api";

type SessionViewDialogState =
  | { type: "create" }
  | {
      type: "edit";
      view: RouterOutputs["sessionViews"]["list"][number];
    };

export function ConnectedAnnotationQueueSessionViewDialogController({
  projectId,
  onChange,
  disabled,
  children,
}: {
  projectId: string;
  onChange: (value: string | null) => void;
  disabled: boolean;
  children: (controls: {
    openDialog: (state: SessionViewDialogState) => void;
  }) => ReactNode;
}) {
  const canSaveViews = useHasProjectAccess({
    projectId,
    scope: "SessionViews:CUD",
  });
  const createView = api.sessionViews.create.useMutation();
  const updateView = api.sessionViews.update.useMutation();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [dialog, setDialog] = useState<{
    state: SessionViewDialogState;
    isOpen: boolean;
    openCount: number;
  }>();
  const state = dialog?.state;
  const closeDialog = () => {
    setDialog((current) => {
      if (!current || current.openCount !== dialog?.openCount) return current;
      return { ...current, isOpen: false };
    });
  };

  return (
    <>
      {children({
        openDialog: (state) => {
          createView.reset();
          updateView.reset();
          setDialog((current) => ({
            state,
            isOpen: true,
            openCount: (current?.openCount ?? -1) + 1,
          }));
        },
      })}
      {/* The queue dialog must retain its own Radix root context. */}
      <DialogPrimitive.Root
        open={dialog?.isOpen ?? false}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        {state && (
          <SessionCustomizationDialog
            key={dialog?.openCount}
            projectId={projectId}
            variant={{
              type: state.type,
              initialName: state.type === "edit" ? state.view.name : "",
              pending: createView.isPending || updateView.isPending,
              disabled:
                disabled ||
                !canSaveViews ||
                (state.type === "edit" && !state.view.canEdit),
              error: createView.error?.message ?? updateView.error?.message,
              ownership: "PROJECT",
            }}
            initialFilters={state.type === "edit" ? state.view.filters : []}
            initialViewMode={
              state.type === "edit" ? state.view.viewMode : "conversational"
            }
            initialUnmatchedTraces={
              state.type === "edit" ? state.view.unmatchedTraces : "show"
            }
            onApply={async (configuration) => {
              if (
                disabled ||
                !canSaveViews ||
                createView.isPending ||
                updateView.isPending ||
                (state.type === "edit" && !state.view.canEdit)
              )
                return;
              try {
                const input = {
                  ...configuration,
                  projectId,
                  ownership: "PROJECT" as const,
                };
                const result =
                  state.type === "edit"
                    ? await updateView.mutateAsync({
                        ...input,
                        id: state.view.id,
                      })
                    : await createView.mutateAsync(input);
                capture(
                  state.type === "edit"
                    ? "saved_views:update_config"
                    : "saved_views:create",
                  {
                    tableName: "session-detail",
                    surface: "annotation_queue",
                    isV4: true,
                    filterCount: configuration.filters.length,
                    viewMode: configuration.viewMode,
                    unmatchedTraces: configuration.unmatchedTraces,
                  },
                );
                await Promise.all([
                  utils.sessionViews.list.invalidate({ projectId }),
                  utils.sessionViews.preferences.invalidate({ projectId }),
                  utils.annotationQueues.invalidate(),
                ]);
                onChange(result.view.id);
                closeDialog();
              } catch {
                // Mutation errors remain in the dialog so saving can be retried.
              }
            }}
          />
        )}
      </DialogPrimitive.Root>
    </>
  );
}
