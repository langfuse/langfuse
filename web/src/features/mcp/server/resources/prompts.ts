/**
 * MCP Resources for Langfuse Prompts
 *
 * Implements read-only access to prompts via MCP Resources protocol.
 * Resources provide URI-based access to data.
 *
 * Supported URIs:
 * - langfuse://prompts?name={name}&label={label}&tag={tag}
 * - langfuse://prompt/{name}?label={label}&version={version}
 */

import { type ServerContext } from "../../types";
import { PromptService } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import { logger } from "@langfuse/shared/src/server";
import { PRODUCTION_LABEL, publicApiPaginationZod } from "@langfuse/shared";
import { UserInputError } from "../../internal/errors";
import { z } from "zod/v4";

/**
 * List prompts resource handler
 *
 * URI: langfuse://prompts?name={name}&label={label}&tag={tag}&page={page}&limit={limit}
 *
 * Query parameters:
 * - name: Filter by prompt name (partial match)
 * - label: Filter by label
 * - tag: Filter by tag
 * - page: Page number (1-indexed, default 1)
 * - limit: Items per page (1-100, default 50)
 *
 * Returns paginated prompt metadata following standard Langfuse API format
 */
export async function listPromptsResource(
  uri: URL,
  context: ServerContext,
): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  const name = uri.searchParams.get("name") || undefined;
  const label = uri.searchParams.get("label") || undefined;
  const tag = uri.searchParams.get("tag") || undefined;

  // Parse pagination parameters using standard Langfuse schema
  const paginationSchema = z.object(publicApiPaginationZod);
  const pagination = paginationSchema.parse({
    page: uri.searchParams.get("page") || undefined,
    limit: uri.searchParams.get("limit") || undefined,
  });

  logger.info("MCP: List prompts resource", {
    projectId: context.projectId,
    filters: { name, label, tag },
    pagination,
  });

  // Build filter conditions
  const where = {
    projectId: context.projectId,
    ...(name && { name: { contains: name } }),
    ...(label && { labels: { has: label } }),
    ...(tag && { tags: { has: tag } }),
  };

  // Query prompts and count in parallel (standard Langfuse pattern)
  const [prompts, totalItems] = await Promise.all([
    prisma.prompt.findMany({
      where,
      select: {
        id: true,
        name: true,
        version: true,
        type: true,
        labels: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: pagination.limit,
      skip: (pagination.page - 1) * pagination.limit,
    }),
    prisma.prompt.count({ where }),
  ]);

  // Build response with standard pagination metadata
  const response = {
    data: prompts,
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / pagination.limit),
    },
  };

  return {
    contents: [
      {
        uri: uri.toString(),
        mimeType: "application/json",
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

/**
 * Get specific prompt resource handler
 *
 * URI: langfuse://prompt/{name}?label={label}&version={version}
 *
 * Path parameter:
 * - name: Prompt name (required)
 *
 * Query parameters (mutually exclusive):
 * - label: Get prompt by label
 * - version: Get prompt by version number
 *
 * Returns compiled prompt with variables
 */
export async function getPromptResource(
  uri: URL,
  promptName: string,
  context: ServerContext,
): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  const label = uri.searchParams.get("label") || undefined;
  const versionParam = uri.searchParams.get("version");

  // Parse and validate version parameter
  let version: number | undefined = undefined;
  if (versionParam) {
    const parsedVersion = parseInt(versionParam, 10);
    if (isNaN(parsedVersion) || parsedVersion < 1) {
      throw new UserInputError(
        `Invalid version parameter: ${versionParam}. Version must be a positive integer.`,
      );
    }
    version = parsedVersion;
  }

  // Label and version are mutually exclusive
  if (version && label) {
    throw new UserInputError("Cannot specify both version and label");
  }

  logger.info("MCP: Get prompt resource", {
    projectId: context.projectId,
    promptName,
    label,
    version,
  });

  // Use PromptService to get compiled prompt
  const promptService = new PromptService(prisma, redis);

  // Handle discriminated union for PromptParams
  let prompt;
  try {
    if (version) {
      prompt = await promptService.getPrompt({
        projectId: context.projectId,
        promptName,
        version,
        label: undefined,
      });
    } else if (label) {
      prompt = await promptService.getPrompt({
        projectId: context.projectId,
        promptName,
        label,
        version: undefined,
      });
    } else {
      // Default to production label if neither specified
      prompt = await promptService.getPrompt({
        projectId: context.projectId,
        promptName,
        label: PRODUCTION_LABEL,
        version: undefined,
      });
    }
  } catch (error) {
    // Re-throw PromptService errors as UserInputError for better UX
    if (
      error instanceof Error &&
      (error.message.includes("Circular dependency") ||
        error.message.includes("Maximum nesting depth") ||
        error.message.includes("Prompt dependency not found") ||
        error.message.includes("not a text prompt"))
    ) {
      throw new UserInputError(error.message);
    }
    throw error; // Re-throw other errors unchanged
  }

  if (!prompt) {
    throw new UserInputError(
      `Prompt '${promptName}' not found${label ? ` with label '${label}'` : ""}${version ? ` with version ${version}` : ""}`,
    );
  }

  return {
    contents: [
      {
        uri: uri.toString(),
        mimeType: "application/json",
        text: JSON.stringify(prompt, null, 2),
      },
    ],
  };
}
