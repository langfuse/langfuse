import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import { buildAgentSetupInstructions } from "./buildAgentSetupInstructions";
import { buildApiInstructions } from "./buildApiInstructions";
import { buildOpenCodeInstructions } from "./buildOpenCodeInstructions";
import { formatAgentSetupMarkdown } from "./formatAgentSetupMarkdown";

const context = {
  gatewayOrigin: "https://gateway.example.com",
  userId: "jane@example.com",
  providers: ["ANTHROPIC" as const],
};

describe("agent setup instructions", () => {
  it("only checks the routes of configured providers", () => {
    const codes = buildApiInstructions(context).steps.map((s) => s.code);

    expect(codes.some((code) => code.includes("/anthropic/v1/models"))).toBe(
      true,
    );
    expect(codes.some((code) => code.includes("/openai/v1/models"))).toBe(
      false,
    );
  });

  it("falls back to every provider and warns when none is enabled", () => {
    const api = buildApiInstructions({ ...context, providers: [] });
    const openCodeConfig = buildOpenCodeInstructions({
      ...context,
      providers: [],
    }).steps.find((step) => step.language === "json")?.code;

    expect(api.warning).toBeDefined();
    expect(api.steps.map((s) => s.code).join("\n")).toContain(
      "/openai/v1/models",
    );
    expect(JSON.parse(openCodeConfig ?? "{}").providers).toHaveProperty(
      "openai",
    );
  });

  it("copies markdown with the key placeholder, user id and docs link", () => {
    for (const instructions of buildAgentSetupInstructions(context)) {
      const markdown = formatAgentSetupMarkdown(instructions);

      expect(markdown).toMatch(/^# /);
      expect(markdown).toContain(GATEWAY_KEY_PLACEHOLDER);
      expect(markdown).not.toMatch(/sk-lf-/);
      expect(markdown.trimEnd()).toMatch(
        new RegExp(`Docs: ${instructions.docsUrl}$`),
      );
    }
  });
});
