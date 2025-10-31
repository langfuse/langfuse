/**
 * MCP Tool: updatePromptLabels
 *
 * Updates labels for a specific prompt version.
 * Write operation with destructive hint.
 * This is the ONLY way to modify existing prompts (labels only).
 */

import { z } from "zod/v4";
import { defineTool } from "../../internal/define-tool";
import { ParamPromptName, ParamNewLabels } from "../../internal/validation";
import { updatePrompt } from "@/src/features/prompts/server/actions/updatePrompts";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { prisma } from "@langfuse/shared/src/db";
import { UserInputError } from "../../internal/errors";

/**
 * Input schema for updatePromptLabels tool
 * Note: projectId is NOT included - it's auto-injected from context
 */
const UpdatePromptLabelsInputSchema = z.object({
  name: ParamPromptName,
  version: z.coerce
    .number()
    .int()
    .positive()
    .describe("The version number to update (required)"),
  newLabels: ParamNewLabels,
});

/**
 * updatePromptLabels tool definition and handler
 */
export const [updatePromptLabelsTool, handleUpdatePromptLabels] = defineTool({
  name: "updatePromptLabels",
  description: [
    "Update labels for a specific prompt version.",
    "",
    "⚠️ **This operation is destructive.** Always confirm with the user before executing.",
    "",
    "**Important Behavior:**",
    "- This is the ONLY way to modify existing prompts (labels only)",
    "- Labels are unique across versions - setting 'production' on v3 removes it from v2",
    "- You cannot modify prompt content - create a new version instead with `createPrompt`",
    "- The 'latest' label is automatically managed and cannot be set manually",
    "",
    "**Common Use Cases:**",
    "- **Promote to production**: Move 'production' label to a new version",
    "- **Demote from production**: Remove 'production' label (set to [])",
    "- **Stage for testing**: Add 'staging' label to a version",
    "",
    "**Label Uniqueness:**",
    "When you set labels on a version, those labels are automatically removed from",
    "all other versions of the same prompt. This ensures each label points to exactly",
    "one version.",
    "",
    "**Examples:**",
    "```",
    "// Promote version 3 to production",
    "// (automatically removes 'production' from other versions)",
    "{",
    "  name: 'chatbot',",
    "  version: 3,",
    "  newLabels: ['production']",
    "}",
    "",
    "// Add multiple labels to version 2",
    "{",
    "  name: 'system-prompt',",
    "  version: 2,",
    "  newLabels: ['staging', 'testing']",
    "}",
    "",
    "// Remove all labels from version 1",
    "{",
    "  name: 'instructions',",
    "  version: 1,",
    "  newLabels: []",
    "}",
    "```",
    "",
    "**What You CANNOT Do:**",
    "- ❌ Set 'latest' label (it's auto-managed)",
    "- ❌ Modify prompt content (use `createPrompt` to create a new version)",
    "- ❌ Change prompt type (use `createPrompt` with a new name)",
    "- ❌ Modify tags (tags are managed via `createPrompt`)",
  ].join("\n"),
  inputSchema: UpdatePromptLabelsInputSchema,
  handler: async (input, context) => {
    const { name, version, newLabels } = input;

    // Fetch existing prompt to capture "before" state for audit log
    const existingPrompt = await prisma.prompt.findUnique({
      where: {
        projectId_name_version: {
          projectId: context.projectId,
          name,
          version,
        },
      },
    });

    if (!existingPrompt) {
      throw new UserInputError(
        `Prompt '${name}' version ${version} not found in project`,
      );
    }

    // Update prompt labels using existing action
    const updatedPrompt = await updatePrompt({
      promptName: name,
      projectId: context.projectId, // Auto-injected from authenticated API key
      promptVersion: version,
      newLabels,
    });

    // Audit log the update with both before and after states
    await auditLog({
      action: "update",
      resourceType: "prompt",
      resourceId: updatedPrompt.id,
      projectId: context.projectId,
      orgId: context.orgId,
      apiKeyId: context.apiKeyId,
      before: existingPrompt,
      after: updatedPrompt,
    });

    // Return formatted response
    return {
      id: updatedPrompt.id,
      name: updatedPrompt.name,
      version: updatedPrompt.version,
      labels: updatedPrompt.labels,
      message: `Successfully updated labels for '${updatedPrompt.name}' version ${updatedPrompt.version}. Labels are now: ${updatedPrompt.labels.length > 0 ? updatedPrompt.labels.join(", ") : "(none)"}`,
    };
  },
  destructiveHint: true,
});
