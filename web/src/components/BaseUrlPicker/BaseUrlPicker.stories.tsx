import { fn } from "storybook/test";

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

/** A blank base URL is the provider default. Open the select to see the Regions presets and the Custom URL option below them. */
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
