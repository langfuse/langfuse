import type { McpFeatureModule } from "../../server/registry";
import {
  createAnnotationQueueAssignmentTool,
  createAnnotationQueueItemTool,
  createAnnotationQueueTool,
  deleteAnnotationQueueAssignmentTool,
  deleteAnnotationQueueItemTool,
  getAnnotationQueueItemTool,
  getAnnotationQueueTool,
  handleCreateAnnotationQueue,
  handleCreateAnnotationQueueAssignment,
  handleCreateAnnotationQueueItem,
  handleDeleteAnnotationQueueAssignment,
  handleDeleteAnnotationQueueItem,
  handleGetAnnotationQueue,
  handleGetAnnotationQueueItem,
  handleListAnnotationQueueItems,
  handleListAnnotationQueues,
  handleUpdateAnnotationQueueItem,
  listAnnotationQueueItemsTool,
  listAnnotationQueuesTool,
  updateAnnotationQueueItemTool,
} from "./tools";

export const annotationQueuesFeature: McpFeatureModule = {
  name: "annotationQueues",
  description: "Manage annotation queues, queue items, and assignments",
  tools: [
    {
      definition: listAnnotationQueuesTool,
      handler: handleListAnnotationQueues,
      allowInAppAgentKey: true,
    },
    {
      definition: createAnnotationQueueTool,
      handler: handleCreateAnnotationQueue,
    },
    {
      definition: getAnnotationQueueTool,
      handler: handleGetAnnotationQueue,
      allowInAppAgentKey: true,
    },
    {
      definition: listAnnotationQueueItemsTool,
      handler: handleListAnnotationQueueItems,
      allowInAppAgentKey: true,
    },
    {
      definition: getAnnotationQueueItemTool,
      handler: handleGetAnnotationQueueItem,
      allowInAppAgentKey: true,
    },
    {
      definition: createAnnotationQueueItemTool,
      handler: handleCreateAnnotationQueueItem,
    },
    {
      definition: updateAnnotationQueueItemTool,
      handler: handleUpdateAnnotationQueueItem,
    },
    {
      definition: deleteAnnotationQueueItemTool,
      handler: handleDeleteAnnotationQueueItem,
    },
    {
      definition: createAnnotationQueueAssignmentTool,
      handler: handleCreateAnnotationQueueAssignment,
    },
    {
      definition: deleteAnnotationQueueAssignmentTool,
      handler: handleDeleteAnnotationQueueAssignment,
    },
  ],
};
