/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). defineTool with a required per-tool `action`, asserted before
 * argument validation. The compile-break for undeclared tools is proven in the
 * in-source tests. Run: `pnpm --filter web run test:in-source define-tool.prototype`.
 */

import { z } from "zod";

import { UnauthorizedError } from "@langfuse/shared";
import {
  authorize,
  type ProjectAction,
} from "@/src/features/auth/policy/policy.prototype";
import {
  defineTool,
  type DefineToolOptions,
  type ToolDefinition,
  type ToolHandler,
} from "./define-tool";
import type { ServerContext } from "../types";

/** AuthorizedDefineToolOptions is DefineToolOptions plus the required action every tool must declare. */
export interface AuthorizedDefineToolOptions<
  TInput,
  TName extends string = string,
> extends DefineToolOptions<TInput, TName> {
  /** action is asserted against the request's AuthorizationContext before argument validation. */
  action: ProjectAction;
}

/** defineAuthorizedTool wraps defineTool, asserting the declared action before the input schema parses; defineTool keeps owning validation and error formatting. */
export function defineAuthorizedTool<TInput, const TName extends string>(
  options: AuthorizedDefineToolOptions<TInput, TName>,
): [ToolDefinition<TName>, ToolHandler<TInput>] {
  const [toolDefinition, validatingHandler] = defineTool(options);
  const authorizedHandler: ToolHandler<TInput> = async (rawInput, context) => {
    assertToolAccess(options.action, context);
    return validatingHandler(rawInput, context);
  };
  return [toolDefinition, authorizedHandler];
}

/** assertToolAccess fails closed: no context means 401, an ungranted action means 403. */
function assertToolAccess(action: ProjectAction, context: ServerContext): void {
  if (!context.authz)
    throw new UnauthorizedError("No authorization context on MCP request");
  const decision = authorize(context.authz, action, {
    projectId: context.projectId,
  });
  if (!decision.success) throw decision.error;
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const baseSchema = z.object({ name: z.string() });

  const options = {
    name: "getPrompt",
    description: "Fetch a prompt by name",
    baseSchema,
    inputSchema: baseSchema,
    handler: async (input: { name: string }) => input.name,
  };

  describe("defineAuthorizedTool", () => {
    it("compile-breaks a tool that declares no action", () => {
      // @ts-expect-error action is required on every tool
      const undeclared = () => defineAuthorizedTool(options);
      // @ts-expect-error projects:create is an org action
      const orgAction = () => defineAuthorizedTool({ ...options, action: "projects:create" });
      void undeclared;
      void orgAction;
      const [toolDefinition] = defineAuthorizedTool({
        ...options,
        action: "prompts:read",
      });
      expect(toolDefinition.name).toBe("getPrompt");
    });
    it("401s a call without an authorization context before parsing", async () => {
      const [, handler] = defineAuthorizedTool({
        ...options,
        action: "prompts:read",
      });
      const invalidInput = { name: 42 } as unknown as { name: string };
      await expect(
        handler(invalidInput, { projectId: "prj_1" } as ServerContext),
      ).rejects.toThrow(UnauthorizedError);
    });
  });
}
