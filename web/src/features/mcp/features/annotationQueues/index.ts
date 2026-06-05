import type { McpFeatureModule } from "../../server/registry";
import {
  createAnnotationQueueAssignmentTool,
  handleCreateAnnotationQueueAssignment,
} from "./tools/createAnnotationQueueAssignment";
import {
  createAnnotationQueueItemTool,
  handleCreateAnnotationQueueItem,
} from "./tools/createAnnotationQueueItem";
import {
  createAnnotationQueueTool,
  handleCreateAnnotationQueue,
} from "./tools/createAnnotationQueue";
import {
  deleteAnnotationQueueAssignmentTool,
  handleDeleteAnnotationQueueAssignment,
} from "./tools/deleteAnnotationQueueAssignment";
import {
  deleteAnnotationQueueItemTool,
  handleDeleteAnnotationQueueItem,
} from "./tools/deleteAnnotationQueueItem";
import {
  getAnnotationQueueItemTool,
  handleGetAnnotationQueueItem,
} from "./tools/getAnnotationQueueItem";
import {
  getAnnotationQueueTool,
  handleGetAnnotationQueue,
} from "./tools/getAnnotationQueue";
import {
  handleListAnnotationQueueItems,
  listAnnotationQueueItemsTool,
} from "./tools/listAnnotationQueueItems";
import {
  handleListAnnotationQueues,
  listAnnotationQueuesTool,
} from "./tools/listAnnotationQueues";
import {
  handleUpdateAnnotationQueueItem,
  updateAnnotationQueueItemTool,
} from "./tools/updateAnnotationQueueItem";

export const annotationQueuesFeature: McpFeatureModule = {
  name: "annotationQueues",
  description:
    "Manage annotation queues, worklists of trace or observation items for human review and scoring, plus user assignments",
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
