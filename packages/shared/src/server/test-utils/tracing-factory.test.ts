import { describe, expect, it } from "vitest";
import {
  createEvent,
  createObservation,
  createTraceScore,
} from "./tracing-factory";
import { BooleanData, CategoricalData, NumericData } from "../../domain/scores";

describe("trace score factory values", () => {
  it("inflates omitted boolean labels while preserving explicit score values", () => {
    for (const value of [0, 1]) {
      const score = createTraceScore({ data_type: "BOOLEAN", value });
      expect(
        BooleanData.parse({
          dataType: score.data_type,
          stringValue: score.string_value,
        }),
      ).toEqual({
        dataType: "BOOLEAN",
        stringValue: value === 1 ? "True" : "False",
      });
    }

    const numeric = createTraceScore({ value: 0 });
    expect(
      NumericData.parse({
        dataType: numeric.data_type,
        stringValue: numeric.string_value,
      }),
    ).toEqual({ dataType: "NUMERIC", stringValue: null });
    const categorical = createTraceScore({
      data_type: "CATEGORICAL",
      value: 0,
      string_value: "",
    });
    expect(
      CategoricalData.parse({
        dataType: categorical.data_type,
        stringValue: categorical.string_value,
      }),
    ).toEqual({ dataType: "CATEGORICAL", stringValue: "" });
    expect(
      createTraceScore({
        data_type: "BOOLEAN",
        value: 1,
        string_value: null,
      }).string_value,
    ).toBeNull();
  });
});

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
