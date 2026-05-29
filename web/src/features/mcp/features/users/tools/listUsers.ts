import { listUsersForProject } from "@/src/features/users/server/userService";
import {
  paginationMetaResponseZod,
  publicApiPaginationZod,
} from "@langfuse/shared";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const ListUsersToolSchema = z.object({
  searchQuery: z.string().optional(),
  ...publicApiPaginationZod,
});

const ListUsersResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
    }),
  ),
  meta: paginationMetaResponseZod,
});

export const [listUsersTool, handleListUsers] = defineTool({
  name: "listUsers",
  description:
    "List users in the authenticated project, including user IDs required by tools such as createAnnotationQueueAssignment.",
  baseSchema: ListUsersToolSchema,
  inputSchema: ListUsersToolSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.users.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        const result = await listUsersForProject({
          projectId: context.projectId,
          orgId: context.orgId,
          searchQuery: input.searchQuery,
          page: input.page,
          limit: input.limit,
        });

        return ListUsersResponse.parse(result);
      },
    }),
  readOnlyHint: true,
});
