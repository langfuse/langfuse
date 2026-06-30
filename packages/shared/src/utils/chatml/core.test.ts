import { describe, expect, it } from "vitest";
import {
  combineInputOutputMessages,
  mapOutputToChatMl,
  mapToChatMl,
} from "./core";

describe("combineInputOutputMessages", () => {
  it("renders output-only ChatML messages", () => {
    const output = { role: "assistant", content: "final answer" };
    const messages = combineInputOutputMessages(
      mapToChatMl(undefined),
      mapOutputToChatMl(output),
      output,
    );

    expect(messages).toMatchObject([
      { role: "assistant", content: "final answer" },
    ]);
  });

  it("does not turn arbitrary output-only text into chat", () => {
    expect(
      combineInputOutputMessages(
        mapToChatMl(undefined),
        mapOutputToChatMl("plain answer"),
        "plain answer",
      ),
    ).toEqual([]);
  });
});
