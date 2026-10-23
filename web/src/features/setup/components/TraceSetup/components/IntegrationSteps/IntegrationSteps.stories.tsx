import { expect, fn, spyOn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import type { Integration } from "../../../../integrations/types";
import { IntegrationSteps } from "./IntegrationSteps";

const meta = preview.meta({
  component: IntegrationSteps,
});

const integration = (
  slug: string,
  name: string,
  category: string,
): Integration => ({
  slug,
  name,
  category,
  description: `Trace ${name} with Langfuse.`,
  href: `https://langfuse.com/integrations/${category}/${slug}`,
});

const steps = {
  target: { project: "this" },
  keys: {
    status: "ready",
    keys: { publicKey: "pk-lf-1234", secretKey: "sk-lf-5678" },
  },
  baseUrl: "https://cloud.langfuse.com",
  manageKeysPath: "/project/demo/settings/api-keys",
  onCreateKeys: fn(),
  copied: { env: false, setup: false },
  onCopy: fn(),
  shouldAnimate: false,
} as const;

export const App = meta.story({
  args: {
    ...steps,
    integration: integration("langchain", "LangChain", "frameworks"),
  },
});

export const ClaudeCode = meta.story({
  args: {
    ...steps,
    integration: integration("claude-code", "Claude Code", "developer-tools"),
  },
});

export const Codex = meta.story({
  args: {
    ...steps,
    integration: integration("codex", "Codex", "developer-tools"),
  },
});

export const OpenCode = meta.story({
  args: {
    ...steps,
    integration: integration("opencode", "OpenCode", "developer-tools"),
  },
});

export const AgentWithItsGuideOnly = meta.story({
  args: {
    ...steps,
    integration: integration("cursor", "Cursor", "developer-tools"),
  },
});

export const InANewProject = meta.story({
  args: {
    ...steps,
    integration: integration("langchain", "LangChain", "frameworks"),
    target: {
      project: "new",
      newProject: { status: "none" },
      canCreateProject: true,
      onCreateProject: fn(),
    },
  },
});

export const TestPromptCarriesTheGuide = meta.story({
  name: "(Test) The prompt carries the integration's guide",
  args: App.input.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy prompt" }),
      );
      await expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://langfuse.com/integrations/frameworks/langchain.md",
        ),
      );
      await expect(args.onCopy).toHaveBeenCalledOnce();
      await expect(args.onCopy).toHaveBeenCalledWith("setup");
    } finally {
      writeText.mockRestore();
    }
  },
});

export const TestCodexShowsEveryStep = meta.story({
  name: "(Test) Codex shows its whole plugin setup",
  args: Codex.input.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/codex plugin add tracing@codex-observability-plugin/),
    ).toBeVisible();
    await expect(canvas.getByText(/hooks = true/)).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Codex guide/ }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/integrations/developer-tools/codex",
    );
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy config" }),
      );
      await expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining(
          '[plugins."tracing@codex-observability-plugin"]',
        ),
      );
      await expect(args.onCopy).toHaveBeenCalledOnce();
      await expect(args.onCopy).toHaveBeenCalledWith("setup");
    } finally {
      writeText.mockRestore();
    }
  },
});

export const TestOpenCodeHasAConfig = meta.story({
  name: "(Test) OpenCode's setup is its config",
  args: OpenCode.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Copy config" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/@langfuse\/opencode-observability-plugin@latest/),
    ).toBeVisible();
  },
});

export const TestOtherAgentsLinkTheirGuide = meta.story({
  name: "(Test) An agent without a written setup links its guide",
  args: AgentWithItsGuideOnly.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Install the plugin" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /^Copy (command|config)$/ }),
    ).toBeNull();
    await expect(
      canvas.getByRole("link", { name: /Cursor guide/ }),
    ).toBeVisible();
  },
});
