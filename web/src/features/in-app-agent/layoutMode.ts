/**
 * Where the assistant window sits relative to the page content. The provider
 * only produces "full" and "dock-right"; "floating" is the window the host
 * still carries next to the handheld drawer.
 */
export type InAppAgentLayoutMode = "full" | "dock-right" | "floating";

/** Next.js pathname of project Home, which carries its own Ask box. */
export const PROJECT_HOME_PATHNAME = "/project/[projectId]";
