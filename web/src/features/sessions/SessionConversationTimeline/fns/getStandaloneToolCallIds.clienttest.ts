// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getStandaloneToolCallIds } from "@/src/features/sessions/SessionConversationTimeline/fns/getStandaloneToolCallIds";

describe("getStandaloneToolCallIds", () => {
  it("reads supported ids from non-truncated tool metadata", () => {
    expect(
      getStandaloneToolCallIds([
        {
          type: "TOOL",
          metadata: { toolCallId: "tool-call-id" },
          metadataTruncated: false,
        },
        {
          type: "TOOL",
          metadata: JSON.stringify({ callID: "call-id" }),
          metadataTruncated: false,
        },
        {
          type: "GENERATION",
          metadata: { toolCallId: "generation-id" },
          metadataTruncated: false,
        },
        {
          type: "TOOL",
          metadata: { toolCallId: "truncated-id" },
          metadataTruncated: true,
        },
        {
          type: "TOOL",
          metadata: "invalid JSON",
          metadataTruncated: false,
        },
      ]),
    ).toEqual(new Set(["tool-call-id", "call-id"]));
  });
});
