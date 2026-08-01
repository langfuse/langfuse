import { resolveSampleObservation } from "./sampleObservationSelection";

const first = {
  id: "observation-1",
  traceId: "trace-1",
  name: "first",
  startTime: new Date("2026-07-31T10:00:00.000Z"),
};
const second = {
  id: "observation-2",
  traceId: "trace-2",
  name: "second",
  startTime: new Date("2026-07-31T09:00:00.000Z"),
};

describe("resolveSampleObservation", () => {
  it("uses the newest row until the user explicitly picks another sample", () => {
    expect(resolveSampleObservation([first, second], null)).toBe(first);
    expect(resolveSampleObservation([first, second], second)).toBe(second);
  });

  it("keeps an explicit pick when filtering removes it from the visible rows", () => {
    expect(resolveSampleObservation([first], second)).toBe(second);
  });
});
