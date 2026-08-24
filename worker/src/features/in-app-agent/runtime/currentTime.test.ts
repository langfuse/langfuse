import { describe, expect, it } from "vitest";

import { CurrentTimeProcessor, formatCurrentTimeContext } from "./currentTime";

describe("CurrentTimeProcessor", () => {
  it("appends a trailing clock with date, hour, and minute in the user timezone", () => {
    const processor = new CurrentTimeProcessor(
      "Europe/London",
      () => new Date("2026-08-24T07:53:00.000Z"),
    );

    expect(
      processor.processLLMRequest({
        prompt: [{ role: "user", content: "hello" }],
      } as Parameters<CurrentTimeProcessor["processLLMRequest"]>[0]),
    ).toEqual({
      prompt: [
        { role: "user", content: "hello" },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: '<current_time tz="Europe/London">2026-08-24 08:53</current_time>',
            },
          ],
        },
      ],
    });
  });

  it("does not append a second clock when the prompt already ends with one", () => {
    const clock = formatCurrentTimeContext(
      new Date("2026-08-24T07:53:00.000Z"),
      "UTC",
    );
    const prompt = [
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: clock }],
      },
    ];
    const processor = new CurrentTimeProcessor("UTC");

    expect(
      processor.processLLMRequest({
        prompt,
      } as Parameters<CurrentTimeProcessor["processLLMRequest"]>[0]),
    ).toBeUndefined();
  });
});
