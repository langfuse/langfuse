import { isProductFeedbackAvailable } from "@/src/features/feedback/server/FeedbackService";
import type { McpFeatureModule } from "../registry";
import {
  handleSubmitFeedback,
  submitFeedbackTool,
} from "./tools/submitFeedback";

export const feedbackFeature = {
  name: "feedback",
  description:
    "Submit feedback about Langfuse skills, MCP tools, CLI, docs, or API",
  tools: [
    {
      definition: submitFeedbackTool,
      handler: handleSubmitFeedback,
    },
  ],
  isEnabled: async () => isProductFeedbackAvailable(),
} as const satisfies McpFeatureModule;
