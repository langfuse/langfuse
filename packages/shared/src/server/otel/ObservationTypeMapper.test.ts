import { describe, expect, it } from "vitest";

import { ObservationTypeMapperRegistry } from "./ObservationTypeMapper";
import { LangfuseOtelSpanAttributes } from "./attributes";

/**
 * The "PythonSDKv330Override" mapper (priority 0) exists to work around a bug
 * in Python SDK versions <= 3.3.0 (see
 * https://github.com/langfuse/langfuse/issues/8682): if a span reports type
 * "span" but carries generation-like attributes, treat it as a generation
 * anyway. The mapper's own comments say this only applies to SDK versions
 * <= 3.3.0, but the version guard compares only major.minor and ignores the
 * patch component, so any 3.3.x patch release above 3.3.0 is incorrectly
 * still treated as affected.
 */
describe("ObservationTypeMapperRegistry — PythonSDKv330Override version gate", () => {
  const registry = new ObservationTypeMapperRegistry();

  const spanAttributesWithModel = {
    [LangfuseOtelSpanAttributes.OBSERVATION_TYPE]: "span",
    [LangfuseOtelSpanAttributes.OBSERVATION_MODEL]: "gpt-4",
  };
  const pythonResourceAttributes = { "telemetry.sdk.language": "python" };

  it("applies the generation override for the exact affected version 3.3.0", () => {
    const result = registry.mapToObservationType(
      spanAttributesWithModel,
      pythonResourceAttributes,
      { name: "langfuse-sdk", version: "3.3.0" },
    );

    expect(result).toBe("GENERATION");
  });

  it("does NOT apply the override for a 3.3.x patch release above 3.3.0", () => {
    const result = registry.mapToObservationType(
      spanAttributesWithModel,
      pythonResourceAttributes,
      { name: "langfuse-sdk", version: "3.3.1" },
    );

    // The SDK bug was fixed after 3.3.0, so a span explicitly typed "span"
    // must stay "SPAN" instead of being forced to "GENERATION".
    expect(result).toBe("SPAN");
  });

  it("does not apply the override for a newer minor/major version", () => {
    expect(
      registry.mapToObservationType(
        spanAttributesWithModel,
        pythonResourceAttributes,
        { name: "langfuse-sdk", version: "3.4.0" },
      ),
    ).toBe("SPAN");

    expect(
      registry.mapToObservationType(
        spanAttributesWithModel,
        pythonResourceAttributes,
        { name: "langfuse-sdk", version: "4.0.0" },
      ),
    ).toBe("SPAN");
  });
});
