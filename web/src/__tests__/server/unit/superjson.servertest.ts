import superjson from "superjson";
import { setUpSuperjson } from "@/src/utils/superjson";

const own = (record: Record<string, string>, key: string, value: string) => {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
};

describe("setUpSuperjson", () => {
  it("round-trips tool definition keys that superjson otherwise rejects", () => {
    setUpSuperjson();

    const toolDefinitions: Record<string, string> = {};
    own(toolDefinitions, "__proto__", '{"description":"","parameters":""}');
    own(toolDefinitions, "constructor", '{"description":"c","parameters":""}');
    own(toolDefinitions, "prototype", '{"description":"p","parameters":""}');
    own(
      toolDefinitions,
      "weather",
      '{"description":"forecast","parameters":""}',
    );

    const startTime = new Date("2020-01-01T00:00:00.000Z");
    const restored = superjson.deserialize<{
      startTime: Date;
      toolDefinitions: Record<string, string>;
    }>(
      superjson.serialize({
        startTime,
        toolDefinitions,
      }),
    );

    expect(restored.startTime).toEqual(startTime);
    expect(Object.keys(restored.toolDefinitions).sort()).toEqual([
      "__proto__",
      "constructor",
      "prototype",
      "weather",
    ]);
    expect(restored.toolDefinitions["__proto__"]).toBe(
      '{"description":"","parameters":""}',
    );
    expect(restored.toolDefinitions.weather).toBe(
      '{"description":"forecast","parameters":""}',
    );
    expect(Object.prototype).not.toHaveProperty("weather");
  });
});
