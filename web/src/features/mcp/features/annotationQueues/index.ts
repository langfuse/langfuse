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

export const annotationQueuesFeature = {
  name: "annotationQueues",
  description:
    "Manage annotation queues, worklists of trace or observation items for human review and scoring, plus user assignments",
  tools: [
    {
      definition: listAnnotationQueuesTool,
      handler: handleListAnnotationQueues,
    },
    {
      definition: createAnnotationQueueTool,
      handler: handleCreateAnnotationQueue,
    },
    {
      definition: getAnnotationQueueTool,
      handler: handleGetAnnotationQueue,
    },
    {
      definition: listAnnotationQueueItemsTool,
      handler: handleListAnnotationQueueItems,
    },
    {
      definition: getAnnotationQueueItemTool,
      handler: handleGetAnnotationQueueItem,
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
} as const satisfies McpFeatureModule;
