import type { McpFeatureModule } from "../../server/registry";
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
} as const satisfies McpFeatureModule;
