import {
  SiAnthropic,
  SiGooglegemini,
  SiLangchain,
  SiOllama,
  SiOpenai,
  SiOpentelemetry,
  SiPython,
  SiVercel,
} from "@langfuse/icons/si";
import preview from "../../../../.storybook/preview";
import { LogoStack } from "./LogoStack";

const logos = [
  { name: "OpenAI", icon: SiOpenai },
  { name: "LangChain", icon: SiLangchain },
  { name: "Vercel AI SDK", icon: SiVercel },
  { name: "LlamaIndex" },
  { name: "Anthropic", icon: SiAnthropic },
  { name: "LiteLLM" },
  { name: "Mastra" },
  { name: "OpenTelemetry", icon: SiOpentelemetry },
  { name: "Gemini", icon: SiGooglegemini },
  { name: "Ollama", icon: SiOllama },
  { name: "Python SDK", icon: SiPython },
];

const meta = preview.meta({
  component: LogoStack,
  argTypes: {
    logos: { control: false },
  },
  args: {
    logos,
    label: "Works with OpenAI, LangChain, Vercel AI SDK and more",
  },
});

export const Default = meta.story({
  args: { size: "sm", max: 8 },
});

export const Overflow = meta.story({
  args: { size: "sm", max: 5 },
});

export const VariantMatrix = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid gap-3">
      {(["xs", "sm", "md"] as const).map((size) => (
        <LogoStack
          key={size}
          label={`Integrations at ${size}`}
          logos={logos}
          size={size}
          max={6}
        />
      ))}
    </div>
  ),
});
