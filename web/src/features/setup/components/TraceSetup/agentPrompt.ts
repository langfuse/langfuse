import type { Integration } from "../../integrations/types";

const SKILL_GUIDE =
  "https://github.com/langfuse/skills/blob/main/skills/langfuse/SKILL.md";
const ALL_INTEGRATIONS = "https://langfuse.com/llms.txt";

/** Step 3: the picked integration's guide, as markdown, or the one that matches the stack. */
function integrationStep(
  integration: Pick<Integration, "name" | "href"> | null,
) {
  if (integration === null)
    return `3. Pick the integration that matches the stack (all of them are listed in ${ALL_INTEGRATIONS}) and prefer it to manual instrumentation.`;
  return `3. Use the ${integration.name} integration: follow its guide at ${integration.href}.md and prefer it to manual instrumentation. If the stack isn't ${integration.name}, pick the one that matches from ${ALL_INTEGRATIONS}.`;
}

/**
 * The one prompt that has a coding agent add tracing to any stack: install the Langfuse skill, use the keys already in
 * .env, follow the picked integration's guide (or, with `null`, pick the one that matches), then run the app once and
 * read its trace back.
 */
export function buildAgentPrompt({
  baseUrl,
  integration,
}: {
  baseUrl: string;
  integration: Pick<Integration, "name" | "href"> | null;
}) {
  return [
    "Add Langfuse tracing to this application.",
    `1. Install the Langfuse skill: npx skills add langfuse/skills --skill "langfuse" (in Cursor: /add-plugin langfuse). If you can't install skills, read ${SKILL_GUIDE} and follow it.`,
    `2. The keys are already in .env: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL=${baseUrl}. Don't print, paste or commit them.`,
    integrationStep(integration),
    "4. Run the app once so a trace is sent, fetch it back to check it, and tell me what you traced.",
  ].join("\n");
}
