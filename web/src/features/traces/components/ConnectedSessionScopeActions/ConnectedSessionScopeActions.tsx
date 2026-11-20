import { type ComponentProps } from "react";
import { type TraceDetailActions } from "../TraceDetailActions";
import { useSessionScopeActions } from "@/src/features/traces/hooks/useSessionScopeActions";

export function ConnectedSessionScopeActions({
  projectId,
  sessionId,
  isPlaceholderData,
  children,
}: Pick<
  ComponentProps<typeof TraceDetailActions>,
  "children" | "isPlaceholderData"
> & {
  projectId: string;
  sessionId: string;
}) {
  const actions = useSessionScopeActions({
    projectId,
    sessionId,
    isPlaceholderData,
    enabled: true,
  });
  return children(actions);
}
