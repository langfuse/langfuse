import { expect, fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { AdvancedSettings } from "./AdvancedSettings";

const meta = preview.meta({
  component: AdvancedSettings,
  args: {
    onBaseURLChange: fn(),
    onHeadersChange: fn(),
  },
});

export const Collapsed = meta.story({
  args: {
    provider: "OPENAI",
    baseURL: "",
    headers: [],
    storedHeaderKeys: [],
    isEditing: false,
  },
});

export const AddingAHeader = meta.story({
  name: "(Test) Adding A Header",
  args: {
    provider: "OPENAI",
    baseURL: "https://llm-proxy.example.com/v1",
    headers: [],
    storedHeaderKeys: [],
    isEditing: false,
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Show advanced settings" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Header" }));
    await expect(args.onHeadersChange).toHaveBeenCalledWith([
      expect.objectContaining({ key: "", value: "" }),
    ]);
  },
});

/** OpenRouter connections can use another OpenRouter endpoint, such as its EU one. */
export const OpenRouterEndpoint = meta.story({
  name: "(Test) OpenRouter Endpoint",
  args: {
    provider: "OPENROUTER",
    baseURL: "https://eu.openrouter.ai/api/v1",
    headers: [],
    storedHeaderKeys: [],
    isEditing: false,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Show advanced settings" }),
    );
    await expect(
      canvas.getByText(/OpenRouter default: https:\/\/openrouter\.ai\/api\/v1/),
    ).toBeVisible();
  },
});

/** Stored values are never sent to the browser, so their rows show a mask. */
export const EditingStoredHeaders = meta.story({
  name: "(Test) Editing Stored Headers",
  args: {
    provider: "ANTHROPIC",
    baseURL: "https://llm-proxy.example.com",
    headers: [{ id: "header-1", key: "x-team", value: "" }],
    storedHeaderKeys: ["x-team"],
    isEditing: true,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Show advanced settings" }),
    );
    await expect(canvas.getByPlaceholderText("***")).toBeVisible();
  },
});

/** A custom base URL can name customer infrastructure, so it stays out of session replay. */
export const BaseURLBlockedFromReplay = meta.story({
  name: "(Test) Base URL Blocked From Replay",
  args: {
    provider: "OPENAI",
    baseURL: "https://llm-proxy.internal.example/v1",
    headers: [],
    storedHeaderKeys: [],
    isEditing: false,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Show advanced settings" }),
    );
    const baseURL = canvas.getByDisplayValue(
      "https://llm-proxy.internal.example/v1",
    );
    await expect(baseURL.closest(".ph-no-capture")).not.toBeNull();
  },
});
