import { SiLangchain, SiOpenai, SiOpentelemetry } from "@langfuse/icons/si";
import preview from "../../../../.storybook/preview";
import { IntegrationLogo } from "./IntegrationLogo";

const sizes = ["xs", "sm", "md", "lg"] as const;
const shapes = ["circle", "rounded"] as const;

const meta = preview.meta({
  component: IntegrationLogo,
  argTypes: {
    icon: { control: false },
  },
});

export const Default = meta.story({
  args: {
    name: "OpenAI",
    icon: SiOpenai,
    size: "md",
    shape: "rounded",
    isDecorative: false,
  },
});

export const WithImage = meta.story({
  args: {
    name: "LangChain & LangGraph",
    image: {
      src: "https://langfuse.com/images/integrations/langchain_icon.png",
      appearance: "color",
    },
    icon: SiLangchain,
    size: "lg",
    shape: "rounded",
    isDecorative: false,
  },
});

export const DarkImage = meta.story({
  args: {
    name: "OpenAI (Python)",
    image: {
      src: "https://langfuse.com/images/integrations/openai_icon.svg",
      appearance: "dark",
    },
    icon: SiOpenai,
    size: "lg",
    shape: "rounded",
    isDecorative: false,
  },
});

export const ImageUnavailable = meta.story({
  args: {
    name: "CrewAI",
    image: {
      src: "https://langfuse.com/images/integrations/not-there.png",
      appearance: "color",
    },
    size: "lg",
    shape: "rounded",
    isDecorative: false,
  },
});

export const Initials = meta.story({
  args: {
    name: "LiteLLM Proxy",
    size: "md",
    shape: "rounded",
    isDecorative: false,
  },
});

export const VariantMatrix = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid gap-3">
      {shapes.map((shape) => (
        <div key={shape} className="flex items-center gap-3">
          {sizes.map((size) => (
            <span key={size} className="flex items-center gap-1.5">
              <IntegrationLogo
                name="LangChain"
                icon={SiLangchain}
                size={size}
                shape={shape}
                isDecorative={false}
              />
              <IntegrationLogo
                name="OpenTelemetry"
                icon={SiOpentelemetry}
                size={size}
                shape={shape}
                isDecorative={false}
              />
              <IntegrationLogo
                name="LlamaIndex"
                size={size}
                shape={shape}
                isDecorative={false}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
});
