/**
 * MCP Tool: createChatPrompt
 *
 * Creates a new chat prompt version in Langfuse.
 * Write operation with destructive hint.
 */

import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import {
  PromptType,
  PromptLabelSchema,
  PromptNameSchema,
  COMMIT_MESSAGE_MAX_LENGTH,
  PROMPT_NAME_MAX_LENGTH,
  PlaceholderMessageSchema,
  PromptChatMessageSchema,
} from "@langfuse/shared";
import { createPrompt as createPromptAction } from "@/src/features/prompts/server/actions/createPrompt";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

/**
 * Schema for a single chat message advertised to MCP clients.
 *
 * Intentionally a flat object with all optional fields (no union) so that the
 * generated JSON Schema for `prompt.items` stays a single object shape. Some
 * MCP clients ignore or mis-render nested `oneOf`/`anyOf` inside array items,
 * so we keep the advertised schema simple and enforce the either/or shape
 * (role+content vs. type='placeholder'+name) at runtime in the input schema.
 */
const ChatMessageBaseSchema = z
  .object({
    role: z
      .string()
      .optional()
      .describe(
        "The role (e.g., 'system', 'user', 'assistant'). Required for content messages; omit for placeholders.",
      ),
    content: z
      .string()
      .optional()
      .describe(
        "The message content. Required for content messages; omit for placeholders.",
      ),
    type: z
      .literal("placeholder")
      .optional()
      .describe(
        "Set to 'placeholder' to mark this entry as a message placeholder.",
      ),
    name: z
      .string()
      .optional()
      .describe("Placeholder name; required when type='placeholder'."),
  })
  .describe(
    "A chat message. Either provide role+content OR type='placeholder' with name.",
  );

/**
 * Validates a single chat message entry against the either/or contract.
 * Pushes validation issues onto the provided zod context with the correct path.
 */
const validateChatMessage = (
  msg: z.infer<typeof ChatMessageBaseSchema>,
  ctx: z.RefinementCtx,
  index: number,
): void => {
  if (msg.type === "placeholder") {
    if (msg.role !== undefined || msg.content !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Placeholder messages must not include role or content fields",
        path: [index],
      });
    }
    const parsed = PlaceholderMessageSchema.safeParse({
      type: "placeholder",
      name: msg.name,
    });
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message:
          parsed.error.issues[0]?.message ?? "Invalid placeholder message",
        path: [index],
      });
    }
  } else {
    if (typeof msg.role !== "string" || msg.role.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Content messages require a non-empty 'role' field",
        path: [index, "role"],
      });
    }
    if (typeof msg.content !== "string") {
      ctx.addIssue({
        code: "custom",
        message: "Content messages require a 'content' field",
        path: [index, "content"],
      });
    }
  }
};

/**
 * Base schema for JSON Schema generation (MCP client display)
 * Uses simple types that serialize well to JSON Schema
 */
const CreateChatPromptBaseSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(PROMPT_NAME_MAX_LENGTH)
    .describe("The name of the prompt"),
  prompt: z
    .array(ChatMessageBaseSchema)
    .min(1)
    .describe(
      "Array of chat messages. Each entry is either {role, content} or {type: 'placeholder', name}.",
    ),
  labels: z
    .array(z.string())
    .optional()
    .describe("Labels to assign (e.g., ['production', 'staging'])"),
  config: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      "Optional JSON config (e.g., {model: 'gpt-4', temperature: 0.7})",
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags for organization (e.g., ['experimental', 'v2'])"),
  commitMessage: z
    .string()
    .optional()
    .describe("Optional commit message describing the changes"),
});

/**
 * Input schema for runtime validation
 * Uses full validation schemas from shared package and enforces the
 * either/or shape per message via a superRefine on the prompt array.
 */
const CreateChatPromptInputSchema = z.object({
  name: PromptNameSchema,
  prompt: z
    .array(ChatMessageBaseSchema)
    .min(1, "Chat prompts must have at least one message")
    .superRefine((messages, ctx) => {
      messages.forEach((msg, i) => validateChatMessage(msg, ctx, i));
    }),
  labels: z.array(PromptLabelSchema).optional(),
  config: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
  commitMessage: z.string().max(COMMIT_MESSAGE_MAX_LENGTH).optional(),
});

/**
 * createChatPrompt tool definition and handler
 */
export const [createChatPromptTool, handleCreateChatPrompt] = defineTool({
  name: "createChatPrompt",
  description: [
    "Create a new chat prompt version in Langfuse. Chat prompts are arrays of messages.",
    "",
    "Important:",
    "- Prompts are immutable - cannot modify existing versions",
    "- To update content, create a new version",
    "- To promote to production, use updatePromptLabels",
    "- Labels are unique across versions",
    "",
    "Each message in the prompt array is one of two shapes:",
    "- Content message: {role, content}. Roles: system (instructions), user (input, can contain {{variables}}), assistant (examples).",
    "- Placeholder message: {type: 'placeholder', name}. Marks a position filled in at compile time with runtime-provided messages. Name must match /^[a-zA-Z][a-zA-Z0-9_]*$/ and must not collide with any {{variable}} name used in the prompt.",
    "",
    "Accepts: name, prompt (array of content and/or placeholder messages), optional labels, config, tags, commitMessage",
  ].join("\n"),
  baseSchema: CreateChatPromptBaseSchema,
  inputSchema: CreateChatPromptInputSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.prompts.create_chat", spanKind: SpanKind.INTERNAL },
      async (span) => {
        // Set span attributes for observability
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.prompt_name": input.name,
          "mcp.prompt_type": "chat",
        });

        // Narrow the loosely-typed input messages to the strict shape expected
        // by the createPrompt action by re-parsing with the canonical shared
        // schema. The superRefine above has already guaranteed the either/or
        // shape, so this parse is effectively just a type narrow: Zod strips
        // the undefined fields left over from the flat advertised schema and
        // returns a proper {role, content} | {type: 'placeholder', name}.
        const narrowedPrompt = input.prompt.map((msg) =>
          PromptChatMessageSchema.parse(msg),
        );

        const createdPrompt = await createPromptAction({
          projectId: context.projectId,
          name: input.name,
          type: PromptType.Chat,
          prompt: narrowedPrompt,
          labels: input.labels ?? [],
          config: input.config ?? {},
          tags: input.tags,
          commitMessage: input.commitMessage,
          createdBy: "API",
          prisma,
        });

        // Set created version for observability
        span.setAttribute("mcp.created_version", createdPrompt.version);

        await auditLog({
          action: "create",
          resourceType: "prompt",
          resourceId: createdPrompt.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          after: createdPrompt,
        });

        return {
          id: createdPrompt.id,
          name: createdPrompt.name,
          version: createdPrompt.version,
          type: createdPrompt.type,
          labels: createdPrompt.labels,
          tags: createdPrompt.tags,
          config: createdPrompt.config,
          createdAt: createdPrompt.createdAt,
          createdBy: createdPrompt.createdBy,
          message: `Successfully created chat prompt '${createdPrompt.name}' version ${createdPrompt.version}${createdPrompt.labels.length > 0 ? ` with labels: ${createdPrompt.labels.join(", ")}` : ""}`,
        };
      },
    );
  },
});
