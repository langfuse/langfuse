import type { McpFeatureModule } from "../../server/registry";
import { annotationQueueTools } from "./tools";

export const annotationQueuesFeature: McpFeatureModule = {
  name: "annotationQueues",
  description: "Manage annotation queues, queue items, and assignments",
  tools: annotationQueueTools,
};
