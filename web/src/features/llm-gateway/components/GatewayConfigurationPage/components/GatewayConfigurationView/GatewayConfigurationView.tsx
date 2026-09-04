import { useState } from "react";
import { Check, Copy, Gauge, RadioTower, Sparkles } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { cn } from "@/src/utils/tailwind";

const GATEWAY_BASE_URL = "https://gateway.langfuse.com/v1";
const CREATE_PROJECT_VALUE = "__create_project__";
const DEFAULT_PROJECT_NAME = "llm-ingestion-project";

type InstrumentationMode = "NONE" | "USAGE" | "FULL";
type Project = {
  id: string;
  name: string;
  deletedAt?: Date | string | null;
};

const instrumentationModes: Array<{
  value: InstrumentationMode;
  title: string;
  description: string;
  icon: typeof RadioTower;
}> = [
  {
    value: "NONE",
    title: "None",
    description: "Proxy requests without creating Langfuse observations.",
    icon: RadioTower,
  },
  {
    value: "USAGE",
    title: "Usage",
    description: "Capture model, token usage, cost, and latency.",
    icon: Gauge,
  },
  {
    value: "FULL",
    title: "Full",
    description: "Capture full request and response payloads for tracing.",
    icon: Sparkles,
  },
];

export function GatewayConfigurationView({
  projects,
  initialProjectId,
  initialMode,
  isSaving,
  saveError,
  onSave,
}: {
  projects: Project[];
  initialProjectId: string | null;
  initialMode: InstrumentationMode;
  isSaving: boolean;
  saveError: boolean;
  onSave: (values: {
    projectId: string | null;
    createProjectName?: string;
    mode: InstrumentationMode;
  }) => void | Promise<void>;
}) {
  const activeProjects = projects.filter((project) => !project.deletedAt);
  const initialProjectExists =
    initialProjectId !== null &&
    activeProjects.some((project) => project.id === initialProjectId);
  const [projectSelection, setProjectSelection] = useState(
    initialProjectExists ? initialProjectId : CREATE_PROJECT_VALUE,
  );
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [mode, setMode] = useState<InstrumentationMode>(initialMode);
  const projectId =
    projectSelection === CREATE_PROJECT_VALUE ? null : projectSelection;
  const isCreatingProject = projectSelection === CREATE_PROJECT_VALUE;
  const isDirty =
    isCreatingProject || projectId !== initialProjectId || mode !== initialMode;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title="LLM Gateway configuration" />
        <p className="text-muted-foreground text-sm">
          Configure how requests routed through the organization gateway are
          ingested into Langfuse.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gateway endpoint</CardTitle>
          <CardDescription>
            Use this fixed base URL in any supported SDK.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GatewayUrl />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default ingestion project</CardTitle>
          <CardDescription>
            Gateway traces and usage data are written to this project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={projectSelection} onValueChange={setProjectSelection}>
            <SelectTrigger className="ph-no-capture max-w-md">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent className="ph-no-capture">
              <SelectItem value={CREATE_PROJECT_VALUE}>
                Create new project
              </SelectItem>
              {activeProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isCreatingProject ? (
            <div className="mt-4 max-w-md">
              <Label htmlFor="gateway-project-name">Project name</Label>
              <Input
                id="gateway-project-name"
                className="ph-no-capture mt-1.5"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                Only you receive access initially. Other organization members
                must be invited explicitly.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div>
        <Header title="Instrumentation mode" />
        <div className="grid gap-3 md:grid-cols-3">
          {instrumentationModes.map((option) => {
            const Icon = option.icon;
            const selected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setMode(option.value)}
                className={cn(
                  "bg-card hover:bg-muted/50 flex min-h-36 flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                  selected && "border-primary ring-primary ring-1",
                )}
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <Icon className="text-muted-foreground size-5" />
                  {selected ? <Check className="text-primary size-4" /> : null}
                </div>
                <div>
                  <p className="font-bold">{option.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {saveError ? (
        <Alert variant="destructive">
          <Alert.Title>Configuration was not saved</Alert.Title>
          <Alert.Description>
            Check your selections and try again.
          </Alert.Description>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button
          disabled={
            !isDirty || isSaving || (isCreatingProject && !projectName.trim())
          }
          loading={isSaving}
          onClick={() =>
            onSave({
              projectId,
              createProjectName: isCreatingProject
                ? projectName.trim()
                : undefined,
              mode,
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function GatewayUrl() {
  const { copy, isCopied } = useCopyToClipboard();
  return (
    <div className="bg-muted flex max-w-2xl items-center justify-between gap-3 rounded-md border px-3 py-2">
      <code className="truncate text-sm" title={GATEWAY_BASE_URL}>
        {GATEWAY_BASE_URL}
      </code>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Copy gateway base URL"
        onClick={() => copy(GATEWAY_BASE_URL)}
      >
        {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}
