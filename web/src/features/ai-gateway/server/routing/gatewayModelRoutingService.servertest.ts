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
      viaAlias: false,
    });
    expect(
      routingService.resolve("claude-sonnet-4-5", connections.slice(0, 1)),
    ).toEqual({
      connection: null,
      providerModel: "claude-sonnet-4-5",
      viaAlias: false,
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
      viaAlias: false,
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
      viaAlias: false,
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
      viaAlias: false,
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
        viaAlias: false,
      });
    },
  );

  describe("aliases", () => {
    const aliasConnections = [
      {
        id: "ai01",
        name: "ai01",
        provider: "CUSTOM",
        allowedModels: null,
      },
      {
        id: "ai02",
        name: "ai02",
        provider: "CUSTOM",
        allowedModels: null,
      },
    ] as const;

    it("resolves an alias to its first enabled target", () => {
      expect(
        routingService.resolve("glm-5.3", aliasConnections, [
          {
            name: "glm-5.3",
            status: "ENABLED",
            targets: [
              { connectionId: "ai01", providerModel: "GLM-5.3" },
              { connectionId: "ai02", providerModel: "GLM-5.3" },
            ],
          },
        ]),
      ).toEqual({
        connection: aliasConnections[0],
        providerModel: "GLM-5.3",
        viaAlias: true,
      });
    });

    it("falls through a disabled or missing target connection to the next target", () => {
      expect(
        routingService.resolve("glm-5.3", aliasConnections.slice(1), [
          {
            name: "glm-5.3",
            status: "ENABLED",
            targets: [
              { connectionId: "ai01", providerModel: "GLM-5.3" },
              { connectionId: "ai02", providerModel: "GLM-5.3" },
            ],
          },
        ]),
      ).toEqual({
        connection: aliasConnections[1],
        providerModel: "GLM-5.3",
        viaAlias: true,
      });
    });

    it("ignores a disabled alias and falls back to regular routing", () => {
      expect(
        routingService.resolve("glm-5.3", aliasConnections, [
          {
            name: "glm-5.3",
            status: "DISABLED",
            targets: [{ connectionId: "ai01", providerModel: "GLM-5.3" }],
          },
        ]),
      ).toBeNull();
    });

    it("resolves to null when no alias target connection supports the format", () => {
      expect(
        routingService.resolve(
          "glm-5.3",
          [],
          [
            {
              name: "glm-5.3",
              status: "ENABLED",
              targets: [{ connectionId: "ai01", providerModel: "GLM-5.3" }],
            },
          ],
        ),
      ).toBeNull();
    });

    it("an alias wins over a connection with the same name", () => {
      const namedConnection = {
        id: "glm-5.3",
        name: "glm-5.3",
        provider: "OPENAI",
        allowedModels: null,
      } as const;
      // Without the alias, "glm-5.3" matches no prefix heuristic and no slug,
      // so it would return null; with it, the alias target wins.
      expect(
        routingService.resolve(
          "glm-5.3",
          [namedConnection],
          [
            {
              name: "glm-5.3",
              status: "ENABLED",
              targets: [{ connectionId: "glm-5.3", providerModel: "GLM-5.3" }],
            },
          ],
        ),
      ).toEqual({
        connection: namedConnection,
        providerModel: "GLM-5.3",
        viaAlias: true,
      });
    });
  });
});
