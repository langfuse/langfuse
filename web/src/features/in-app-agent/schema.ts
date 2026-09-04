import { z } from "zod";

import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

export const InAppAgentMessageFeedbackValueSchema = z.enum([
  "thumbs_up",
  "thumbs_down",
]);

export type InAppAgentMessageFeedbackValue = z.infer<
  typeof InAppAgentMessageFeedbackValueSchema
>;

export const InAppAgentMessageFeedbackSchema = z.object({
  value: InAppAgentMessageFeedbackValueSchema,
  comment: z.string().nullable(),
});

export type InAppAgentMessageFeedback = z.infer<
  typeof InAppAgentMessageFeedbackSchema
>;

export type InAppAgentUiMessage = AgUiMessage & {
  feedback?: InAppAgentMessageFeedback;
};

const AbsoluteHttpUrlSchema = z.string().transform((value, ctx) => {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "URL must be absolute" });
    return z.NEVER;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    ctx.addIssue({
      code: "custom",
      message: "URL protocol must be http or https",
    });
    return z.NEVER;
  }

  return parsedUrl.href;
});

export const InAppAgentMessageSourceSchema = z.object({
  title: z.string(),
  url: AbsoluteHttpUrlSchema,
  faviconUrl: AbsoluteHttpUrlSchema,
});

export type InAppAgentMessageSource = z.infer<
  typeof InAppAgentMessageSourceSchema
>;
