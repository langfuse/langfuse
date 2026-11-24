import { describe, expect, it } from "vitest";

import { formatGuardrailAssignments } from "@/src/features/ai-gateway/fns/formatGuardrailAssignments";

describe("formatGuardrailAssignments", () => {
  it("formats Everyone, single target, multiple targets, redacted targets, and empty", () => {
    expect(
      formatGuardrailAssignments([
        { scope: "ORGANIZATION", label: "Everyone" },
      ]),
    ).toEqual({ primary: "Everyone" });

    expect(
      formatGuardrailAssignments([
        { scope: "API_KEY", label: "support-bot-prod" },
      ]),
    ).toEqual({ primary: "support-bot-prod" });

    expect(
      formatGuardrailAssignments([{ scope: "USER", label: null }]),
    ).toEqual({ primary: "1 target" });

    expect(
      formatGuardrailAssignments([
        { scope: "API_KEY", label: "support-bot-prod" },
        { scope: "USER", label: "Jonas Weber" },
      ]),
    ).toEqual({
      primary: "2 targets",
      secondary: "support-bot-prod, Jonas Weber",
    });

    expect(
      formatGuardrailAssignments([
        { scope: "API_KEY", label: null },
        { scope: "USER", label: null },
      ]),
    ).toEqual({
      primary: "2 targets",
    });

    expect(
      formatGuardrailAssignments([
        { scope: "API_KEY", label: "key-1" },
        { scope: "USER", label: "Alice" },
        { scope: "USER", label: "Bob" },
      ]),
    ).toEqual({
      primary: "3 targets",
      secondary: "key-1, Alice +1 more",
    });

    expect(formatGuardrailAssignments([])).toEqual({
      primary: "Not running",
      muted: true,
    });
  });
});
