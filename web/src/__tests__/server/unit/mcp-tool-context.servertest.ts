import { describe, expect, it } from "vitest";
import { ProtocolErrorCode } from "@modelcontextprotocol/server";

import {
  resolveToolContext,
  splitProjectId,
} from "@/src/features/mcp/server/toolContext";
import {
  mockAuthContext,
  mockConnection,
} from "@/src/__tests__/server/mcp-auth-fixtures";

const projectKey = mockConnection(
  mockAuthContext({
    orgId: "org_1",
    projectId: "prj_1",
    actions: ["prompts:read"],
    organizations: [{ orgId: "org_1", projectIds: ["prj_1", "prj_2"] }],
  }),
);

const orgKey = mockConnection(
  mockAuthContext({
    orgId: "org_1",
    actions: ["prompts:read"],
    organizations: [{ orgId: "org_1", projectIds: ["prj_1", "prj_2"] }],
  }),
);

const permissionDenied = (action: string) =>
  expect.objectContaining({
    code: ProtocolErrorCode.InvalidRequest,
    message: expect.stringContaining(
      `Access denied. The "${action}" permission is required to access this resource.`,
    ),
  }) as Error;

const projectNotFound = expect.objectContaining({
  code: ProtocolErrorCode.InvalidRequest,
  message: expect.stringContaining(
    "Project not found or this API key has no access to it.",
  ),
}) as Error;

describe("resolveToolContext", () => {
  it("runs a project key's call in its bound project by default", () => {
    expect(resolveToolContext(projectKey, "prompts:read", undefined)).toEqual(
      expect.objectContaining({
        projectId: "prj_1",
        orgId: "org_1",
        accessLevel: "project",
        plan: "cloud:hobby",
        auth: projectKey.auth,
      }),
    );
  });

  it("denies a project key's call in another project of its organization", () => {
    expect(() =>
      resolveToolContext(projectKey, "prompts:read", "prj_2"),
    ).toThrow(permissionDenied("prompts:read"));
  });

  it("denies an action the key does not hold", () => {
    expect(() =>
      resolveToolContext(projectKey, "prompts:CUD", undefined),
    ).toThrow(permissionDenied("prompts:CUD"));
  });

  it("runs an organization key's call in the project it names", () => {
    expect(resolveToolContext(orgKey, "prompts:read", "prj_2")).toEqual(
      expect.objectContaining({ projectId: "prj_2", orgId: "org_1" }),
    );
  });

  it("asks an organization key's call for a project when it names none", () => {
    expect(() => resolveToolContext(orgKey, "prompts:read", undefined)).toThrow(
      expect.objectContaining({
        code: ProtocolErrorCode.InvalidParams,
        message: expect.stringContaining("Pass `projectId`"),
      }) as Error,
    );
  });

  it("denies a project of another organization despite the project/* policy", () => {
    expect(() =>
      resolveToolContext(orgKey, "prompts:read", "prj_other_org"),
    ).toThrow(projectNotFound);
  });

  it("denies the wildcard project id", () => {
    expect(() => resolveToolContext(orgKey, "prompts:read", "*")).toThrow(
      projectNotFound,
    );
  });
});

describe("splitProjectId", () => {
  it("separates projectId from the tool's input", () => {
    expect(splitProjectId({ projectId: "prj_2", name: "a" })).toEqual({
      projectId: "prj_2",
      input: { name: "a" },
    });
  });

  it("leaves input without projectId untouched", () => {
    const args = { name: "a" };
    expect(splitProjectId(args)).toEqual({ projectId: undefined, input: args });
    expect(splitProjectId(undefined)).toEqual({
      projectId: undefined,
      input: undefined,
    });
  });

  it.each([1, "", null])("rejects projectId %j", (projectId) => {
    expect(() => splitProjectId({ projectId })).toThrow(
      expect.objectContaining({
        code: ProtocolErrorCode.InvalidParams,
      }) as Error,
    );
  });
});
