import { z } from "zod";

// maxChars 0 keeps the label (e.g. tool name) and drops the content.
const block = (include: boolean, maxChars: number) =>
  z
    .object({
      include: z.boolean().default(include),
      maxChars: z.number().int().min(0).default(maxChars),
    })
    .prefault({});

export const transcriptRenderConfigSchema = z.object({
  system: block(true, 600),
  user: block(true, 1500),
  assistant: block(true, 1000),
  reasoning: block(false, 600),
  toolCalls: block(true, 300),
  toolResults: block(true, 400),
  toolDefinitions: block(false, 120),
  errors: block(true, 300),
  runIO: block(true, 10000),
  observations: block(true, 120),
  history: z.enum(["include", "omit"]).default("include"),
  collapseWhitespace: z.boolean().default(true),
  headRatio: z.number().min(0).max(1).default(0.6),
  maxTokens: z.number().int().positive().nullable().default(6000),
});

export type TranscriptRenderConfig = z.input<
  typeof transcriptRenderConfigSchema
>;

// The inclusive one-call Topics layout keeps each block's existing cap but
// measures the full transcript before choosing a total token budget.
export const topicsTranscriptConfig = {
  system: { maxChars: 600 },
  user: { maxChars: 2000 },
  assistant: { maxChars: 1500 },
  reasoning: { include: true, maxChars: 600 },
  toolCalls: { maxChars: 400 },
  toolResults: { maxChars: 500 },
  toolDefinitions: { include: true, maxChars: 120 },
  errors: { maxChars: 500 },
  runIO: { maxChars: 10000 },
  observations: { maxChars: 120 },
  maxTokens: null,
} satisfies TranscriptRenderConfig;
