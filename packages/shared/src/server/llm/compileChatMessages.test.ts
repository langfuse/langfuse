import { describe, expect, it } from "vitest";

import {
  compileChatMessages,
  compileChatMessagesWithIds,
} from "./compileChatMessages";
import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessageWithId,
} from "./types";

describe("compileChatMessages variable substitution", () => {
  it("substitutes variables in plain-string content (unchanged behaviour)", () => {
    const [compiled] = compileChatMessages(
      [{ role: ChatMessageRole.User, content: "Hello {{name}}" }],
      {},
      { name: "World" },
    );
    expect(compiled.content).toBe("Hello World");
  });

  it("substitutes variables inside text parts of multimodal content", () => {
    const messages: ChatMessageWithId[] = [
      {
        id: "1",
        type: ChatMessageType.User,
        role: ChatMessageRole.User,
        content: [
          { type: "text", text: "Describe {{subject}}" },
          {
            type: "media",
            mediaId: "m1",
            mimeType: "image/png",
            reference: "@@@langfuseMedia:type=image/png|id=m1|source=base64@@@",
          },
        ],
      },
    ];

    const [compiled] = compileChatMessagesWithIds(
      messages,
      {},
      {
        subject: "this image",
      },
    );

    expect(compiled.content).toEqual([
      { type: "text", text: "Describe this image" },
      {
        type: "media",
        mediaId: "m1",
        mimeType: "image/png",
        reference: "@@@langfuseMedia:type=image/png|id=m1|source=base64@@@",
      },
    ]);
  });
});
