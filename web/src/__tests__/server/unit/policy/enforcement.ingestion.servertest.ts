import { describe, expect, it } from "vitest";

import { eventTypes } from "@langfuse/shared/src/server";

import {
  __test,
  authorizeIngestionEvent,
  ingestionActionForEventType,
} from "@/src/features/auth/policy/enforcement.ingestion";
import {
  type AuthorizationContext,
  type Policy,
} from "@/src/features/auth/policy/types";

const { isIngestionSuspended } = __test;

const PROJECT = "prj_1";

const projectContext = (actions: string[]): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    organizations: [],
    boundResource: { projectId: PROJECT },
  },
  policies: [
    {
      kind: "project",
      effect: "allow",
      source: { kind: "role", id: "role_1" },
      actions: actions as Policy["actions"],
      resources: [PROJECT],
    } as Policy,
  ],
});

const suspendedContext = (suspended: boolean): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    organizations: [
      {
        orgId: "org_1",
        plan: "cloud:hobby",
        rateLimitConfig: [],
        projectIds: [PROJECT],
        isIngestionSuspended: suspended,
      },
    ],
    boundResource: { projectId: PROJECT },
  },
  policies: [],
});

describe("ingestionActionForEventType", () => {
  it("maps sdk logs to no action", () => {
    expect(ingestionActionForEventType(eventTypes.SDK_LOG)).toBeNull();
  });
  it("maps score creation to scores:create", () => {
    expect(ingestionActionForEventType(eventTypes.SCORE_CREATE)).toBe(
      "scores:create",
    );
  });
  it("maps every other event to traces:create", () => {
    expect(ingestionActionForEventType(eventTypes.TRACE_CREATE)).toBe(
      "traces:create",
    );
    expect(ingestionActionForEventType(eventTypes.GENERATION_CREATE)).toBe(
      "traces:create",
    );
  });
});

describe("authorizeIngestionEvent", () => {
  it("allows sdk logs regardless of scope", () => {
    const context = projectContext([]);
    expect(
      authorizeIngestionEvent(context, eventTypes.SDK_LOG, PROJECT).success,
    ).toBe(true);
  });

  it("allows a scores-only key to write scores but not traces", () => {
    const context = projectContext(["scores:create"]);
    expect(
      authorizeIngestionEvent(context, eventTypes.SCORE_CREATE, PROJECT)
        .success,
    ).toBe(true);
    expect(
      authorizeIngestionEvent(context, eventTypes.TRACE_CREATE, PROJECT)
        .success,
    ).toBe(false);
  });

  it("allows a project key to write both traces and scores", () => {
    const context = projectContext(["scores:create", "traces:create"]);
    expect(
      authorizeIngestionEvent(context, eventTypes.TRACE_CREATE, PROJECT)
        .success,
    ).toBe(true);
    expect(
      authorizeIngestionEvent(context, eventTypes.SCORE_CREATE, PROJECT)
        .success,
    ).toBe(true);
  });
});

describe("isIngestionSuspended", () => {
  it("is true when the owning org is suspended", () => {
    expect(isIngestionSuspended(suspendedContext(true), PROJECT)).toBe(true);
  });
  it("is false when the owning org is not suspended", () => {
    expect(isIngestionSuspended(suspendedContext(false), PROJECT)).toBe(false);
  });
  it("is false for the admin principal with no organizations", () => {
    const admin: AuthorizationContext = {
      principal: { kind: "admin", userId: null },
      policies: [],
    };
    expect(isIngestionSuspended(admin, PROJECT)).toBe(false);
  });
});
