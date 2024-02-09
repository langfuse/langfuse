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
        className="max-w-xl"
      >
        {hostname ? (
          <>
            <DialogTitle>Hostname</DialogTitle>
            <div className="mb-6">
              <div className="my-2">
                When connecting to Langfuse, use this hostname / baseurl.
              </div>
              <CodeView content={hostname} />
            </div>
          </>
        ) : null}
        <DialogTitle>API Keys</DialogTitle>
        <div className="mb-2">
          <div className="text-md font-semibold">Secret Key</div>
          <div className="my-2">
            Please save this secret key.{" "}
            <span className="font-semibold">
              You will not be able to view it again
            </span>
            . If you lose it, you will need to generate a new one.
          </div>
          <CodeView content={generatedKeys?.secretKey ?? "Loading ..."} />
        </div>
        <div>
          <div className="text-md mb-2 font-semibold">Public Key</div>
          <CodeView content={generatedKeys?.publicKey ?? "Loading ..."} />
        </div>
        {generatedKeys?.publicKey && generatedKeys.secretKey && (
          <div className="mb-2">
            <div className="text-md my-2 font-semibold">Usage</div>
            <Tabs defaultValue="javaScript">
              <TabsList>
                <TabsTrigger value="javaScript">JS/TS</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="javaScript">
                <CodeView
                  className="bg-blue-50"
                  content={`import { Langfuse } from "langfuse";\n\nconst langfuse = new Langfuse({\n  secretKey: "${generatedKeys.secretKey}",\n  publicKey: "${generatedKeys.publicKey}",\n  ${hostname ? `baseUrl: "${hostname}"` : '//baseUrl: defaults to "https://cloud.langfuse.com"'}\n});`}
                />
              </TabsContent>
              <TabsContent value="python">
                <CodeView
                  className="bg-blue-50"
                  content={`from langfuse import Langfuse\n\nlangfuse = Langfuse(\n  secret_key="${generatedKeys.secretKey}",\n  public_key="${generatedKeys.publicKey}",\n  ${hostname ? `host="${hostname}"` : 'host="https://cloud.langfuse.com"'}\n)`}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
