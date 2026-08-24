import { describe, expect, it } from "vitest";

import { buildCommentPreview } from "../features/notifications/commentMentionHandler";

describe("buildCommentPreview", () => {
  it("strips mention markdown for a regular display name", () => {
    expect(
      buildCommentPreview("Hey @[Alice](user:alice123), please review"),
    ).toBe("Hey @Alice, please review");
  });

  it("strips mention markdown for display names containing brackets", () => {
    const content =
      "Thanks @[John Doe[ Platform Team ]](user:cmr9klx3v0005434tzy5d86dq)!";
    expect(buildCommentPreview(content)).toBe(
      "Thanks @John Doe[ Platform Team ]!",
    );
  });

  it("does not merge a malformed mention with a later valid one", () => {
    // The capture must not span the "](user:" delimiter of another mention,
    // which would swallow the text between the two tokens
    const content = "@[A](user:bad!id) keep me @[Bob](user:bob456)";
    expect(buildCommentPreview(content)).toBe("@A keep me @Bob");
  });

  it("truncates long content to 500 characters with an ellipsis", () => {
    const content = "a".repeat(600);
    const result = buildCommentPreview(content);

    expect(result).toHaveLength(500);
    expect(result.endsWith("...")).toBe(true);
  });

  it("leaves content without mentions untouched", () => {
    expect(buildCommentPreview("Just a plain comment")).toBe(
      "Just a plain comment",
    );
  });
});
