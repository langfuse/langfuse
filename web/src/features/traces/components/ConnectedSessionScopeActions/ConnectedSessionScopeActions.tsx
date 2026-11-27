import { type ComponentProps } from "react";
import {
  type OpenPublicShareDialog,
  PublicShareDialogController,
} from "@/src/features/sharing/components/PublicShareDialogController";
import { type TraceDetailActions } from "../TraceDetailActions";
import { useSessionScopeActions } from "@/src/features/traces/hooks/useSessionScopeActions";

type ConnectedSessionScopeActionsProps = Pick<
  ComponentProps<typeof TraceDetailActions>,
  "children" | "isPlaceholderData"
> & {
  projectId: string;
  sessionId: string;
};

export function ConnectedSessionScopeActions(
  props: ConnectedSessionScopeActionsProps,
) {
  return (
    <PublicShareDialogController kind="session" objectId={props.sessionId}>
      {({ openShareDialog }) => (
        <SessionScopeActions {...props} openShareDialog={openShareDialog} />
      )}
    </PublicShareDialogController>
  );
}

function SessionScopeActions({
  projectId,
  sessionId,
  isPlaceholderData,
  openShareDialog,
  children,
}: ConnectedSessionScopeActionsProps & {
  openShareDialog: OpenPublicShareDialog;
}) {
  const actions = useSessionScopeActions({
    projectId,
    sessionId,
    isPlaceholderData,
    enabled: true,
    openShareDialog,
  });
  return children(actions);
}
