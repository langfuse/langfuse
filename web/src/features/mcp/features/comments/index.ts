import type { McpFeatureModule } from "../../server/registry";
import { createCommentTool, handleCreateComment } from "./tools/createComment";
import { getCommentTool, handleGetComment } from "./tools/getComment";
import { handleListComments, listCommentsTool } from "./tools/listComments";

export const commentsFeature: McpFeatureModule = {
  name: "comments",
  description: "Create and inspect comments",
  tools: [
    { definition: createCommentTool, handler: handleCreateComment },
    {
      definition: listCommentsTool,
      handler: handleListComments,
      allowInAppAgentKey: true,
    },
    {
      definition: getCommentTool,
      handler: handleGetComment,
      allowInAppAgentKey: true,
    },
  ],
};
