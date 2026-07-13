import { z } from "zod";

const McpToolResultEnvelopeSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    }),
  ),
  isError: z.boolean().optional(),
});

export function parseDashboardToolResultContent(content: string): unknown {
  const parsed = parseJson(content);
  const envelope = McpToolResultEnvelopeSchema.safeParse(parsed);

  if (!envelope.success || envelope.data.isError) {
    return envelope.success ? null : parsed;
  }

  for (const item of envelope.data.content) {
    const result = parseJson(item.text);
    if (result !== null) {
      return result;
    }
  }

  return null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
