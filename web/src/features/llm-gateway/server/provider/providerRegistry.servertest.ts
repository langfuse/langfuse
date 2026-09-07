import { describe, expect, it, vi } from "vitest";

import {
  GatewayProviderService,
  getGatewayProviderDefinition,
  providerSupportsApiFormat,
} from ".";
import type { PrismaClient } from "@langfuse/shared/src/db";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

const session = {
  user: { id: "user-1" },
  orgId: "org-1",
  orgRole: "OWNER",
} as OrgAuthedContext["session"];

describe("LLM gateway provider registry", () => {
  it("exposes only controlled provider URLs and explicit capabilities", () => {
    expect(getGatewayProviderDefinition("OPENAI")).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      authType: "bearer",
    });
    expect(getGatewayProviderDefinition("ANTHROPIC")).toMatchObject({
      baseUrl: "https://api.anthropic.com/v1",
      authType: "x-api-key",
    });
    expect(getGatewayProviderDefinition("OPENROUTER")).toMatchObject({
      baseUrl: "https://openrouter.ai/api/v1",
      authType: "bearer",
    });

    expect(providerSupportsApiFormat("OPENAI", "openai.responses")).toBe(true);
    expect(
      providerSupportsApiFormat("OPENROUTER", "openai.chat-completions"),
    ).toBe(true);
    expect(providerSupportsApiFormat("OPENROUTER", "openai.responses")).toBe(
      true,
    );
    expect(providerSupportsApiFormat("ANTHROPIC", "anthropic.messages")).toBe(
      true,
    );
  });

  it("validates credentials before persisting a connection", async () => {
    const validator = vi
      .fn()
      .mockRejectedValue(new Error("invalid provider credential"));
    const service = new GatewayProviderService(
      {} as PrismaClient,
      vi.fn<typeof fetch>(),
      validator,
    );

    await expect(
      service.create({
        organizationId: "org-1",
        name: "Primary",
        provider: "OPENAI",
        credential: "invalid",
        session,
      }),
    ).rejects.toThrow("invalid provider credential");
    expect(validator).toHaveBeenCalledWith({
      provider: "OPENAI",
      credential: "invalid",
    });
  });
});
