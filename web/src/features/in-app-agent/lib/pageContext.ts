import type { AgUiContext } from "@langfuse/shared/in-app-agent";
import { createProjectScopedRegistrationStore } from "./projectScopedRegistrationStore";

const pageContexts = createProjectScopedRegistrationStore<AgUiContext>();

export function registerInAppAgentPageContext(
  projectId: string,
  key: string,
  context: AgUiContext,
) {
  const unregister = pageContexts.register(projectId, key, context);
  return () => {
    unregister();
  };
}

export function getInAppAgentPageContext(projectId: string): AgUiContext {
  return pageContexts.values(projectId).flat();
}
