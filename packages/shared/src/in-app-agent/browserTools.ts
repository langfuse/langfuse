import z from "zod";

import {
  IN_APP_AGENT_CREATE_SKILL_FROM_DRAFT_TOOL_NAME,
  IN_APP_AGENT_EDIT_SKILL_DRAFT_TOOL_NAME,
  IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
  IN_APP_AGENT_READ_SKILL_DRAFT_TOOL_NAME,
} from "./constants";
import {
  InAppAgentCreateSkillFromDraftArgsSchema,
  InAppAgentEditSkillDraftArgsSchema,
  InAppAgentReadSkillDraftArgsSchema,
  InAppAgentSkillDraftOutcomeSchema,
  InAppAgentSkillDraftSnapshotSchema,
} from "./skillDraft";

/**
 * Browser tools are offered to the model like any tool, but the worker does
 * not run them. The run ends on the call, the user's browser runs it, and the
 * result it reports starts the next run.
 */
const browserTools = {
  [IN_APP_AGENT_EDIT_SKILL_DRAFT_TOOL_NAME]: {
    description: [
      "Create or change the unsaved skill draft in the user's skill editor and open it, so the user can review and edit it. Nothing is saved.",
      `Before you create a skill or skill version, unless the user already said how, ask with ${IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME} whether to create it directly (langfuse_createSkillVersion, then summarize the result) or work on a draft together (this tool).`,
      "For an existing skill pass skillName; the draft builds on its latest version, or continues the draft the user already has. For a new skill omit skillName and include SKILL.md with name and description frontmatter.",
      "Pass only the files you create or change, with full content; other files stay as they are. Returns the draft after your changes.",
      `Call ${IN_APP_AGENT_READ_SKILL_DRAFT_TOOL_NAME} first when the user may have edited the draft since you last saw it.`,
    ].join(" "),
    args: InAppAgentEditSkillDraftArgsSchema,
    result: InAppAgentSkillDraftSnapshotSchema,
  },
  [IN_APP_AGENT_READ_SKILL_DRAFT_TOOL_NAME]: {
    description:
      "Read the unsaved skill draft in the user's skill editor, including the user's own edits. Changed and added files come with content; unchanged files match the version the draft is based on.",
    args: InAppAgentReadSkillDraftArgsSchema,
    result: InAppAgentSkillDraftSnapshotSchema,
  },
  [IN_APP_AGENT_CREATE_SKILL_FROM_DRAFT_TOOL_NAME]: {
    description: `Create a new skill version from the draft of ${IN_APP_AGENT_EDIT_SKILL_DRAFT_TOOL_NAME}, including the user's edits. The user confirms it in the browser, which then saves the current draft.`,
    args: InAppAgentCreateSkillFromDraftArgsSchema,
    result: InAppAgentSkillDraftOutcomeSchema,
  },
} satisfies Record<
  string,
  { description: string; args: z.ZodType; result: z.ZodType }
>;

export type InAppAgentBrowserToolName = keyof typeof browserTools;

export function isInAppAgentBrowserToolName(
  name: string,
): name is InAppAgentBrowserToolName {
  return Object.hasOwn(browserTools, name);
}

/** AG-UI tool definitions, which the agent offers as client tools. */
export function getInAppAgentBrowserToolDefinitions() {
  return Object.entries(browserTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.args),
  }));
}

export function parseInAppAgentBrowserToolResult(
  name: InAppAgentBrowserToolName,
  result: unknown,
) {
  return browserTools[name].result.safeParse(result);
}
