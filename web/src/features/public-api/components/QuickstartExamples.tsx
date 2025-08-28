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
        あなたの{" "}
        <Link
          href={uiCustomization.documentationHref}
          target="_blank"
          className="underline"
        >
          内部ドキュメント
        </Link>{" "}
        を参照して、組織での生成AI評価クラウドのセットアップ方法を確認してください。
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
            See{" "}
            <a
              href="https://langfuse.com/docs/get-started"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              クイックスタート
            </a>{" "}
            と{" "}
            <a
              href="https://langfuse.com/docs/sdk/python"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Pythonドキュメント
            </a>{" "}
            で詳細とエンドツーエンドの例をご覧ください。
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
              クイックスタート
            </a>{" "}
            と{" "}
            <a
              href="https://langfuse.com/docs/sdk/typescript"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              JS/TSドキュメント
            </a>{" "}
            で詳細とエンドツーエンドの例をご覧ください。
          </p>
        </TabsContent>
        <TabsContent value="openai">
          <p className="mt-2 text-xs text-muted-foreground">
            この統合はOpenAI Python SDKのドロップインリプレースメントです。
            インポートを変更するだけで、生成AI評価クラウドがすべてのLLM呼び出しをキャプチャし、
            非同期で送信します。
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
            OpenAI SDKを通常どおり使用してください。{" "}
            <a
              href="https://langfuse.com/docs/integrations/openai"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenAI統合ドキュメント
            </a>{" "}
            で詳細とエンドツーエンドの例をご覧ください。
          </p>
        </TabsContent>
        <TabsContent value="langchain">
          <p className="mt-2 text-xs text-muted-foreground">
            この統合はLangchainコールバックシステムを使用して、
            Langchain実行の詳細なトレースを自動的にキャプチャします。
          </p>
          <CodeView content="pip install langfuse" className="my-2" />
          <CodeView
            content={LANGCHAIN_PYTHON_CODE({ publicKey, secretKey, host })}
            className="my-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            詳細とエンドツーエンドの例は{" "}
            <a
              href="https://langfuse.com/docs/integrations/langchain/python"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Langchain統合ドキュメント
            </a>{" "}
            で詳細とエンドツーエンドの例をご覧ください。
          </p>
        </TabsContent>
        <TabsContent value="langchain-js">
          <p className="mt-2 text-xs text-muted-foreground">
            この統合はLangchainコールバックシステムを使用して、
            Langchain実行の詳細なトレースを自動的にキャプチャします。
          </p>
          <CodeView content="npm install langfuse-langchain" className="my-2" />
          <CodeView
            content={LANGCHAIN_JS_CODE({ publicKey, secretKey, host })}
            className="my-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            詳細とエンドツーエンドの例は{" "}
            <a
              href="https://langfuse.com/docs/integrations/langchain/typescript"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Langchain統合ドキュメント
            </a>{" "}
            で詳細とエンドツーエンドの例をご覧ください。
          </p>
        </TabsContent>
        <TabsContent value="other">
          <p className="mt-2 text-xs text-muted-foreground">
            {" "}
            <a
              href="https://api.reference.langfuse.com/"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              API
            </a>{" "}
            または{" "}
            <a
              href="https://langfuse.com/docs/integrations"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              ネイティブ統合
            </a>{" "}
            （例：LiteLLM、Flowise、Langflow）を使用して生成AI評価クラウドと統合してください。
          </p>
        </TabsContent>
      </Tabs>
      <span className="mt-4 text-xs text-muted-foreground">
        質問や問題がありますか？こちらの{" "}
        <a
          href="https://langfuse.com/faq/all/missing-traces"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          FAQ記事
        </a>{" "}
        で一般的な解決策を確認するか、{" "}
        <Link
          className="underline"
          href="https://langfuse.com/docs/ask-ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          AIに質問
        </Link>{" "}
        または{" "}
        <Link
          className="underline"
          href="https://langfuse.com/support"
          target="_blank"
          rel="noopener noreferrer"
        >
          サポートを受ける
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
