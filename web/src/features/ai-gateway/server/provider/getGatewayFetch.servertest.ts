import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "@langfuse/shared/src/env";
import { testGatewayModel } from "@/src/features/ai-gateway/server/provider/connection/testGatewayModel";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import { getModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/modelDiscoveryRegistry";

const originalEnv = {
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS:
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS,
};

afterEach(() => {
  Object.assign(env, originalEnv);
  vi.restoreAllMocks();
});

describe("getGatewayFetch", () => {
  it("keeps official origins inside a configured host allowlist", async () => {
    Object.assign(env, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS: ["proxy.corp"],
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));

    const discovery = await getModelDiscoveryAdapter("OPENAI").fetchCatalog({
      credential: "sk-test",
      config: null,
      baseURL: null,
      extraHeaders: {},
      fetcher: getGatewayFetch({
        baseURL: null,
        extraHeaders: {},
        logContext: "test",
      }),
    });
    const modelTest = await testGatewayModel({
      provider: "ANTHROPIC",
      config: null,
      baseURL: null,
      extraHeaders: {},
      credential: "sk-ant-test",
      model: "claude-haiku-4-5",
    });

    expect(discovery.success).toBe(false);
    expect(modelTest.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
