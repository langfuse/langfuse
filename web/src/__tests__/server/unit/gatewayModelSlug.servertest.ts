import { describe, expect, it } from "vitest";

import { resolveGatewayModelRoute } from "@/src/features/ai-gateway/fns/gatewayModelSlug";

const connections = [
  { id: "openai-primary", name: "OpenAI primary", provider: "OPENAI" },
  { id: "anthropic", name: "Anthropic", provider: "ANTHROPIC" },
  { id: "openai-secondary", name: "OpenAI secondary", provider: "OPENAI" },
] as const;

describe("resolveGatewayModelRoute", () => {
  it.each([
    {
      model: "OpenAI secondary:gpt-4o",
      connectionId: "openai-secondary",
      providerModel: "gpt-4o",
    },
    {
      model: "OpenAI secondary:model:with:colon",
      connectionId: "openai-secondary",
      providerModel: "model:with:colon",
    },
    {
      model: "gpt-6-sol",
      connectionId: "openai-primary",
      providerModel: "gpt-6-sol",
    },
    {
      model: "ft:gpt-4o-mini-2024-07-18:acme::abc123",
      connectionId: "openai-primary",
      providerModel: "ft:gpt-4o-mini-2024-07-18:acme::abc123",
    },
    {
      model: "claude-sonnet-4-5",
      connectionId: "anthropic",
      providerModel: "claude-sonnet-4-5",
    },
  ])(
    "routes $model to $connectionId",
    ({ model, connectionId, providerModel }) => {
      const route = resolveGatewayModelRoute(model, connections);

      expect(route).not.toBeNull();
      expect(route?.connection?.id).toBe(connectionId);
      expect(route?.providerModel).toBe(providerModel);
    },
  );

  it.each(["gpt", "claude", "random-model", ":model", "OpenAI primary:"])(
    "rejects unsupported model %s",
    (model) => {
      expect(resolveGatewayModelRoute(model, connections)).toBeNull();
    },
  );

  it("returns a valid unresolved route for a missing connection", () => {
    expect(resolveGatewayModelRoute("Unknown:gpt-4o", connections)).toEqual({
      connection: null,
      providerModel: "gpt-4o",
    });
    expect(
      resolveGatewayModelRoute("claude-sonnet-4-5", connections.slice(0, 1)),
    ).toEqual({
      connection: null,
      providerModel: "claude-sonnet-4-5",
    });
  });

  it("prefers an explicit ft connection over the OpenAI fine-tune fallback", () => {
    const ftConnection = {
      id: "ft-connection",
      name: "ft",
      provider: "ANTHROPIC",
    } as const;

    expect(
      resolveGatewayModelRoute("ft:claude-sonnet-4-5", [
        ...connections,
        ftConnection,
      ]),
    ).toEqual({
      connection: ftConnection,
      providerModel: "claude-sonnet-4-5",
    });
  });
});
