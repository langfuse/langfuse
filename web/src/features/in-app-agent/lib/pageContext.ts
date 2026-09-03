import type { AgUiContext } from "@langfuse/shared/in-app-agent";

const pageContexts = new Map<string, { owner: symbol; context: AgUiContext }>();

export function registerInAppAgentPageContext(
  key: string,
  context: AgUiContext,
) {
  const owner = Symbol(key);
  pageContexts.set(key, { owner, context });

  return () => {
    if (pageContexts.get(key)?.owner === owner) {
      pageContexts.delete(key);
    }
  };
}

export function getInAppAgentPageContext(): AgUiContext {
  return Array.from(pageContexts.values()).flatMap(({ context }) => context);
}
