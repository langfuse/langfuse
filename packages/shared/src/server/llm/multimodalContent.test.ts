import { describe, expect, it } from "vitest";

import {
  addMediaPart,
  buildMediaReferenceString,
  type ChatMessageMediaContentPart,
  ChatMessageRole,
  ChatMessageType,
  ChatMessageSchema,
  getMediaParts,
  getMessageText,
  hasMediaParts,
  removeMediaPart,
  setMessageText,
  UserMessageSchema,
} from "./types";
import { buildHumanMessageContent } from "./fetchLLMCompletion";

const mediaPart = (mediaId: string): ChatMessageMediaContentPart => ({
  type: "media",
  mediaId,
  mimeType: "image/png",
  reference: buildMediaReferenceString({ mediaId, mimeType: "image/png" }),
});

describe("multimodal content helpers", () => {
  it("treats plain strings as text-only", () => {
    expect(getMessageText("hello")).toBe("hello");
    expect(hasMediaParts("hello")).toBe(false);
    expect(getMediaParts("hello")).toEqual([]);
    // setMessageText keeps string content a string (text-only stays untouched)
    expect(setMessageText("hello", "world")).toBe("world");
  });

  it("extracts and edits text while preserving media parts", () => {
    const content = addMediaPart("before", mediaPart("m1"));

    expect(getMessageText(content)).toBe("before");
    expect(hasMediaParts(content)).toBe(true);

    const edited = setMessageText(content, "after");
    expect(getMessageText(edited)).toBe("after");
    expect(getMediaParts(edited).map((p) => p.mediaId)).toEqual(["m1"]);
  });

  it("collapses back to a plain string when the last media is removed", () => {
    const withMedia = addMediaPart("caption", mediaPart("m1"));
    const removed = removeMediaPart(withMedia, "m1");
    expect(removed).toBe("caption");
    expect(typeof removed).toBe("string");
  });

  it("keeps array form while other media remain", () => {
    let content = addMediaPart("caption", mediaPart("m1"));
    content = addMediaPart(content, mediaPart("m2"));
    const removed = removeMediaPart(content, "m1");
    expect(Array.isArray(removed)).toBe(true);
    expect(getMediaParts(removed).map((p) => p.mediaId)).toEqual(["m2"]);
  });

  it("builds the canonical media reference token", () => {
    expect(
      buildMediaReferenceString({ mediaId: "abc", mimeType: "image/png" }),
    ).toBe("@@@langfuseMedia:type=image/png|id=abc|source=base64@@@");
  });
});

describe("ChatMessage schema with multimodal user content", () => {
  it("accepts a plain-string user message (unchanged behaviour)", () => {
    const parsed = UserMessageSchema.parse({
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: "just text",
    });
    expect(parsed.content).toBe("just text");
  });

  it("accepts structured user content with text + media parts", () => {
    const parsed = ChatMessageSchema.parse({
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: [{ type: "text", text: "describe this" }, mediaPart("m1")],
    });
    expect(Array.isArray(parsed.content)).toBe(true);
    expect(getMediaParts(parsed.content).length).toBe(1);
  });
});

describe("buildHumanMessageContent (conversion boundary)", () => {
  it("passes plain strings through unchanged", () => {
    expect(buildHumanMessageContent("hello")).toBe("hello");
  });

  it("builds a base64 image block alongside text", () => {
    const blocks = buildHumanMessageContent([
      { type: "text", text: "what is this?" },
      { ...mediaPart("m1"), data: "QUJD" },
    ]);
    expect(blocks).toEqual([
      { type: "text", text: "what is this?" },
      {
        type: "image",
        source_type: "base64",
        mime_type: "image/png",
        data: "QUJD",
      },
    ]);
  });

  it("drops empty text spans so image-only messages survive filtering", () => {
    const blocks = buildHumanMessageContent([
      { type: "text", text: "" },
      { ...mediaPart("m1"), data: "QUJD" },
    ]);
    expect(blocks).toEqual([
      {
        type: "image",
        source_type: "base64",
        mime_type: "image/png",
        data: "QUJD",
      },
    ]);
  });

  it("throws when a media part was not resolved", () => {
    expect(() =>
      buildHumanMessageContent([{ type: "text", text: "x" }, mediaPart("m1")]),
    ).toThrow(/was not resolved/);
  });

  it("rejects non-image media for now", () => {
    expect(() =>
      buildHumanMessageContent([
        {
          type: "media",
          mediaId: "a1",
          mimeType: "audio/mpeg",
          reference: buildMediaReferenceString({
            mediaId: "a1",
            mimeType: "audio/mpeg",
          }),
          data: "QUJD",
        },
      ]),
    ).toThrow(/Unsupported media type/);
  });
});
