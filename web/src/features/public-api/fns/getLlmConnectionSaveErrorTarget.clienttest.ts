import { INVALID_LLM_BASE_URL_PREFIX, LLMAdapter } from "@langfuse/shared";

import { getLlmConnectionSaveErrorTarget } from "./getLlmConnectionSaveErrorTarget";

const baseURLError = `${INVALID_LLM_BASE_URL_PREFIX}Blocked hostname detected`;

describe("getLlmConnectionSaveErrorTarget", () => {
  it("routes base URL errors to the field only where the form renders one", () => {
    expect(
      getLlmConnectionSaveErrorTarget({
        message: baseURLError,
        adapter: LLMAdapter.OpenAI,
        typeSafeUpstreamId: "custom",
      }),
    ).toEqual({
      field: "baseURL",
      message: "Blocked hostname detected",
      opensAdvancedSettings: true,
    });
    expect(
      getLlmConnectionSaveErrorTarget({
        message: baseURLError,
        adapter: LLMAdapter.TypeSafe,
        typeSafeUpstreamId: "custom",
      }),
    ).toEqual({
      field: "baseURL",
      message: "Blocked hostname detected",
      opensAdvancedSettings: false,
    });
    expect(
      getLlmConnectionSaveErrorTarget({
        message: baseURLError,
        adapter: LLMAdapter.Bedrock,
        typeSafeUpstreamId: "custom",
      }),
    ).toEqual({ field: "root", message: baseURLError });
    expect(
      getLlmConnectionSaveErrorTarget({
        message: "Secret key is required.",
        adapter: LLMAdapter.OpenAI,
        typeSafeUpstreamId: "custom",
      }),
    ).toEqual({ field: "root", message: "Secret key is required." });
  });
});
