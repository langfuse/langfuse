import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import {
  Tabs,
  TabsList,
  TabsContent,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Link from "next/link";
import { useTranslation } from "next-i18next";

export const QuickstartExamples = (p: {
  secretKey?: string;
  publicKey?: string;
}) => {
  const { t } = useTranslation("common");
  const uiCustomization = useUiCustomization();
  const capture = usePostHogClientCapture();
  const tabs = [
    { value: "python", label: "Python" },
    { value: "js", label: "JS/TS" },
    { value: "openai", label: "OpenAI" },
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
        {t("setup.seeInternalDocs")}{" "}
        <Link
          href={uiCustomization.documentationHref}
          target="_blank"
          className="underline"
        >
          {t("setup.internalDocumentation")}
        </Link>{" "}
        {t("setup.forSetupDetails")}
      </p>
    );
  }

  return (
    <div>
      <Tabs defaultValue="python" className="relative max-w-full">
        <div className="overflow-x-scroll">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                onClick={() =>
                  capture("onboarding:code_example_tab_switch", {
                    tabLabel: tab.value,
                  })
                }
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="python">
          <CodeView content="pip install langfuse" className="mb-2" />
          <CodeView
            content={`from langfuse import Langfuse\n\nlangfuse = Langfuse(\n  secret_key="${secretKey}",\n  public_key="${publicKey}",\n  host="${host}"\n)`}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {t("setup.see")}{" "}
            <a
              href="https://langfuse.com/docs/observability/get-started"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("setup.quickstart")}
            </a>{" "}
            {t("setup.and")}{" "}
            <a
              href="https://langfuse.com/docs/sdk/python"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("setup.pythonDocs")}
            </a>{" "}
            {t("setup.forMoreDetails")}
          </p>
        </TabsContent>
        <TabsContent value="js">
          <CodeView content="npm install langfuse" className="mb-2" />
          <CodeView
            content={`import { Langfuse } from "langfuse";\n\nconst langfuse = new Langfuse({\n  secretKey: "${secretKey}",\n  publicKey: "${publicKey}",\n  baseUrl: "${host}"\n});`}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {t("setup.see")}{" "}
            <a
              href="https://langfuse.com/docs/observability/get-started"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("setup.quickstart")}
            </a>{" "}
            {t("setup.and")}{" "}
            <a
              href="https://langfuse.com/docs/sdk/typescript"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("setup.jsDocs")}
            </a>{" "}
            {t("setup.forMoreDetails")}
          </p>
        </TabsContent>
        <TabsContent value="openai">
          <p className="mt-2 text-xs text-muted-foreground">
            {t("setup.openaiIntegrationDescription")}
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
          <p className="mt-2 text-xs text-muted-foreground">
            {t("setup.useOpenAISDK")}{" "}
            <a
              href="https://langfuse.com/integrations/model-providers/openai-py"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("setup.openaiIntegrationDocs")}
            </a>{" "}
            {t("setup.forMoreDetails")}
          </p>
        </TabsContent>
        <TabsContent value="langchain">
          <p className="mt-2 text-xs text-muted-foreground">
            {t("setup.langchainIntegrationDescription")}
          </p>
          <CodeView content="pip install langfuse" className="my-2" />
          <CodeView
            content={LANGCHAIN_PYTHON_CODE({ publicKey, secretKey, host })}
            className="my-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("setup.see")}{" "}
            <a
              href="https://langfuse.com/integrations/frameworks/langchain"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("setup.langchainIntegrationDocs")}
            </a>{" "}
            {t("setup.forMoreDetails")}
          </p>
        </TabsContent>
        <TabsContent value="langchain-js">
          <p className="mt-2 text-xs text-muted-foreground">
            {t("setup.langchainIntegrationDescription")}
          </p>
          <CodeView content="npm install langfuse-langchain" className="my-2" />
          <CodeView
            content={LANGCHAIN_JS_CODE({ publicKey, secretKey, host })}
            className="my-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("setup.see")}{" "}
            <a
              href="https://langfuse.com/integrations/frameworks/langchain"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("setup.langchainIntegrationDocs")}
            </a>{" "}
            {t("setup.forMoreDetails")}
          </p>
        </TabsContent>
        <TabsContent value="other">
          <p className="mt-2 text-xs text-muted-foreground">
            {t("setup.useAPI")}{" "}
            <a
              href="https://api.reference.langfuse.com/"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("setup.api")}
            </a>{" "}
            {t("setup.orOneOf")}{" "}
            <a
              href="https://langfuse.com/docs/integrations"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("setup.nativeIntegrations")}
            </a>{" "}
            (e.g. LiteLLM, Flowise, and Langflow) {t("setup.toIntegrate")}
          </p>
        </TabsContent>
      </Tabs>
      <span className="mt-4 text-xs text-muted-foreground">
        {t("setup.haveQuestions")}{" "}
        <a
          href="https://langfuse.com/faq/all/missing-traces"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("setup.faqPost")}
        </a>{" "}
        {t("setup.forCommonResolutions")}{" "}
        <Link
          className="underline"
          href="https://langfuse.com/docs/ask-ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("setup.askAI")}
        </Link>{" "}
        {t("setup.or")}{" "}
        <Link
          className="underline"
          href="https://langfuse.com/support"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("setup.getSupport")}
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
