import { describe, expect, it } from "vitest";

import {
  AI_GATEWAY_KEY_ID_METADATA_KEY,
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  pickGatewayTraceAttributionMetadata,
} from "./constants";

describe("pickGatewayTraceAttributionMetadata", () => {
  it("picks only the Show traces attribution keys", () => {
    expect(
      pickGatewayTraceAttributionMetadata({
        [AI_GATEWAY_KEY_ID_METADATA_KEY]: "key-1",
        [AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY]: "user-1",
        "langfuse.gateway.api_key.name": "CI key",
        custom: "ignore",
      }),
    ).toEqual({
      [AI_GATEWAY_KEY_ID_METADATA_KEY]: "key-1",
      [AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY]: "user-1",
    });
  });

  it("omits missing, null, and empty values", () => {
    expect(
      pickGatewayTraceAttributionMetadata({
        [AI_GATEWAY_KEY_ID_METADATA_KEY]: "key-1",
        [AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY]: "",
      }),
    ).toEqual({ [AI_GATEWAY_KEY_ID_METADATA_KEY]: "key-1" });

    expect(pickGatewayTraceAttributionMetadata(null)).toEqual({});
    expect(pickGatewayTraceAttributionMetadata(undefined)).toEqual({});
  });
});
