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

export const QuickstartExamples = (p: {
  secretKey?: string;
  publicKey?: string;
}) => {
  const uiCustomization = useUiCustomization();
  const capture = usePostHogClientCapture();
  const tabs = [
    { value: "python", label: "Python" },
    { value: "js", label: "JS/TS" },
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "bedrock", label: "Bedrock" },
    { value: "gemini", label: "Gemini" },
    { value: "langgraph", label: "LangGraph" },
    { value: "dspy", label: "DSPy" },
    { value: "llamaindex", label: "LlamaIndex" },
    { value: "langchain", label: "Langchain" },
    { value: "langchain-js", label: "Langchain JS" },
    { value: "other", label: "Other" },
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
        className="flex flex-col md:flex-row gap-6"
        orientation="vertical"
      >
        {/* Side nav */}
        <TabsList
          className="md:min-w-[180px] md:flex-col md:h-auto overflow-x-auto md:overflow-visible"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              onClick={() =>
                capture("onboarding:code_example_tab_switch", {
                  tabLabel: tab.value,
                })
              }
              className="md:justify-start"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          <TabsContent value="python">
            <CodeView content="pip install langfuse" className="mb-2" />
            <CodeView
              content={`from langfuse import Langfuse\n\nlangfuse = Langfuse(\n  secret_key="${secretKey}",\n  public_key="${publicKey}",\n  host="${host}"\n)`}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              See{" "}
              <a
                href="https://langfuse.com/docs/get-started"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Quickstart
              </a>{" "}
              and{" "}
              <a
                href="https://langfuse.com/docs/sdk/python"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Python docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          <TabsContent value="js">
            <CodeView content="npm install langfuse" className="mb-2" />
            <CodeView
              content={`import { Langfuse } from "langfuse";\n\nconst langfuse = new Langfuse({\n  secretKey: "${secretKey}",\n  publicKey: "${publicKey}",\n  baseUrl: "${host}"\n});`}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              See{" "}
              <a
                href="https://langfuse.com/docs/get-started"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Quickstart
              </a>{" "}
              and{" "}
              <a
                href="https://langfuse.com/docs/sdk/typescript"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                JS/TS docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          <TabsContent value="openai">
            <p className="mt-2 text-xs text-muted-foreground">
              The integration is a drop-in replacement for the OpenAI Python SDK.
              By changing the import, Langfuse will capture all LLM calls and send
              them to Langfuse asynchronously.
            </p>
            <CodeView content="pip install langfuse" className="my-2" />
            <CodeView
              title=".env"
              content={`LANGFUSE_SECRET_KEY=${secretKey}\nLANGFUSE_PUBLIC_KEY=${publicKey}\nLANGFUSE_HOST="${host}"`}
              className="my-2"
            />
            <CodeView
              content={`# remove: import openai\n\nfrom langfuse.openai import openai`}
              className="my-2"
            />
            {/* Colab quickstart */}
            <a
              href="https://colab.research.google.com/github/langfuse/examples/blob/main/openai_quickstart.ipynb"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="my-2">
                Open in Colab
              </Button>
            </a>
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
              The integration is a drop-in replacement for the Anthropic Python SDK.
              By changing the import, Langfuse will capture all LLM calls and send
              them to Langfuse asynchronously.
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
            <a
              href="https://colab.research.google.com/github/langfuse/examples/blob/main/anthropic_quickstart.ipynb"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="my-2">
                Open in Colab
              </Button>
            </a>
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
            <a
              href="https://colab.research.google.com/github/langfuse/examples/blob/main/bedrock_quickstart.ipynb"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="my-2">
                Open in Colab
              </Button>
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              See the {" "}
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
            <a
              href="https://colab.research.google.com/github/langfuse/examples/blob/main/gemini_quickstart.ipynb"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="my-2">
                Open in Colab
              </Button>
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              See the {" "}
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

          {/* LangGraph */}
          <TabsContent value="langgraph">
            <p className="mt-2 text-xs text-muted-foreground">
              Automatically trace LangGraph executions using Langfuse callbacks.
            </p>
            <CodeView content="pip install langfuse langgraph" className="my-2" />
            <CodeView
              content={LANGGRAPH_CODE({ publicKey, secretKey, host })}
              className="my-2"
            />
            <a
              href="https://colab.research.google.com/github/langfuse/examples/blob/main/langgraph_quickstart.ipynb"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="my-2">
                Open in Colab
              </Button>
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              See the {" "}
              <a
                href="https://langfuse.com/docs/integrations/langgraph"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                LangGraph Integration docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          {/* DSPy */}
          <TabsContent value="dspy">
            <p className="mt-2 text-xs text-muted-foreground">
              Use Langfuse’s DSPy callback to capture symbolic reasoning traces.
            </p>
            <CodeView content="pip install langfuse dspy-ai" className="my-2" />
            <CodeView
              content={DSPY_CODE({ publicKey, secretKey, host })}
              className="my-2"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              See the {" "}
              <a
                href="https://langfuse.com/docs/integrations/dspy"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                DSPy Integration docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          {/* LlamaIndex */}
          <TabsContent value="llamaindex">
            <p className="mt-2 text-xs text-muted-foreground">
              Capture retrieval & synthesis traces from LlamaIndex workflows.
            </p>
            <CodeView content="pip install langfuse llama-index" className="my-2" />
            <CodeView
              content={LLAMAINDEX_CODE({ publicKey, secretKey, host })}
              className="my-2"
            />
            <a
              href="https://colab.research.google.com/github/langfuse/examples/blob/main/llamaindex_quickstart.ipynb"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="my-2">
                Open in Colab
              </Button>
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
              See the {" "}
              <a
                href="https://langfuse.com/docs/integrations/llamaindex"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                LlamaIndex Integration docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          <TabsContent value="langchain">
            <p className="mt-2 text-xs text-muted-foreground">
              The integration uses the Langchain callback system to automatically
              capture detailed traces of your Langchain executions.
            </p>
            <CodeView content="pip install langfuse" className="my-2" />
            <CodeView
              content={LANGCHAIN_PYTHON_CODE({ publicKey, secretKey, host })}
              className="my-2"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              See the{" "}
              <a
                href="https://langfuse.com/docs/integrations/langchain/python"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Langchain Integration docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          <TabsContent value="langchain-js">
            <p className="mt-2 text-xs text-muted-foreground">
              The integration uses the Langchain callback system to automatically
              capture detailed traces of your Langchain executions.
            </p>
            <CodeView content="npm install langfuse-langchain" className="my-2" />
            <CodeView
              content={LANGCHAIN_JS_CODE({ publicKey, secretKey, host })}
              className="my-2"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              See the{" "}
              <a
                href="https://langfuse.com/docs/integrations/langchain/typescript"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Langchain Integration docs
              </a>{" "}
              for more details and an end-to-end example.
            </p>
          </TabsContent>

          <TabsContent value="other">
            <p className="mt-2 text-xs text-muted-foreground">
              Use the{" "}
              <a
                href="https://api.reference.langfuse.com/"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                API
              </a>{" "}
              or one of the{" "}
              <a
                href="https://langfuse.com/docs/integrations"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                native integrations
              </a>{" "}
              (e.g. LiteLLM, Flowise, and Langflow) to integrate with Langfuse.
            </p>
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
const LANGCHAIN_PYTHON_CODE = (p: {
  publicKey: string;
  secretKey: string;
  host: string;
}) => `from langfuse import Langfuse
from langfuse.langchain import CallbackHandler

langfuse = Langfuse(
    public_key="${p.publicKey}",
    secret_key="${p.secretKey}",
    host="${p.host}"
)

langfuse_handler = CallbackHandler()

# <Your Langchain code here>
 
# Add handler to run/invoke/call/chat
chain.invoke({"input": "<user_input>"}, config={"callbacks": [langfuse_handler]})`;

const LANGCHAIN_JS_CODE = (p: {
  publicKey: string;
  secretKey: string;
  host: string;
}) => `import { CallbackHandler } from "langfuse-langchain";
 
// Initialize Langfuse callback handler
const langfuseHandler = new CallbackHandler({
  publicKey: "${p.publicKey}",
  secretKey: "${p.secretKey}",
  baseUrl: "${p.host}"
});
 
// Your Langchain implementation
const chain = new LLMChain(...);
 
// Add handler as callback when running the Langchain agent
await chain.invoke(
  { input: "<user_input>" },
  { callbacks: [langfuseHandler] }
);`;

// LangGraph
const LANGGRAPH_CODE = (p: {
  publicKey: string;
  secretKey: string;
  host: string;
}) => `from langfuse import Langfuse
from langfuse.langgraph import CallbackHandler

langfuse = Langfuse(
    public_key="${p.publicKey}",
    secret_key="${p.secretKey}",
    host="${p.host}"
)

handler = CallbackHandler(langfuse)

# build your LangGraph workflow
workflow.run({"input": "<user_input>"}, callbacks=[handler])`;

// DSPy
const DSPY_CODE = (p: {
  publicKey: string;
  secretKey: string;
  host: string;
}) => `from langfuse.dspy import LangfuseTracer

# Initialise tracer
tracer = LangfuseTracer(
    public_key="${p.publicKey}",
    secret_key="${p.secretKey}",
    host="${p.host}"
)

# integrate tracer into DSPy compilation
compiled_program = program.compile_tracer(tracer)`;

// LlamaIndex
const LLAMAINDEX_CODE = (p: {
  publicKey: string;
  secretKey: string;
  host: string;
}) => `from langfuse.llama_index import CallbackHandler

# create callback handler
handler = CallbackHandler(
    public_key="${p.publicKey}",
    secret_key="${p.secretKey}",
    host="${p.host}"
)

# pass handler to query engine
response = index.query("<query>", callbacks=[handler])`;
