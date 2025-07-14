import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import {
  Tabs,
  TabsList,
  TabsContent,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { Button } from "@/src/components/ui/button";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Link from "next/link";
import { ExternalLink, Grid } from "lucide-react";
import {
  SiPython,
  SiJavascript,
  SiOpenai,
  SiAnthropic,
  SiAmazonaws,
  SiGoogle,
} from "react-icons/si";

// Brand or fallback colored-circle icons per integration value
const IntegrationIcon = ({ name }: { name: string }) => {
  const sizeClass = "h-4 w-4 mr-2 shrink-0";

  switch (name) {
    case "python":
      return <SiPython className={sizeClass} color="#3776AB" />;
    case "js":
      return <SiJavascript className={sizeClass} color="#F7DF1E" />;
    case "openai":
      return <SiOpenai className={sizeClass} color="#412991" />;
    case "anthropic":
      return <SiAnthropic className={sizeClass} color="#FF4A4A" />;
    case "bedrock":
      return <SiAmazonaws className={sizeClass} color="#FF9900" />;
    case "gemini":
      return <SiGoogle className={sizeClass} color="#4285F4" />;
    case "other":
      return <Grid className={sizeClass} />;
    default: {
      // fallback circle
      const color = "#6B7280";
      return (
        <svg
          width={12}
          height={12}
          viewBox="0 0 12 12"
          className={sizeClass}
          aria-hidden="true"
        >
          <circle cx="6" cy="6" r="6" fill={color} />
        </svg>
      );
    }
  }
};

// Google Colab colored logo (interlocking circles)
const ColabIcon = () => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 40 40"
    className="h-4 w-4"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style={{ stopColor: "#FBBD16" }} />
        <stop offset="100%" style={{ stopColor: "#F57A00" }} />
      </linearGradient>
    </defs>
    <path
      d="M18 4C9.716 4 3 10.716 3 19s6.716 15 15 15 15-6.716 15-15h-6.429c0 4.728-3.843 8.571-8.571 8.571S9.429 23.728 9.429 19 13.272 10.429 18 10.429V4Z"
      fill="url(#grad1)"
    />
    <path
      d="M22 36c8.284 0 15-6.716 15-15S30.284 6 22 6s-15 6.716-15 15h6.429c0-4.728 3.843-8.571 8.571-8.571S30.571 15.272 30.571 20 26.728 28.571 22 28.571V36Z"
      fill="url(#grad1)"
    />
  </svg>
);

const ColabButton = ({ href }: { href: string }) => (
  <Link
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="my-2 inline-block"
  >
    <Button variant="outline" className="gap-2">
      <span>Open in Colab</span>
      <ColabIcon />
      <ExternalLink className="h-4 w-4" />
    </Button>
  </Link>
);

export const QuickstartExamples = (p: {
  secretKey?: string;
  publicKey?: string;
}) => {
  const uiCustomization = useUiCustomization();
  const capture = usePostHogClientCapture();
  const tabs = [
    { value: "python", label: "Decorator" },
    { value: "js", label: "JS/TS" },
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "bedrock", label: "Bedrock" },
    { value: "gemini", label: "Gemini" },
    { value: "other", label: "All Integrations" },
  ];
  const host = `${uiCustomization?.hostname ?? window.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`;

  const secretKey = p.secretKey ?? "<secret key>";
  const publicKey = p.publicKey ?? "<public key>";

  // if custom docs link, do not show quickstart examples but refer to docs
  if (uiCustomization?.documentationHref) {
    return (
      <p className="mb-2">
        See your{" "}
        <Link
          href={uiCustomization.documentationHref}
          target="_blank"
          className="underline"
        >
          internal documentation
        </Link>{" "}
        for details on how to set up Langfuse in your organization.
      </p>
    );
  }

  return (
    <div>
      {/* Use vertical orientation to show frameworks list at the side on ≥md screens */}
      <Tabs
        defaultValue="python"
        className="flex flex-col gap-6 md:flex-row"
        orientation="vertical"
      >
        {/* Side nav */}
        <TabsList className="overflow-x-auto md:h-[480px] md:min-w-[220px] md:flex-col md:justify-start md:gap-2 md:overflow-visible md:p-1">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              onClick={() =>
                capture("onboarding:code_example_tab_switch", {
                  tabLabel: tab.value,
                })
              }
              className="md:w-full md:justify-start md:py-2 md:text-base"
            >
              <IntegrationIcon name={tab.value} />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          <TabsContent value="python">
            <p className="mb-2 mt-2 text-xs text-muted-foreground">
              The <code>@observe()</code> decorator automatically captures
              functions and generator executions as traces in Langfuse.
            </p>
            <CodeView content="pip install langfuse openai" className="my-2" />
            <CodeView
              title=".env"
              content={`LANGFUSE_SECRET_KEY=${secretKey}\nLANGFUSE_PUBLIC_KEY=${publicKey}\nLANGFUSE_HOST="${host}"\n# Get your OpenAI API key from https://platform.openai.com/keys\nOPENAI_API_KEY="<your-key>"`}
              className="my-2"
            />
            <CodeView
              language="python"
              highlightedLines={[1, 4, 14]}
              content={`from langfuse import observe
from langfuse.openai import openai # OpenAI integration

@observe()
def story():
    return openai.chat.completions.create(
        model="gpt-4o",
        messages=[
          {"role": "system", "content": "You are a great storyteller."},
          {"role": "user", "content": "Once upon a time in a galaxy far, far away..."}
        ],
    ).choices[0].message.content

@observe()
def main():
    return story()

main()`}
              className="my-2"
            />
            <ColabButton href="https://colab.research.google.com/github/langfuse/examples/blob/main/decorator_quickstart.ipynb" />
            <p className="mt-3 text-xs text-muted-foreground">
              See the{" "}
              <a
                href="https://langfuse.com/docs/tracing/decorators"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Decorator docs
              </a>{" "}
              for more details.
            </p>
          </TabsContent>

          <TabsContent value="js">
            <CodeView
              language="bash"
              content="npm install langfuse"
              className="my-2"
            />
            <CodeView
              title=".env"
              content={`LANGFUSE_SECRET_KEY=${secretKey}\nLANGFUSE_PUBLIC_KEY=${publicKey}\nLANGFUSE_BASEURL="${host}"`}
              className="my-2"
            />
            <CodeView
              language="typescript"
              highlightedLines={[1, 3]}
              content={`import { Langfuse } from "langfuse";
 
const langfuse = new Langfuse();
 
async function main() {
  const trace = langfuse.trace({
    name: "chat-completion-trace",
    userId: "user-id",
  });
 
  trace.generation({
    name: "user-greeting",
    input: [{ "role": "user", "content": "Hello, how are you?" }],
    output: { "role": "assistant", "content": "I'm doing great, thanks for asking!" },
    model: "gpt-3.5-turbo",
  });
 
  // ensure all events are sent before the process exits
  await langfuse.shutdownAsync();
}
 
main();`}
              className="my-2"
            />
            <p className="mt-3 text-xs text-muted-foreground">
              See the{" "}
              <a
                href="https://langfuse.com/docs/sdk/typescript"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                JS/TS SDK docs
              </a>{" "}
              for more details.
            </p>
          </TabsContent>

          <TabsContent value="openai">
            <p className="mt-2 text-xs text-muted-foreground">
              The integration is a drop-in replacement for the OpenAI Python
              SDK. By changing the import, Langfuse will capture all LLM calls
              and send them to Langfuse asynchronously.
            </p>
            <CodeView
              language="bash"
              content="pip install langfuse openai"
              className="my-2"
            />
            <CodeView
              title=".env"
              content={`LANGFUSE_SECRET_KEY=${secretKey}\nLANGFUSE_PUBLIC_KEY=${publicKey}\nLANGFUSE_HOST="${host}"\n# Get your OpenAI API key from https://platform.openai.com/keys\nOPENAI_API_KEY="<your-key>"`}
              className="my-2"
            />
            <CodeView
              language="python"
              highlightedLines={[1]}
              content={`from langfuse.openai import openai
  
 completion = openai.chat.completions.create(
  model="gpt-3.5-turbo",
  messages=[{"role": "user", "content": "Say this is a test"}]
)
print(completion.choices[0].message)`}
              className="my-2"
            />
            <ColabButton href="https://colab.research.google.com/github/langfuse/examples/blob/main/openai_quickstart.ipynb" />
            <p className="mt-2 text-xs text-muted-foreground">
              Use the OpenAI SDK as you would normally. See the{" "}
              <a
                href="https://langfuse.com/docs/integrations/openai"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenAI Integration docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          <TabsContent value="anthropic">
            <p className="mt-2 text-xs text-muted-foreground">
              The integration is a drop-in replacement for the Anthropic Python
              SDK. By changing the import, Langfuse will capture all LLM calls
              and send them to Langfuse asynchronously.
            </p>
            <CodeView content="pip install langfuse" className="my-2" />
            <CodeView
              title=".env"
              content={`LANGFUSE_SECRET_KEY=${secretKey}\nLANGFUSE_PUBLIC_KEY=${publicKey}\nLANGFUSE_HOST="${host}"`}
              className="my-2"
            />
            <CodeView
              content={`# remove: import anthropic\n\nfrom langfuse.anthropic import anthropic`}
              className="my-2"
            />
            {/* Colab quickstart */}
            <ColabButton href="https://colab.research.google.com/github/langfuse/examples/blob/main/anthropic_quickstart.ipynb" />
            <p className="mt-2 text-xs text-muted-foreground">
              Use the Anthropic SDK as you would normally. See the{" "}
              <a
                href="https://langfuse.com/docs/integrations/anthropic"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Anthropic Integration docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          {/* Bedrock */}
          <TabsContent value="bedrock">
            <p className="mt-2 text-xs text-muted-foreground">
              Capture AWS Bedrock model invocations with a single import change.
            </p>
            <CodeView content="pip install langfuse" className="my-2" />
            <CodeView
              title=".env"
              content={`LANGFUSE_SECRET_KEY=${secretKey}\nLANGFUSE_PUBLIC_KEY=${publicKey}\nLANGFUSE_HOST=\"${host}\"`}
              className="my-2"
            />
            <CodeView
              content={`# remove: import boto3\n\nfrom langfuse.bedrock import bedrock`}
              className="my-2"
            />
            <ColabButton href="https://colab.research.google.com/github/langfuse/examples/blob/main/bedrock_quickstart.ipynb" />
            <p className="mt-2 text-xs text-muted-foreground">
              See the{" "}
              <a
                href="https://langfuse.com/docs/integrations/bedrock"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Bedrock Integration docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          {/* Gemini */}
          <TabsContent value="gemini">
            <p className="mt-2 text-xs text-muted-foreground">
              Track Google Gemini / Vertex AI calls via a drop-in replacement.
            </p>
            <CodeView content="pip install langfuse" className="my-2" />
            <CodeView
              title=".env"
              content={`LANGFUSE_SECRET_KEY=${secretKey}\nLANGFUSE_PUBLIC_KEY=${publicKey}\nLANGFUSE_HOST=\"${host}\"`}
              className="my-2"
            />
            <CodeView
              content={`# remove: from google.generativeai import generativeai\n\nfrom langfuse.gemini import generativeai`}
              className="my-2"
            />
            <ColabButton href="https://colab.research.google.com/github/langfuse/examples/blob/main/gemini_quickstart.ipynb" />
            <p className="mt-2 text-xs text-muted-foreground">
              See the{" "}
              <a
                href="https://langfuse.com/docs/integrations/gemini"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Gemini Integration docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          <TabsContent value="other">
            <p className="mt-2 text-sm text-muted-foreground">
              Langfuse offers many more integrations. Check out the overview
              page to learn more.
            </p>
            <Link
              href="https://langfuse.com/docs/integrations/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <Button variant="outline" className="mt-4 gap-2">
                Explore all integrations
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </TabsContent>
        </div>
      </Tabs>
      <span className="mt-4 text-xs text-muted-foreground">
        Do you have questions or issues? Check out this{" "}
        <a
          href="https://langfuse.com/faq/all/missing-traces"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          FAQ post
        </a>{" "}
        for common resolutions,{" "}
        <Link
          className="underline"
          href="https://langfuse.com/docs/ask-ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ask AI
        </Link>{" "}
        or{" "}
        <Link
          className="underline"
          href="https://langfuse.com/support"
          target="_blank"
          rel="noopener noreferrer"
        >
          get support
        </Link>
        .
      </span>
    </div>
  );
};
