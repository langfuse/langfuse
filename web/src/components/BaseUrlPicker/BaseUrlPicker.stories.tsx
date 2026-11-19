import { useState } from "react";
import { expect, fn, screen } from "storybook/test";

import preview from "@/.storybook/preview";
import { openAiBaseUrlPresets } from "@/src/constants/openAiBaseUrlPresets";
import { BaseUrlPicker } from "./BaseUrlPicker";

const meta = preview.meta({
  component: BaseUrlPicker,
  args: {
    presets: openAiBaseUrlPresets,
    onChange: fn(),
  },
});

/** A blank base URL is the provider default. */
export const Default = meta.story({
  args: { value: "" },
});

export const RegionPreset = meta.story({
  args: { value: "https://eu.api.openai.com/v1" },
});

/** A saved URL that matches no preset opens as Custom with the URL in the input. */
export const CustomURL = meta.story({
  args: { value: "https://llm-proxy.example.com/v1" },
});

export const CustomURLError = meta.story({
  args: { value: "http://llm-proxy.example.com/v1", error: true },
});

export const Disabled = meta.story({
  args: { value: "https://eu.api.openai.com/v1", disabled: true },
});

/** Default is stored as a blank base URL, as an empty field was before. */
export const ChoosingDefault = meta.story({
  name: "(Test) Choosing Default Saves A Blank Base URL",
  args: { value: "https://eu.api.openai.com/v1" },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("option", { name: /^Default/ }),
    );
    await expect(args.onChange).toHaveBeenCalledWith("");
  },
});

export const ReplacingCustomURL = meta.story({
  name: "(Test) Clearing A Custom URL Keeps The Input",
  args: { value: "https://llm-proxy.example.com/v1" },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    const handleChange = (baseURL: string) => {
      setValue(baseURL);
      args.onChange(baseURL);
    };
    return <BaseUrlPicker {...args} value={value} onChange={handleChange} />;
  },
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "Custom base URL" });
    await userEvent.clear(input);
    await userEvent.type(input, "https://other-proxy.example.com/v1");
    await expect(
      canvas.getByRole("textbox", { name: "Custom base URL" }),
    ).toHaveValue("https://other-proxy.example.com/v1");
    await expect(args.onChange).toHaveBeenLastCalledWith(
      "https://other-proxy.example.com/v1",
    );
  },
});
