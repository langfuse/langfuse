import { ScoreConfigNameSchema } from "@langfuse/shared";

const McpScoreConfigNameSchema = ScoreConfigNameSchema.describe(
  "Allowed characters: letters, numbers, spaces, underscores, periods, parentheses, and hyphens.",
);

export { McpScoreConfigNameSchema };
