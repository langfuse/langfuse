import type { ReactNode } from "react";
import { useWebCalloutAction } from "@/src/features/web-callouts/components/useWebCalloutAction";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";
import {
  DetailHeaderActionsMenuController,
  type DetailHeaderActionsProps,
  type MenuPresentation,
} from "./DetailHeaderActionsMenuController";

type ConnectedDetailHeaderActionsMenuControllerProps = Omit<
  DetailHeaderActionsProps,
  "internalFeaturesEnabled" | "webCalloutAction"
> &
  MenuPresentation & {
    webCallout?: {
      traceId: string | null;
      observationId?: string | null;
      sessionId?: string | null;
    };
  };

export function ConnectedDetailHeaderActionsMenuController({
  webCallout,
  ...props
}: ConnectedDetailHeaderActionsMenuControllerProps) {
  const internalFeaturesEnabled = useInternalFeaturesEnabled();

  if (!webCallout) {
    return (
      <DetailHeaderActionsMenuController
        {...props}
        internalFeaturesEnabled={internalFeaturesEnabled}
      />
    );
  }

  return (
    <WebCalloutActionController
      projectId={props.projectId}
      webCallout={webCallout}
    >
      {(webCalloutAction) => (
        <DetailHeaderActionsMenuController
          {...props}
          internalFeaturesEnabled={internalFeaturesEnabled}
          webCalloutAction={webCalloutAction}
        />
      )}
    </WebCalloutActionController>
  );
}

function WebCalloutActionController({
  projectId,
  webCallout,
  children,
}: {
  projectId: string;
  webCallout: NonNullable<
    ConnectedDetailHeaderActionsMenuControllerProps["webCallout"]
  >;
  children: (action: ReturnType<typeof useWebCalloutAction>) => ReactNode;
}) {
  const action = useWebCalloutAction(
    {
      projectId,
      traceId: webCallout.traceId,
      observationId: webCallout.observationId,
      sessionId: webCallout.sessionId,
    },
    true,
  );

  return children(action);
}
