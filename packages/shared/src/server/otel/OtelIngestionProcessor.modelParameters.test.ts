import { describe, expect, it } from "vitest";

import {
  createModelParametersBatch,
  modelParametersFixtures,
} from "./OtelIngestionProcessor.modelParameters.fixtures";
import { OtelIngestionProcessor } from "./OtelIngestionProcessor";

describe("OtelIngestionProcessor model parameters", () => {
  it.each(modelParametersFixtures)("$name", (fixture) => {
    const events = new OtelIngestionProcessor({
      projectId: "project-1",
      publicKey: "pk-test",
      sdkName: fixture.sdkName,
      sdkVersion: fixture.sdkVersion,
    }).processToEvent(createModelParametersBatch(fixture));

    expect(events).toHaveLength(1);
    if (fixture.exactExpectedModelParameters) {
      expect(events[0].modelParameters).toEqual(
        fixture.expectedModelParameters,
      );
    } else {
      expect(events[0].modelParameters).toMatchObject(
        fixture.expectedModelParameters,
      );
    }
  });
});
