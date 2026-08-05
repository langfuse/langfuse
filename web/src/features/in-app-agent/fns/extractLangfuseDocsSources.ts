import { z } from "zod";
import {
  type InAppAgentMessageSource,
  InAppAgentMessageSourceSchema,
} from "@langfuse/shared/in-app-agent";
import { type InAppAgentToolCallContent } from "@/src/features/in-app-agent/types";
import { deduplicateBy } from "@/src/utils/arrays";
import { parseJsonString } from "@/src/features/in-app-agent/fns/parseJsonString";

const LangfuseDocsDocumentSchema = z.object({
  type: z.literal("document"),
  title: z.string().trim().optional(),
  url: z.string().trim().min(1),
});

const InkeepChoiceContentSourceSchema = z
  .object({
    content: z.array(z.unknown()),
  })
  .transform(({ content }): InAppAgentMessageSource[] => {
    return content.flatMap((entry) => {
      const parsedDocument = LangfuseDocsDocumentSchema.safeParse(entry);

      if (!parsedDocument.success) {
        return [];
      }

      let faviconUrl: string;

      try {
        faviconUrl = new URL(
          "/favicon.ico",
          parsedDocument.data.url,
        ).toString();
      } catch {
        return [];
      }

      const parsedSource = InAppAgentMessageSourceSchema.safeParse({
        title: parsedDocument.data.title || parsedDocument.data.url,
        url: parsedDocument.data.url,
        faviconUrl,
      });

      return parsedSource.success ? [parsedSource.data] : [];
    });
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

export function extractLangfuseDocsSources(
  tools: readonly InAppAgentToolCallContent[],
): InAppAgentMessageSource[] {
  return deduplicateBy(
    tools.flatMap((tool) => {
      if (!tool.name.startsWith("langfuseDocs_") || !tool.result) {
        return [];
      }

      return extractSourcesFromToolResult(tool.result);
    }),
    (source) => source.url,
  );
}

function extractSourcesFromToolResult(
  result: string,
): InAppAgentMessageSource[] {
  const parsed = parseJsonString(result);
  const parsedResult = InkeepChoiceResultSchema.safeParse(parsed);

  if (!parsedResult.success) {
    return [];
  }

  return parsedResult.data._meta.choices.flatMap((choice) => {
    const parsedContent = parseJsonString(choice.message.content);
    const parsedSource =
      InkeepChoiceContentSourceSchema.safeParse(parsedContent);

    if (!parsedSource.success) {
      return [];
    }

    return parsedSource.data;
  });
}
