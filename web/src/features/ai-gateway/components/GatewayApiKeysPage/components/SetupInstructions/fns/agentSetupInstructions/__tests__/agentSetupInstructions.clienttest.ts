import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import { buildAgentSetupInstructions } from "../buildAgentSetupInstructions";
import { buildApiInstructions } from "../buildApiInstructions";
import { buildOpenCodeInstructions } from "../buildOpenCodeInstructions";
import { formatAgentSetupMarkdown } from "../formatAgentSetupMarkdown";

const context = {
  gatewayOrigin: "https://gateway.example.com",
  providers: ["ANTHROPIC" as const],
  apiProviders: ["ANTHROPIC" as const],
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
    const api = buildApiInstructions({
      ...context,
      providers: [],
      apiProviders: [],
    });
    const openCodeConfig = buildOpenCodeInstructions({
      ...context,
      providers: [],
      apiProviders: [],
    }).steps.find((step) => step.language === "json")?.code;

    expect(api.warning).toBeDefined();
    expect(api.steps.map((s) => s.code).join("\n")).toContain(
      "/openai/v1/models",
    );
    expect(JSON.parse(openCodeConfig ?? "{}").providers).toHaveProperty(
      "openai",
    );
  });

  it("lists OpenAI models without a warning when only a Chat Completions provider is enabled", () => {
    const setups = buildAgentSetupInstructions({
      ...context,
      providers: [],
      apiProviders: ["OPENAI"],
    });
    const api = setups.find((s) => s.id === "api");
    const codex = setups.find((s) => s.id === "codex");

    expect(api?.warning).toBeUndefined();
    expect(api?.steps.map((s) => s.code).join("\n")).toContain(
      "/openai/v1/models",
    );
    expect(codex?.warning).toBeDefined();
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

  it("keeps shell lines that carry the key out of shell history", () => {
    for (const instructions of buildAgentSetupInstructions(context)) {
      for (const step of instructions.steps) {
        if (step.language !== "sh") continue;
        const lines = step.code.split("\n");
        // A bracketed multi-line paste is one history entry, judged by its first character.
        const firstLine = step.code.includes(GATEWAY_KEY_PLACEHOLDER)
          ? [lines[0]]
          : [];
        const keyLines = lines.filter((line) => line.includes("export "));

        for (const line of [...firstLine, ...keyLines]) {
          expect(line).toMatch(/^ \S/);
        }
      }
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
