import type { AgUiContext } from "@langfuse/shared/in-app-agent";

const pageContexts = new Map<
  string,
  { owner: symbol; projectId: string; context: AgUiContext }
>();

export function registerInAppAgentPageContext(
  projectId: string,
  key: string,
  context: AgUiContext,
) {
  const owner = Symbol(key);
  const scopedKey = `${projectId}:${key}`;
  pageContexts.set(scopedKey, { owner, projectId, context });

  return () => {
    if (pageContexts.get(scopedKey)?.owner === owner) {
      pageContexts.delete(scopedKey);
    }
  };
}

export function getInAppAgentPageContext(projectId: string): AgUiContext {
  return Array.from(pageContexts.values()).flatMap((entry) =>
    entry.projectId === projectId ? entry.context : [],
  );
}
