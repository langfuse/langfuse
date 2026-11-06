import { expect, fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { CustomProviderFields } from "./CustomProviderFields";

const meta = preview.meta({
  component: CustomProviderFields,
  args: {
    onBaseURLChange: fn(),
    onApiFormatsChange: fn(),
    onHeadersChange: fn(),
  },
});

export const Empty = meta.story({
  args: {
    baseURL: "",
    apiFormats: [],
    headers: [],
    storedHeaderKeys: [],
    isEditing: false,
  },
});

export const SelectingAnEndpoint = meta.story({
  name: "(Test) Selecting An Endpoint",
  args: {
    baseURL: "https://llm-proxy.example.com/v1",
    apiFormats: ["openai.chat-completions"],
    headers: [],
    storedHeaderKeys: [],
    isEditing: false,
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Messages (Anthropic format)" }),
    );
    await expect(args.onApiFormatsChange).toHaveBeenCalledWith([
      "openai.chat-completions",
      "anthropic.messages",
    ]);
  },
});

/** Two endpoints is the maximum, so the remaining one cannot be selected. */
export const TwoEndpointsSelected = meta.story({
  name: "(Test) Two Endpoints Selected",
  args: {
    baseURL: "https://llm-proxy.example.com/v1",
    apiFormats: ["openai.responses", "openai.chat-completions"],
    headers: [],
    storedHeaderKeys: [],
    isEditing: false,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("checkbox", { name: "Messages (Anthropic format)" }),
    ).toBeDisabled();
  },
});

export const AddingAHeader = meta.story({
  name: "(Test) Adding A Header",
  args: {
    baseURL: "https://llm-proxy.example.com/v1",
    apiFormats: ["openai.responses"],
    headers: [],
    storedHeaderKeys: [],
    isEditing: false,
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add Header" }));
    await expect(args.onHeadersChange).toHaveBeenCalledWith([
      expect.objectContaining({ key: "", value: "" }),
    ]);
  },
});

/** Stored values are never sent to the browser, so their rows show a mask. */
export const EditingStoredHeaders = meta.story({
  name: "(Test) Editing Stored Headers",
  args: {
    baseURL: "https://llm-proxy.example.com/v1",
    apiFormats: ["anthropic.messages"],
    headers: [{ id: "header-1", key: "x-team", value: "" }],
    storedHeaderKeys: ["x-team"],
    isEditing: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByPlaceholderText("***")).toBeVisible();
  },
});
