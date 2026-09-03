import { describe, expect, it } from "vitest";
import { createEvent, createObservation } from "./tracing-factory";

describe("tracing factories DateTime64 nulls", () => {
  it("keeps explicit null end and completion times on observations", () => {
    const observation = createObservation({
      end_time: null,
      completion_start_time: null,
    });

    expect(observation.end_time).toBeNull();
    expect(observation.completion_start_time).toBeNull();
  });

  it("keeps explicit null end and completion times on events", () => {
    const event = createEvent({
      end_time: null,
      completion_start_time: null,
    });

    expect(event.end_time).toBeNull();
    expect(event.completion_start_time).toBeNull();
  });

  it("stringifies millisecond and microsecond event ticks to the same instant", () => {
    const millisecond = Date.UTC(2024, 0, 15, 12, 0, 0);

    expect(createEvent({ start_time: millisecond }).start_time).toBe(
      "2024-01-15 12:00:00.000",
    );
    expect(createEvent({ start_time: millisecond * 1000 }).start_time).toBe(
      "2024-01-15 12:00:00.000",
    );
  });
});
