import { describe, expect, it } from "vitest";

import { GatewayModelRoutingService } from "@/src/features/ai-gateway/server/routing/gatewayModelRoutingService";

const routingService = new GatewayModelRoutingService();

const connections = [
  {
    id: "openai-primary",
    name: "OpenAI primary",
    provider: "OPENAI",
    allowedModels: null,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    provider: "ANTHROPIC",
    allowedModels: null,
  },
  {
    id: "openai-secondary",
    name: "OpenAI secondary",
    provider: "OPENAI",
    allowedModels: null,
  },
] as const;

describe("GatewayModelRoutingService", () => {
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
      model: "codex-mini-latest",
      connectionId: "openai-primary",
      providerModel: "codex-mini-latest",
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
      const route = routingService.resolve(model, connections);

      expect(route).not.toBeNull();
      expect(route?.connection?.id).toBe(connectionId);
      expect(route?.providerModel).toBe(providerModel);
    },
  );

  it.each([
    "gpt",
    "claude",
    "codex",
    "random-model",
    ":model",
    "OpenAI primary:",
  ])("rejects unsupported model %s", (model) => {
    expect(routingService.resolve(model, connections)).toBeNull();
  });

  it("returns a valid unresolved route for a missing connection", () => {
    expect(routingService.resolve("Unknown:gpt-4o", connections)).toEqual({
      connection: null,
      providerModel: "gpt-4o",
    });
    expect(
      routingService.resolve("claude-sonnet-4-5", connections.slice(0, 1)),
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
      allowedModels: null,
    } as const;

    expect(
      routingService.resolve("ft:claude-sonnet-4-5", [
        ...connections,
        ftConnection,
      ]),
    ).toEqual({
      connection: ftConnection,
      providerModel: "claude-sonnet-4-5",
    });
  });

  it("skips connections that do not allow an implicitly routed model", () => {
    const restrictedConnections = [
      {
        id: "openai-restricted",
        name: "OpenAI restricted",
        provider: "OPENAI",
        allowedModels: ["gpt-4o"],
      },
      {
        id: "openai-compatible",
        name: "OpenAI compatible",
        provider: "OPENAI",
        allowedModels: ["gpt-6-sol"],
      },
    ] as const;

    expect(routingService.resolve("gpt-6-sol", restrictedConnections)).toEqual({
      connection: restrictedConnections[1],
      providerModel: "gpt-6-sol",
    });
  });

  it("uses an unrestricted connection for an implicitly routed model", () => {
    const unrestrictedConnection = {
      id: "openai-unrestricted",
      name: "OpenAI unrestricted",
      provider: "OPENAI",
      allowedModels: null,
    } as const;

    expect(
      routingService.resolve("gpt-6-sol", [
        {
          id: "openai-restricted",
          name: "OpenAI restricted",
          provider: "OPENAI",
          allowedModels: [],
        },
        unrestrictedConnection,
      ]),
    ).toEqual({
      connection: unrestrictedConnection,
      providerModel: "gpt-6-sol",
    });
  });

  it.each(["gpt-6-sol", "ft:gpt-4o-mini-2024-07-18:acme::abc123"])(
    "returns the first matching provider for denied implicit model %s",
    (model) => {
      const restrictedConnections = [
        {
          id: "openai-primary",
          name: "OpenAI primary",
          provider: "OPENAI",
          allowedModels: ["gpt-4o"],
        },
        {
          id: "openai-secondary",
          name: "OpenAI secondary",
          provider: "OPENAI",
          allowedModels: [],
        },
      ] as const;

      expect(routingService.resolve(model, restrictedConnections)).toEqual({
        connection: restrictedConnections[0],
        providerModel: model,
      });
    },
  );
});
