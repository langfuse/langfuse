import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { extractVariables } from "@langfuse/shared";
import {
  BookOpenText,
  ChevronRight,
  Copy,
  ExternalLink,
  LayoutList,
  Rocket,
  Webhook,
} from "lucide-react";
import { CodeMirrorEditor } from "@/src/components/editor";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { cn } from "@/src/utils/tailwind";
import { PromptFrame } from "../frames/PromptFrame";
import {
  PREVIEW_MODELS,
  PREVIEW_PROMPT_MESSAGES,
  PREVIEW_TOOL_CHIPS,
} from "./PromptIterateScreen";
import {
  getPromptBreadcrumbs,
  getPromptStageHref,
  getWorkspaceSelectionLabel,
  resolvePromptPreviewSlug,
} from "../shell/product-manifest";

type DeployEnvironmentId = "production" | "staging" | "development";
type DeployConfigFormat = "yaml" | "json";
type ApiLanguage = "python" | "javascript" | "curl" | "go";

const DEPLOY_ENVIRONMENTS = [
  {
    id: "production" as const,
    label: "Production",
    dotClassName: "bg-fuchsia-500",
    deploymentEnvironmentId: "f4f3dd59-c99b-4133-9704-e3cb4a985246",
    updatedLabel: "Undeployed • 11 mins ago",
  },
  {
    id: "staging" as const,
    label: "Staging",
    dotClassName: "bg-amber-500",
    deploymentEnvironmentId: "4cb08bcb-1827-4e34-b2d4-5fed2787330a",
    updatedLabel: "Undeployed • 27 mins ago",
  },
  {
    id: "development" as const,
    label: "Development",
    dotClassName: "bg-sky-500",
    deploymentEnvironmentId: "0d698b7c-26c7-4638-9b51-8bf19ff1f8a6",
    updatedLabel: "Undeployed • 2 hrs ago",
  },
] as const;

const DEPLOY_PROMPT_ID = "0f77cadc-6419-4b84-b103-eef25769b1a7";
const DEPLOY_BASE_URL = "https://api.langfuse.com/v2/deployments";

export default function PromptDeployScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { promptPath } = resolvePromptPreviewSlug(router.query.slug);
  const [selectedEnvironmentId, setSelectedEnvironmentId] =
    useState<DeployEnvironmentId>("production");
  const [configFormat, setConfigFormat] = useState<DeployConfigFormat>("yaml");
  const [apiLanguage, setApiLanguage] = useState<ApiLanguage>("curl");

  if (!router.isReady || !projectId) {
    return null;
  }

  const promptName = getWorkspaceSelectionLabel(promptPath);
  const activeModel = PREVIEW_MODELS[0]!;
  const promptVariables = Array.from(
    new Set(
      PREVIEW_PROMPT_MESSAGES.flatMap((message) =>
        extractVariables(message.content),
      ),
    ),
  );
  const selectedEnvironment =
    DEPLOY_ENVIRONMENTS.find((item) => item.id === selectedEnvironmentId) ??
    DEPLOY_ENVIRONMENTS[0]!;
  const configObject = buildDeployConfig({
    environmentLabel: selectedEnvironment.label,
    promptName,
    promptPath,
    shortModelLabel: toShortModelLabel(activeModel.label),
    provider: activeModel.provider,
    providerLabel: activeModel.providerLabel,
    messages: PREVIEW_PROMPT_MESSAGES,
    tools: PREVIEW_TOOL_CHIPS,
    variables: promptVariables,
  });
  const configValue =
    configFormat === "json"
      ? JSON.stringify(configObject, null, 2)
      : toDeployYaml(configObject);
  const codeSnippet = buildApiSnippet({
    language: apiLanguage,
    deploymentEnvironmentId: selectedEnvironment.deploymentEnvironmentId,
    promptId: DEPLOY_PROMPT_ID,
  });

  return (
    <PromptFrame
      projectId={projectId}
      breadcrumbs={getPromptBreadcrumbs(projectId, promptPath)}
      promptPath={promptPath}
      activeStage="deploy"
    >
      <div className="bg-background flex min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          className="hidden h-full w-full lg:flex"
        >
          <ResizablePanel defaultSize="23%" minSize="18%">
            <DeployChangesPane
              environmentId={selectedEnvironmentId}
              onEnvironmentChange={setSelectedEnvironmentId}
              environmentOptions={DEPLOY_ENVIRONMENTS}
              modelLabel={toShortModelLabel(activeModel.label)}
              providerIcon={activeModel.providerIcon}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="42%" minSize="30%">
            <DeployConfigPane
              configFormat={configFormat}
              onConfigFormatChange={setConfigFormat}
              configValue={configValue}
              environmentLabel={selectedEnvironment.label}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="35%" minSize="28%">
            <DeployDocsPane
              environmentId={selectedEnvironmentId}
              onEnvironmentChange={setSelectedEnvironmentId}
              environmentOptions={DEPLOY_ENVIRONMENTS}
              apiLanguage={apiLanguage}
              onApiLanguageChange={setApiLanguage}
              codeSnippet={codeSnippet}
              evaluateHref={getPromptStageHref(
                projectId,
                promptPath,
                "evaluate",
              )}
              monitorHref={getPromptStageHref(projectId, promptPath, "monitor")}
            />
          </ResizablePanel>
        </ResizablePanelGroup>

        <div className="flex min-h-0 w-full flex-col divide-y lg:hidden">
          <div className="min-h-[15rem] overflow-hidden">
            <DeployChangesPane
              environmentId={selectedEnvironmentId}
              onEnvironmentChange={setSelectedEnvironmentId}
              environmentOptions={DEPLOY_ENVIRONMENTS}
              modelLabel={toShortModelLabel(activeModel.label)}
              providerIcon={activeModel.providerIcon}
              stackOnMobile
            />
          </div>
          <div className="min-h-[22rem] overflow-hidden">
            <DeployConfigPane
              configFormat={configFormat}
              onConfigFormatChange={setConfigFormat}
              configValue={configValue}
              environmentLabel={selectedEnvironment.label}
            />
          </div>
          <div className="min-h-[24rem] overflow-hidden">
            <DeployDocsPane
              environmentId={selectedEnvironmentId}
              onEnvironmentChange={setSelectedEnvironmentId}
              environmentOptions={DEPLOY_ENVIRONMENTS}
              apiLanguage={apiLanguage}
              onApiLanguageChange={setApiLanguage}
              codeSnippet={codeSnippet}
              evaluateHref={getPromptStageHref(
                projectId,
                promptPath,
                "evaluate",
              )}
              monitorHref={getPromptStageHref(projectId, promptPath, "monitor")}
            />
          </div>
        </div>
      </div>
    </PromptFrame>
  );
}

function DeployChangesPane({
  environmentId,
  onEnvironmentChange,
  environmentOptions,
  modelLabel,
  providerIcon,
  stackOnMobile = false,
}: {
  environmentId: DeployEnvironmentId;
  onEnvironmentChange: (value: DeployEnvironmentId) => void;
  environmentOptions: typeof DEPLOY_ENVIRONMENTS;
  modelLabel: string;
  providerIcon: string;
  stackOnMobile?: boolean;
}) {
  const environment =
    environmentOptions.find((option) => option.id === environmentId) ??
    environmentOptions[0]!;

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex items-center gap-2 border-b px-3.5 py-3",
          stackOnMobile && "px-3 py-2.5",
        )}
      >
        <Select
          value={environmentId}
          onValueChange={(value) =>
            onEnvironmentChange(value as DeployEnvironmentId)
          }
        >
          <SelectTrigger className="border-border/70 bg-background h-8 flex-1 rounded-md px-2.5 text-sm shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {environmentOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon-sm" className="shrink-0">
          <LayoutList className="size-3.5" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3.5 py-3">
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            Undeployed changes
          </p>
          <button
            className="bg-muted/55 hover:bg-muted/70 flex w-full flex-col gap-2 rounded-xl border border-transparent px-3 py-3 text-left transition-colors"
            type="button"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Image
                src={providerIcon}
                alt=""
                width={16}
                height={16}
                className="size-4 rounded-sm"
                unoptimized
              />
              <span className="text-foreground truncate text-sm font-medium">
                / {modelLabel}
              </span>
            </div>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span
                className={cn("size-2 rounded-full", environment.dotClassName)}
              />
              <span>{environment.updatedLabel}</span>
            </div>
          </button>
        </div>
      </ScrollArea>
    </div>
  );
}

function DeployConfigPane({
  configFormat,
  onConfigFormatChange,
  configValue,
  environmentLabel,
}: {
  configFormat: DeployConfigFormat;
  onConfigFormatChange: (value: DeployConfigFormat) => void;
  configValue: string;
  environmentLabel: string;
}) {
  return (
    <div className="bg-background relative flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3.5 py-3">
        <h2 className="text-foreground truncate text-sm font-medium">
          Changes
        </h2>
        <Select
          value={configFormat}
          onValueChange={(value) =>
            onConfigFormatChange(value as DeployConfigFormat)
          }
        >
          <SelectTrigger className="h-8 w-[6.5rem] border-0 bg-transparent px-0 text-sm font-medium shadow-none focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="yaml">YAML</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 p-3.5 pt-3">
        <CodeMirrorEditor
          value={configValue}
          mode={configFormat === "json" ? "json" : "text"}
          editable={false}
          lineNumbers={false}
          minHeight="100%"
          className="border-border/70 bg-background h-full text-sm"
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-fuchsia-600 px-3 py-1 text-xs font-medium text-white shadow-lg shadow-fuchsia-600/20">
          <span>Editor</span>
          <ChevronRight className="size-3.5" />
          <span>{environmentLabel}</span>
        </div>
      </div>
    </div>
  );
}

function DeployDocsPane({
  environmentId,
  onEnvironmentChange,
  environmentOptions,
  apiLanguage,
  onApiLanguageChange,
  codeSnippet,
  evaluateHref,
  monitorHref,
}: {
  environmentId: DeployEnvironmentId;
  onEnvironmentChange: (value: DeployEnvironmentId) => void;
  environmentOptions: typeof DEPLOY_ENVIRONMENTS;
  apiLanguage: ApiLanguage;
  onApiLanguageChange: (value: ApiLanguage) => void;
  codeSnippet: string;
  evaluateHref: string;
  monitorHref: string;
}) {
  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Rocket className="text-muted-foreground size-4" />
        <h2 className="text-foreground truncate text-sm font-medium">Deploy</h2>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 py-4">
          <section className="space-y-3">
            <div className="space-y-1">
              <p className="text-foreground text-sm font-medium">Environment</p>
            </div>
            <Select
              value={environmentId}
              onValueChange={(value) =>
                onEnvironmentChange(value as DeployEnvironmentId)
              }
            >
              <SelectTrigger className="border-border/70 bg-background h-10 w-full rounded-lg px-3 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {environmentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end">
              <Button className="h-9 rounded-lg px-4">Deploy</Button>
            </div>
          </section>

          <div className="border-border/70 border-t" />

          <Card className="border-border/70 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Webhook className="text-muted-foreground size-4" />
                <CardTitle className="text-base">Deployment Webhooks</CardTitle>
              </div>
              <CardDescription>
                Notify downstream systems when this prompt version is deployed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/35 rounded-lg border border-dashed px-3 py-4">
                <p className="text-foreground text-sm font-medium">
                  No webhooks configured
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Add a webhook to fan out deployment events to CI, Slack, or
                  your own release automation.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">API integration</CardTitle>
                  <CardDescription className="mt-1">
                    Fetch the latest deployment directly in your app code.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <BookOpenText className="size-3.5" />
                  Docs
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs
                value={apiLanguage}
                onValueChange={(value) =>
                  onApiLanguageChange(value as ApiLanguage)
                }
              >
                <TabsList className="bg-muted/55 h-auto rounded-lg p-1">
                  <TabsTrigger value="python">Python</TabsTrigger>
                  <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                  <TabsTrigger value="go">Go</TabsTrigger>
                </TabsList>
                {(["python", "javascript", "curl", "go"] as const).map(
                  (language) => (
                    <TabsContent
                      key={language}
                      value={language}
                      className="mt-3"
                    >
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="absolute top-2 right-2 z-10"
                          onClick={() =>
                            void navigator.clipboard.writeText(codeSnippet)
                          }
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <CodeMirrorEditor
                          value={codeSnippet}
                          mode="text"
                          editable={false}
                          lineNumbers={false}
                          maxHeight={250}
                          className="border-border/70 bg-muted/35 text-sm"
                        />
                      </div>
                    </TabsContent>
                  ),
                )}
              </Tabs>
            </CardContent>
          </Card>

          <ActionCard
            title="Ship confidently"
            description="Evaluate your prompts and ensure reliability for customers."
            ctaLabel="Set up evaluators"
            href={evaluateHref}
          />
          <ActionCard
            title="Get realtime insights"
            description="Monitor your deployments and get insights in realtime."
            ctaLabel="Set up observability"
            href={monitorHref}
          />
        </div>
      </ScrollArea>
    </div>
  );
}

function ActionCard({
  title,
  description,
  ctaLabel,
  href,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="truncate text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={href}>
            {ctaLabel}
            <ExternalLink className="size-3.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function buildDeployConfig({
  environmentLabel,
  promptName,
  promptPath,
  shortModelLabel,
  provider,
  providerLabel,
  messages,
  tools,
  variables,
}: {
  environmentLabel: string;
  promptName: string;
  promptPath: string[];
  shortModelLabel: string;
  provider: string;
  providerLabel: string;
  messages: typeof PREVIEW_PROMPT_MESSAGES;
  tools: readonly string[];
  variables: string[];
}) {
  return {
    config: {
      prompt: promptName,
      path: promptPath.join("/"),
      environment: environmentLabel,
      model: shortModelLabel,
      provider,
      providerLabel,
      settings: {
        temperature: 0.3,
        topP: 1,
        maxTokens: 600,
        responseFormat: "text",
      },
    },
    messages: messages.map((message) => ({
      role: message.role.toLowerCase(),
      content: message.content,
    })),
    tools: tools.map((tool) => ({ name: tool })),
    variables,
  };
}

function toDeployYaml(configObject: ReturnType<typeof buildDeployConfig>) {
  const configLines = [
    "config:",
    `  prompt: ${configObject.config.prompt}`,
    `  path: ${configObject.config.path}`,
    `  environment: ${configObject.config.environment}`,
    `  model: ${configObject.config.model}`,
    `  provider: ${configObject.config.provider}`,
    `  providerLabel: ${configObject.config.providerLabel}`,
    "  settings:",
    `    temperature: ${configObject.config.settings.temperature}`,
    `    topP: ${configObject.config.settings.topP}`,
    `    maxTokens: ${configObject.config.settings.maxTokens}`,
    `    responseFormat: ${configObject.config.settings.responseFormat}`,
    "messages:",
    ...configObject.messages.flatMap((message) => [
      `  - role: ${message.role}`,
      "    content: |",
      ...indentBlock(message.content, "      "),
    ]),
    "tools:",
    ...configObject.tools.map((tool) => `  - name: ${tool.name}`),
    "variables:",
    ...configObject.variables.map((variable) => `  - ${variable}`),
  ];

  return configLines.join("\n");
}

function buildApiSnippet({
  language,
  deploymentEnvironmentId,
  promptId,
}: {
  language: ApiLanguage;
  deploymentEnvironmentId: string;
  promptId: string;
}) {
  const url = `${DEPLOY_BASE_URL}?promptId=${promptId}&deploymentEnvironmentId=${deploymentEnvironmentId}&deploymentId=latest`;

  if (language === "python") {
    return `# Replace with your values
API_KEY = "your_workspace_api_key"
PROMPT_ID = "${promptId}"
DEPLOYMENT_ENVIRONMENT_ID = "${deploymentEnvironmentId}"

import requests

response = requests.get(
    "${DEPLOY_BASE_URL}",
    params={
        "promptId": PROMPT_ID,
        "deploymentEnvironmentId": DEPLOYMENT_ENVIRONMENT_ID,
        "deploymentId": "latest",
    },
    headers={"Authorization": f"Bearer {API_KEY}"},
)

print(response.json())`;
  }

  if (language === "javascript") {
    return `// Replace with your values
const API_KEY = "your_workspace_api_key";
const PROMPT_ID = "${promptId}";
const DEPLOYMENT_ENVIRONMENT_ID = "${deploymentEnvironmentId}";

const url = new URL("${DEPLOY_BASE_URL}");
url.searchParams.set("promptId", PROMPT_ID);
url.searchParams.set("deploymentEnvironmentId", DEPLOYMENT_ENVIRONMENT_ID);
url.searchParams.set("deploymentId", "latest");

const response = await fetch(url.toString(), {
  headers: {
    Authorization: \`Bearer \${API_KEY}\`,
  },
});

const deployment = await response.json();
console.log(deployment);`;
  }

  if (language === "go") {
    return `// Replace with your values
apiKey := "your_workspace_api_key"
url := "${url}"

req, _ := http.NewRequest(http.MethodGet, url, nil)
req.Header.Set("Authorization", "Bearer "+apiKey)

res, err := http.DefaultClient.Do(req)
if err != nil {
    log.Fatal(err)
}
defer res.Body.Close()

body, _ := io.ReadAll(res.Body)
fmt.Println(string(body))`;
  }

  return `# Replace with your values
API_KEY="your_workspace_api_key"
PROMPT_ID="${promptId}"
DEPLOYMENT_ENVIRONMENT_ID="${deploymentEnvironmentId}"

BASE_URL="${DEPLOY_BASE_URL}"
URL="${url}"

curl -X GET \\
  "${URL}" \\
  -H "Authorization: Bearer ${"${API_KEY}"}" \\
  -H "Content-Type: application/json"`;
}

function indentBlock(value: string, prefix: string) {
  return value.split("\n").map((line) => `${prefix}${line}`);
}

function toShortModelLabel(value: string) {
  return value.split("::").at(-1) ?? value;
}
