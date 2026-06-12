import type { Tool } from "@mastra/core/tools";
import { z } from "zod";
import { deduplicateBy } from "@/src/utils/arrays";
import {
  InAppAgentDocsSourceSchema,
  InAppAgentDocsSourceWithDisplayFieldsSchema,
  type InAppAgentMessageSource,
} from "@/src/ee/features/in-app-agent/schema";

const LangfuseDocsDocumentSchema = z.object({
  type: z.literal("document"),
  title: z.string().trim().optional(),
  url: InAppAgentDocsSourceSchema.shape.url,
});

const InkeepChoiceContentSourceSchema = z
  .object({
    content: z.array(z.unknown()),
  })
  .transform(({ content }): InAppAgentMessageSource | null => {
    const firstDocument = content
      .map((entry) => LangfuseDocsDocumentSchema.safeParse(entry))
      .find((parsedEntry) => parsedEntry.success);

    if (!firstDocument?.success) {
      return null;
    }

    const parsedSource = InAppAgentDocsSourceWithDisplayFieldsSchema.safeParse({
      title: firstDocument.data.title || firstDocument.data.url,
      url: firstDocument.data.url,
    });

    return parsedSource.success ? parsedSource.data : null;
  });

const InkeepChoiceResultSchema = z.object({
  _meta: z.object({
    choices: z.array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    ),
  }),
});

export function prefixLangfuseDocsTools(
  toolset: Record<string, Tool<unknown, unknown, unknown, unknown>> | undefined,
) {
  return Object.fromEntries(
    Object.entries(toolset ?? {}).map(([toolName, tool]) => [
      `langfuseDocs_${toolName}`,
      // Extract sources into a `sources` field
      wrapTool(tool, (result) => {
        const parsedResult = parseJsonString(result) ?? result;
        const sources = extractLangfuseDocsSources(parsedResult);

        if (isRecord(parsedResult)) {
          return { ...parsedResult, sources };
        }

        return { content: result, sources };
      }),
    ]),
  );
}

function wrapTool<TTool extends Tool<unknown, unknown, unknown, unknown>>(
  tool: TTool,
  wrapResult: (result: unknown) => unknown,
): TTool {
  if (typeof tool.execute !== "function") {
    return tool;
  }

  const execute = tool.execute;

  return {
    ...tool,
    execute: async (input, context) =>
      wrapResult(await execute(input, context)),
  } as TTool;
}

function extractLangfuseDocsSources(result: unknown) {
  const parsedResult = InkeepChoiceResultSchema.safeParse(result);

  if (!parsedResult.success) {
    return [];
  }

  const inkeepChoiceSources = parsedResult.data._meta.choices.flatMap(
    (choice) => {
      const parsedContent = parseJsonString(choice.message.content);
      const parsedSource =
        InkeepChoiceContentSourceSchema.safeParse(parsedContent);

      if (!parsedSource.success || !parsedSource.data) {
        return [];
      }

      return [parsedSource.data];
    },
  );

  return deduplicateBy(inkeepChoiceSources, (source) => source.url);
}

function parseJsonString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
