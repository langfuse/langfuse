import { useState } from "react";
import {
  Check,
  Copy,
  Gauge,
  Plus,
  ScanText,
  type LucideIcon,
} from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogController,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { CardDescription, CardTitle } from "@/src/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { DEFAULT_GATEWAY_INGESTION_PROJECT_NAME } from "@/src/features/ai-gateway/constants/gatewayConfig";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { cn } from "@/src/utils/tailwind";

type IngestionMode = "USAGE" | "FULL";
type Project = {
  id: string;
  name: string;
  deletedAt?: Date | string | null;
};

const ingestionModes: Array<{
  value: IngestionMode;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
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
    icon: ScanText,
  },
];

export function GatewayConfigurationView({
  projects,
  gatewayBaseUrl,
  initialProjectId,
  initialIngestionMode,
  isSaving,
  saveError,
  onSave,
  onCreateProject,
}: {
  projects: Project[];
  gatewayBaseUrl: string;
  initialProjectId: string | null;
  initialIngestionMode: IngestionMode;
  isSaving: boolean;
  saveError: boolean;
  onSave: (values: {
    projectId: string | null;
    ingestionMode: IngestionMode;
  }) => void | Promise<void>;
  onCreateProject: (values: {
    projectName: string;
    ingestionMode: IngestionMode;
  }) => void | Promise<void>;
}) {
  const activeProjects = projects.filter((project) => !project.deletedAt);
  const initialProjectExists =
    initialProjectId !== null &&
    activeProjects.some((project) => project.id === initialProjectId);
  const [projectSelection, setProjectSelection] = useState<string | undefined>(
    initialProjectExists ? initialProjectId : undefined,
  );
  const [showExistingProjects, setShowExistingProjects] =
    useState(initialProjectExists);
  const [ingestionMode, setIngestionMode] =
    useState<IngestionMode>(initialIngestionMode);
  const projectId = projectSelection ?? null;
  const isDirty =
    projectId !== initialProjectId || ingestionMode !== initialIngestionMode;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title="AI Gateway configuration" />
        <p className="text-muted-foreground text-sm">
          Configure how requests routed through the organization gateway are
          ingested into Langfuse.
        </p>
      </div>

      <div>
        <div className="mb-4 flex flex-col gap-1">
          <CardTitle className="text-base">Gateway endpoint</CardTitle>
          <CardDescription>
            Use this fixed base URL in any supported SDK.
          </CardDescription>
        </div>
        <GatewayUrl gatewayBaseUrl={gatewayBaseUrl} />
      </div>

      <div>
        <CardTitle className="mb-4 text-base">
          Default ingestion project
        </CardTitle>
        {showExistingProjects ? (
          <div className="flex max-w-md flex-row flex-wrap items-center gap-2">
            <Select
              value={projectSelection}
              onValueChange={setProjectSelection}
            >
              <SelectTrigger className="ph-no-capture w-fit max-w-full">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent className="ph-no-capture">
                {activeProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CreateIngestionProjectDialog
              ingestionMode={ingestionMode}
              isSaving={isSaving}
              onCreate={onCreateProject}
              triggerLabel="or create a new project"
            />
          </div>
        ) : (
          <div className="flex flex-row items-center gap-2">
            <CreateIngestionProjectDialog
              ingestionMode={ingestionMode}
              isSaving={isSaving}
              onCreate={onCreateProject}
              triggerLabel="Create ingestion project"
              showIcon
            />
            <button
              type="button"
              className="text-primary text-sm hover:underline"
              onClick={() => setShowExistingProjects(true)}
            >
              or use an existing project
            </button>
          </div>
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          A dedicated project keeps gateway traffic separate from your
          application traces.
        </p>
      </div>

      <div>
        <CardTitle className="mb-4 text-base">Ingestion mode</CardTitle>
        <div className="grid gap-2 md:grid-cols-2">
          {ingestionModes.map((option) => {
            const Icon = option.icon;
            const selected = ingestionMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setIngestionMode(option.value)}
                className={cn(
                  "bg-card hover:bg-muted/50 flex flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors",
                  selected && "border-primary ring-primary ring-1",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <Icon className="text-muted-foreground size-4" />
                  {selected ? (
                    <Check className="text-primary size-3.5" />
                  ) : null}
                </div>
                <div>
                  <p className="text-sm font-bold">{option.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-4">
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
          disabled={!isDirty || isSaving}
          loading={isSaving}
          onClick={() => onSave({ projectId, ingestionMode })}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function CreateIngestionProjectDialog({
  ingestionMode,
  isSaving,
  onCreate,
  triggerLabel,
  showIcon = false,
}: {
  ingestionMode: IngestionMode;
  isSaving: boolean;
  onCreate: (values: {
    projectName: string;
    ingestionMode: IngestionMode;
  }) => void | Promise<void>;
  triggerLabel: string;
  showIcon?: boolean;
}) {
  const [projectName, setProjectName] = useState(
    DEFAULT_GATEWAY_INGESTION_PROJECT_NAME,
  );

  return (
    <DialogController
      size="default"
      closeOnInteractionOutside={false}
      onBeforeClose={() => !isSaving}
      onDismiss={() => setProjectName(DEFAULT_GATEWAY_INGESTION_PROJECT_NAME)}
      renderContent={() => (
        <>
          <DialogHeader>
            <DialogTitle>Create ingestion project</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div>
              <Label htmlFor="gateway-project-name">Project name</Label>
              <Input
                id="gateway-project-name"
                className="ph-no-capture mt-1.5"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                Project access follows organization roles and can be restricted
                in project settings.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={!projectName.trim() || isSaving}
              loading={isSaving}
              onClick={() =>
                onCreate({
                  projectName: projectName.trim(),
                  ingestionMode,
                })
              }
            >
              Create project
            </Button>
          </DialogFooter>
        </>
      )}
    >
      {({ openDialog }) =>
        showIcon ? (
          <Button onClick={openDialog}>
            <Plus className="mr-1.5 size-4" />
            {triggerLabel}
          </Button>
        ) : (
          <button
            type="button"
            className="text-primary text-sm hover:underline"
            onClick={openDialog}
          >
            {triggerLabel}
          </button>
        )
      }
    </DialogController>
  );
}

function GatewayUrl({ gatewayBaseUrl }: { gatewayBaseUrl: string }) {
  const { copy, isCopied } = useCopyToClipboard();
  return (
    <div className="bg-muted flex w-fit max-w-full items-center justify-between gap-3 rounded-md border px-3 py-2">
      <code className="truncate text-sm" title={gatewayBaseUrl}>
        {gatewayBaseUrl}
      </code>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Copy gateway base URL"
        onClick={() => copy(gatewayBaseUrl)}
      >
        {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}
