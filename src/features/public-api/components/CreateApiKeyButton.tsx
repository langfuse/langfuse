import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CodeView } from "@/src/components/ui/code";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { usePostHog } from "posthog-js/react";
import { env } from "@/src/env.mjs";
import {
  Tabs,
  TabsList,
  TabsContent,
  TabsTrigger,
} from "@/src/components/ui/tabs";

export function CreateApiKeyButton(props: { projectId: string }) {
  const utils = api.useUtils();
  const posthog = usePostHog();
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "apiKeys:create",
  });

  const hostname =
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "EU" ? window.origin : undefined;

  const mutCreateApiKey = api.apiKeys.create.useMutation({
    onSuccess: () => utils.apiKeys.invalidate(),
  });
  const [open, setOpen] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{
    secretKey: string;
    publicKey: string;
  } | null>(null);

  const createApiKey = () => {
    if (open) {
      setOpen(false);
      setGeneratedKeys(null);
    } else {
      mutCreateApiKey
        .mutateAsync({
          projectId: props.projectId,
        })
        .then(({ secretKey, publicKey }) => {
          setGeneratedKeys({
            secretKey,
            publicKey,
          });
          setOpen(true);
          posthog.capture("project_settings:api_key_create");
        })
        .catch((error) => {
          console.error(error);
        });
    }
  };

  if (!hasAccess) return null;

  return (
    <Dialog open={open} onOpenChange={createApiKey}>
      <DialogTrigger asChild>
        <Button variant="secondary" loading={mutCreateApiKey.isLoading}>
          <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
          Create new API keys
        </Button>
      </DialogTrigger>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        className="max-w-full md:max-w-xl"
      >
        <DialogTitle>API Keys</DialogTitle>
        <div className="mb-2">
          <div className="text-md font-semibold">Secret Key</div>
          <div className="my-2">
            This key can only be viewed once. You can always generate a new key.
          </div>
          <CodeView content={generatedKeys?.secretKey ?? "Loading ..."} />
        </div>
        <div>
          <div className="text-md mb-2 font-semibold">Public Key</div>
          <CodeView content={generatedKeys?.publicKey ?? "Loading ..."} />
        </div>
        {hostname ? (
          <>
            <div>
              <div className="text-md mb-2 font-semibold">Host</div>
              <CodeView content={hostname} />
            </div>
          </>
        ) : null}
        <div className="mb-2">
          <div className="text-md my-2 font-semibold">Usage</div>
          <Tabs defaultValue="python">
            <TabsList>
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="js">JS/TS</TabsTrigger>
              <TabsTrigger value="openai">OpenAI</TabsTrigger>
              <TabsTrigger value="langchain">Langchain</TabsTrigger>
              <TabsTrigger value="langchain-js">Langchain JS</TabsTrigger>
              <TabsTrigger value="other">Other</TabsTrigger>
            </TabsList>
            <TabsContent value="python">
              <CodeView
                content="pip install langfuse"
                className="mb-2 bg-blue-50"
              />
              <CodeView
                className="bg-blue-50"
                content={
                  generatedKeys?.publicKey && generatedKeys.secretKey
                    ? `from langfuse import Langfuse\n\nlangfuse = Langfuse(\n  secret_key="${generatedKeys.secretKey}",\n  public_key="${generatedKeys.publicKey}",\n  host="${hostname}"\n)`
                    : "Loading ..."
                }
              />
              <p className="mt-3 text-xs text-gray-600">
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
                for more details.
              </p>
            </TabsContent>
            <TabsContent value="js">
              <CodeView
                content="npm install langfuse"
                className="mb-2 bg-blue-50"
              />
              <CodeView
                className="bg-blue-50"
                content={
                  generatedKeys?.publicKey && generatedKeys.secretKey
                    ? `import { Langfuse } from "langfuse";\n\nconst langfuse = new Langfuse({\n  secretKey: "${generatedKeys.secretKey}",\n  publicKey: "${generatedKeys.publicKey}",\n  baseUrl: "${hostname}"\n});`
                    : "Loading ..."
                }
              />
              <p className="mt-3 text-xs text-gray-600">
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
                for more details.
              </p>
            </TabsContent>
            <TabsContent value="openai">
              <p className="mt-2 text-xs text-gray-600">
                The integration is a drop-in replacement for the OpenAI Python
                SDK. By changing the import, Langfuse will capture all LLM calls
                and send them to Langfuse asynchronously.
              </p>
              <CodeView
                content="pip install langfuse"
                className="my-2 bg-blue-50"
              />
              <CodeView
                title=".env"
                content={
                  generatedKeys?.publicKey && generatedKeys.secretKey
                    ? `LANGFUSE_SECRET_KEY=${generatedKeys.secretKey};\nLANGFUSE_PUBLIC_KEY=${generatedKeys.publicKey};\nLANGFUSE_HOST="${hostname}";`
                    : "Loading ..."
                }
                className="my-2 bg-blue-50"
              />
              <CodeView
                content={`#remove: import openai\n\nfrom langfuse.openai import openai`}
                className="my-2 bg-blue-50"
              />
              <p className="mt-2 text-xs text-gray-600">
                Use the OpenAI SDK as you would normally. See the{" "}
                <a
                  href="https://langfuse.com/docs/integrations/openai"
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenAI Integration docs
                </a>{" "}
                for more details.
              </p>
            </TabsContent>
            <TabsContent value="langchain"></TabsContent>
            <TabsContent value="langchain-js"></TabsContent>
            <TabsContent value="other">
              <p className="mt-2 text-xs text-gray-600">
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
                (e.g. LiteLLM, Flowise, and Langflow) to integrate with
                Langfuse.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
