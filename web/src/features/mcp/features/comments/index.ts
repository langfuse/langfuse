import type { McpFeatureModule } from "../../server/registry";
import { commentTools } from "./tools";

export const commentsFeature: McpFeatureModule = {
  name: "comments",
  description: "Create and inspect public API comments",
  tools: commentTools,
};
