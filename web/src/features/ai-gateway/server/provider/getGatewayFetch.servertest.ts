import { afterEach, describe, expect, it, vi } from "vitest";
import type * as SharedServer from "@langfuse/shared/src/server";

import { testGatewayModel } from "@/src/features/ai-gateway/server/provider/connection/testGatewayModel";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import { getModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/modelDiscoveryRegistry";

const { allowedHosts } = vi.hoisted(() => ({ allowedHosts: ["proxy.corp"] }));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return {
    ...actual,
    llmBaseUrlWhitelistFromEnv: () => ({
      hosts: [],
      ips: [],
      ip_ranges: [],
      allowedHosts,
    }),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getGatewayFetch", () => {
  it("keeps official origins inside a configured host allowlist", async () => {
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
