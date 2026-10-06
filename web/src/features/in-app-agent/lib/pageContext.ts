import type { AgUiContext } from "@langfuse/shared/in-app-agent";
import { createProjectScopedRegistrationStore } from "./projectScopedRegistrationStore";

const pageContexts = createProjectScopedRegistrationStore<AgUiContext>();

export function registerInAppAgentPageContext(
  projectId: string,
  key: string,
  context: AgUiContext,
) {
  return pageContexts.register(projectId, key, context);
}

export function getInAppAgentPageContext(projectId: string): AgUiContext {
  return pageContexts.values(projectId).flat();
}
