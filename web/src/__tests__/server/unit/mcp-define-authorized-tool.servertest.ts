import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ForbiddenError } from "@langfuse/shared";

const { mockAssert } = vi.hoisted(() => ({ mockAssert: vi.fn() }));

vi.mock("@/src/features/auth/policy/mcp", () => ({
  assertMcpToolAccess: mockAssert,
}));

import { defineAuthorizedTool } from "@/src/features/mcp/core/define-authorized-tool";
import { type ServerContext } from "@/src/features/mcp/types";

const context = { projectId: "prj_1", authz: undefined } as ServerContext;

const schema = z.object({ id: z.string() });

const build = (handler = vi.fn(async (input) => input)) =>
  defineAuthorizedTool({
    name: "getThing",
    description: "Fetch a thing",
    baseSchema: schema,
    inputSchema: schema,
    action: "prompts:read",
    handler,
  });

describe("defineAuthorizedTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still produces a valid object tool definition", () => {
    const [definition] = build();
    expect(definition.name).toBe("getThing");
    expect(definition.inputSchema.type).toBe("object");
  });

  it("asserts the action before argument validation and before the handler", async () => {
    const handler = vi.fn(async (input) => input);
    const [, wrapped] = build(handler);

    await wrapped({ id: "abc" }, context);

    expect(mockAssert).toHaveBeenCalledWith({
      authz: undefined,
      projectId: "prj_1",
      action: "prompts:read",
      toolName: "getThing",
    });
    expect(handler).toHaveBeenCalled();
  });

  it("blocks fail-closed on invalid input without validating it", async () => {
    mockAssert.mockImplementation(() => {
      throw new ForbiddenError("nope");
    });
    const handler = vi.fn(async (input) => input);
    const [, wrapped] = build(handler);

    await expect(
      wrapped({ wrong: true } as unknown as { id: string }, context),
    ).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
