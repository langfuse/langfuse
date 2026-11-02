import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import { buildAgentSetupInstructions } from "../buildAgentSetupInstructions";
import { buildApiInstructions } from "../buildApiInstructions";
import { buildOpenCodeInstructions } from "../buildOpenCodeInstructions";
import { formatAgentSetupMarkdown } from "../formatAgentSetupMarkdown";

const context = {
  gatewayOrigin: "https://gateway.example.com",
  providers: ["ANTHROPIC" as const],
};

describe("agent setup instructions", () => {
  it("only checks the routes of configured providers", () => {
    const codes = buildApiInstructions(context).steps.flatMap(
      (s) => s.code ?? [],
    );

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

  it("puts the key placeholder into the commands of every terminal setup", () => {
    for (const instructions of buildAgentSetupInstructions(context)) {
      // Desktop apps take the key in a settings field, not a command.
      if (
        instructions.id === "claude-desktop" ||
        instructions.id === "copilot-desktop"
      )
        continue;
      const code = instructions.steps.flatMap((s) => s.code ?? []).join("\n");

      expect(code).toContain(GATEWAY_KEY_PLACEHOLDER);
    }
  });

  it("copies markdown with a heading and docs link", () => {
    for (const instructions of buildAgentSetupInstructions(context)) {
      const markdown = formatAgentSetupMarkdown(instructions);

      expect(markdown).toMatch(/^# /);
      expect(markdown).not.toContain("undefined");
      expect(markdown.trimEnd().endsWith(`Docs: ${instructions.docsUrl}`)).toBe(
        true,
      );
    }
  });
});
