import type { McpFeatureModule } from "../../server/registry";
import { createCommentTool, handleCreateComment } from "./tools/createComment";
import { getCommentTool, handleGetComment } from "./tools/getComment";
import { handleListComments, listCommentsTool } from "./tools/listComments";

export const commentsFeature = {
  name: "comments",
  description: "Create and inspect comments",
  tools: [
    { definition: createCommentTool, handler: handleCreateComment },
    {
      definition: listCommentsTool,
      handler: handleListComments,
    },
    {
      definition: getCommentTool,
      handler: handleGetComment,
    },
  ],
} as const satisfies McpFeatureModule;
