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
import { PRODUCTION_LABEL } from "@langfuse/shared";
import { UserInputError } from "../../internal/errors";

/**
 * List prompts resource handler
 *
 * URI: langfuse://prompts?name={name}&label={label}&tag={tag}&limit={limit}&offset={offset}
 *
 * Query parameters:
 * - name: Filter by prompt name (partial match)
 * - label: Filter by label
 * - tag: Filter by tag
 * - limit: Maximum number of results (1-250, default 100)
 * - offset: Number of results to skip (default 0)
 *
 * Returns array of prompt metadata
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

  // Parse pagination parameters with validation
  const limitParam = uri.searchParams.get("limit");
  const offsetParam = uri.searchParams.get("offset");

  let limit = 100; // Default limit
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      throw new UserInputError(
        `Invalid limit parameter: ${limitParam}. Limit must be a positive integer.`,
      );
    }
    limit = Math.min(parsedLimit, 250); // Cap at 250
  }

  let offset = 0; // Default offset
  if (offsetParam) {
    const parsedOffset = parseInt(offsetParam, 10);
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      throw new UserInputError(
        `Invalid offset parameter: ${offsetParam}. Offset must be a non-negative integer.`,
      );
    }
    offset = parsedOffset;
  }

  logger.info("MCP: List prompts resource", {
    projectId: context.projectId,
    filters: { name, label, tag },
    pagination: { limit, offset },
  });

  // Query prompts with filters
  const prompts = await prisma.prompt.findMany({
    where: {
      projectId: context.projectId,
      ...(name && { name: { contains: name } }),
      ...(label && { labels: { has: label } }),
      ...(tag && { tags: { has: tag } }),
    },
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
    take: limit,
    skip: offset,
  });

  return {
    contents: [
      {
        uri: uri.toString(),
        mimeType: "application/json",
        text: JSON.stringify(prompts, null, 2),
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
