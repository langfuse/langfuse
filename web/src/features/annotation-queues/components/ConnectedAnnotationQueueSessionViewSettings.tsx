import { type ComponentProps, type ReactNode } from "react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type AnnotationQueueSessionViewSettings } from "./AnnotationQueueSessionViewSettings/AnnotationQueueSessionViewSettings";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { ConnectedAnnotationQueueSessionViewDialogController } from "./ConnectedAnnotationQueueSessionViewDialogController";

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
  children: (
    settings: Pick<
      ComponentProps<typeof AnnotationQueueSessionViewSettings>,
      | "viewsState"
      | "value"
      | "onChange"
      | "canSaveViews"
      | "onCreate"
      | "onEdit"
    > | null,
  ) => ReactNode;
}) {
  const { isV4 } = useReadPath();
  const isTimelineEnabled = useIsFeatureEnabled("sessionViewV2Timeline", {
    projectId,
  });
  const enabled = isV4 && isTimelineEnabled;
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
    { enabled: enabled && canReadViews },
  );
  const viewsState = (() => {
    if (!canReadViews) return { status: "forbidden" } as const;
    if (views.isPending) return { status: "pending" } as const;
    if (views.isError) {
      return {
        status: "error",
        onRetry: () => {
          views.refetch();
        },
      } as const;
    }
    return { status: "success", views: views.data } as const;
  })();

  if (!enabled) return children(null);

  return (
    <ConnectedAnnotationQueueSessionViewDialogController
      projectId={projectId}
      onChange={onChange}
      disabled={disabled}
    >
      {({ openDialog }) =>
        children({
          viewsState,
          value,
          onChange,
          canSaveViews,
          onCreate: () => openDialog({ type: "create" }),
          onEdit: (view) => openDialog({ type: "edit", view }),
        })
      }
    </ConnectedAnnotationQueueSessionViewDialogController>
  );
}
