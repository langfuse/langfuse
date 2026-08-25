/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). defineTool with a required per-tool `action`, asserted before
 * argument validation. The compile-break for undeclared tools is proven in the
 * in-source tests. Run: `pnpm --filter web run test:in-source define-tool.prototype`.
 */

import { type IncomingHttpHeaders } from "http";

import { z } from "zod";

import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { type AuthHeaderVerificationResult } from "@langfuse/shared/src/server";
import {
  authorize,
  type Decision,
  type ProjectAction,
} from "@/src/features/auth/policy/policy.prototype";
import { enforceProjectAuth } from "@/src/features/auth/policy/enforcement.projects.prototype";
import { authzMigrationMode } from "@/src/features/auth/policy/enforcement.organizations.prototype";
import {
  newVerdict,
  recordParity,
  verdictFromStatus,
  type NewResult,
  type ParitySink,
} from "@/src/features/auth/policy/parity.prototype";
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

/** assertToolAccess fails closed: no context means 401, an ungranted action means 403; in shadow it only observes, since legacy ran no per-tool gate. */
function assertToolAccess(action: ProjectAction, context: ServerContext): void {
  if (!context.authz)
    throw new UnauthorizedError("No authorization context on MCP request");
  const decision = authorize(context.authz, action, {
    projectId: context.projectId,
  });
  if (authzMigrationMode === "shadow") {
    recordMcpToolParity(action, decision);
    return;
  }
  if (!decision.success) throw decision.error;
}

/** authorizeMcpConnection is the MCP connection chokepoint's shadow-and-enforce method: one legacy verify, the new `mcp:access` check beside it, connection parity emitted from both. It swaps in for the route's inline verify. */
export async function authorizeMcpConnection(params: {
  headers: IncomingHttpHeaders;
  verify: () => Promise<AuthHeaderVerificationResult>;
  mode?: "shadow" | "enforce";
  sink?: ParitySink;
}): Promise<{
  authCheck: AuthHeaderVerificationResult;
  enforced: Awaited<ReturnType<typeof enforceProjectAuth>>;
}> {
  const { headers, verify, mode = authzMigrationMode, sink } = params;
  const authCheck = await verify();
  const enforced = await enforceProjectAuth({ headers, action: "mcp:access" });
  if (mode === "shadow") recordMcpConnectionParity(authCheck, enforced, sink);
  return { authCheck, enforced };
}

/** recordMcpConnectionParity emits the connection parity: legacy required a project-scoped key, the new path asserts `mcp:access` (with the `mcp_suspended` deny). */
export function recordMcpConnectionParity(
  authCheck: AuthHeaderVerificationResult,
  enforced: NewResult,
  sink?: ParitySink,
): void {
  const legacyCode = !authCheck.validKey
    ? 401
    : authCheck.scope.accessLevel === "project" && authCheck.scope.projectId
      ? 200
      : 403;
  const neu = newVerdict(enforced);
  recordParity(
    {
      seam: "mcp_access",
      action: "mcp:access",
      legacy: verdictFromStatus(legacyCode),
      neu: neu.verdict,
      legacyCode,
      newCode: neu.code,
    },
    sink,
  );
}

/** recordMcpToolParity emits the per-tool parity: legacy is always `absent` (zero legacy per-tool auth), so the new decision lands as net-new enforcement. */
export function recordMcpToolParity(
  action: ProjectAction,
  decision: Decision,
  sink?: ParitySink,
): void {
  // OPEN QUESTION: a tool call runs in ServerContext, not a request — there is
  // no http.server span to stamp, so LFE-15034's span-forensic half has no home
  // here; only the counter lands. Does MCP need its own per-tool span?
  recordParity(
    {
      seam: "mcp_tool",
      action,
      legacy: "absent",
      neu: decision.success ? "allow" : "deny",
      legacyCode: 0,
      newCode: decision.success ? 200 : 403,
    },
    sink,
  );
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

  const capture = () => {
    const calls: Record<string, string | number>[] = [];
    const sink: ParitySink = {
      increment: (_stat, tags) => calls.push(tags),
      span: () => undefined,
    };
    return { calls, sink };
  };

  describe("recordMcpConnectionParity", () => {
    const projectCheck = {
      validKey: true,
      scope: { accessLevel: "project", projectId: "prj_1" },
    } as AuthHeaderVerificationResult;

    it("project key, new grants mcp:access → match", () => {
      const { calls, sink } = capture();
      recordMcpConnectionParity(projectCheck, { success: true }, sink);
      expect(calls[0]).toMatchObject({ seam: "mcp_access", result: "match" });
    });
    it("project key, new denies (suspension) → new_denies", () => {
      const { calls, sink } = capture();
      recordMcpConnectionParity(
        projectCheck,
        { success: false, error: new ForbiddenError() },
        sink,
      );
      expect(calls[0]).toMatchObject({ seam: "mcp_access", result: "new_denies" });
    });
  });

  describe("recordMcpToolParity", () => {
    it.each([
      ["new allows a tool", { success: true } as Decision],
      ["new denies a tool", { success: false, error: new ForbiddenError() } as Decision],
    ] as const)("%s → net_new, legacy never gated tools", (_name, decision) => {
      const { calls, sink } = capture();
      recordMcpToolParity("prompts:read", decision, sink);
      expect(calls[0]).toMatchObject({ seam: "mcp_tool", result: "net_new" });
    });
  });
}
