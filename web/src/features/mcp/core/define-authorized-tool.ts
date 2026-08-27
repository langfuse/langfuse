import { assertMcpToolAccess } from "@/src/features/auth/policy/shadow.mcp";
import { type ProjectAction } from "@/src/features/auth/policy/types";
import {
  defineTool,
  type DefineToolOptions,
  type ToolDefinition,
  type ToolHandler,
} from "./define-tool";

/** defineAuthorizedTool defines an MCP tool that asserts its own action against the resolved context before argument validation, fail-closed. */
export function defineAuthorizedTool<TInput, const TName extends string>(
  options: DefineAuthorizedToolOptions<TInput, TName>,
): [ToolDefinition<TName>, ToolHandler<TInput>] {
  const { action, ...toolOptions } = options;
  return defineTool({
    ...toolOptions,
    preValidate: (context) =>
      assertMcpToolAccess({
        authz: context.authz,
        projectId: context.projectId,
        action,
        toolName: options.name,
      }),
  });
}

/** DefineAuthorizedToolOptions is a tool definition plus the project action the credential must hold to call it. */
export interface DefineAuthorizedToolOptions<
  TInput,
  TName extends string = string,
> extends Omit<DefineToolOptions<TInput, TName>, "preValidate"> {
  /** Project action the credential must hold to call this tool. */
  action: ProjectAction;
}
