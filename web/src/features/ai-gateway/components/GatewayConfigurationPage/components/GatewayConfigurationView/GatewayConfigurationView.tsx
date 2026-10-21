import { useState } from "react";
import {
  Check,
  Copy,
  EyeOff,
  Gauge,
  Plus,
  ScanText,
  type IconComponent,
} from "@langfuse/icons";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { CardDescription, CardTitle } from "@/src/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Button as DesignSystemButton } from "@/src/components/design-system/Button/Button";
import { CreateIngestionProjectDialogController } from "@/src/features/ai-gateway/components/GatewayConfigurationPage/components/CreateIngestionProjectDialogController/CreateIngestionProjectDialogController";
import {
  GATEWAY_CONFIGURATION_DESCRIPTION,
  GATEWAY_CONFIGURATION_TITLE,
} from "@/src/features/ai-gateway/constants/gatewayConfig";
import { isGatewayIngestionConfigured } from "@/src/features/ai-gateway/fns/isGatewayIngestionConfigured";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { cn } from "@/src/utils/tailwind";

export type IngestionMode = "NONE" | "USAGE" | "FULL";
type Project = {
  id: string;
  name: string;
  deletedAt?: Date | string | null;
};

const ingestionModes: Array<{
  value: IngestionMode;
  title: string;
  description: string;
  icon: IconComponent;
}> = [
  {
    value: "NONE",
    title: "None",
    description: "Route requests without capturing anything in Langfuse.",
    icon: EyeOff,
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
  const isConfigured = isGatewayIngestionConfigured({
    ingestionMode,
    hasActiveIngestionProject: projectId !== null,
  });

  function handleUseExistingProject() {
    setShowExistingProjects(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title={GATEWAY_CONFIGURATION_TITLE} />
        <p className="text-muted-foreground text-sm">
          {GATEWAY_CONFIGURATION_DESCRIPTION}
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
            <CreateIngestionProjectDialogController
              ingestionMode={ingestionMode}
              isSaving={isSaving}
              onCreate={onCreateProject}
            >
              {({ openDialog }) => (
                <DesignSystemButton
                  text="or create a new project"
                  variant="text"
                  onClick={openDialog}
                />
              )}
            </CreateIngestionProjectDialogController>
          </div>
        ) : (
          <div className="flex flex-row items-center gap-2">
            <CreateIngestionProjectDialogController
              ingestionMode={ingestionMode}
              isSaving={isSaving}
              onCreate={onCreateProject}
            >
              {({ openDialog }) => (
                <DesignSystemButton
                  text="Create ingestion project"
                  icon={Plus}
                  onClick={openDialog}
                />
              )}
            </CreateIngestionProjectDialogController>
            <DesignSystemButton
              text="or use an existing project"
              variant="text"
              onClick={handleUseExistingProject}
            />
          </div>
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          A dedicated project keeps gateway traffic separate from your
          application traces.
        </p>
      </div>

      <div>
        <CardTitle className="mb-4 text-base">Ingestion mode</CardTitle>
        <div className="grid gap-2 md:grid-cols-3">
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
                  <Icon size="base" color="muted" />
                  {selected ? (
                    <Check size="base" __rawClassName="text-primary " />
                  ) : null}
                </div>
                <div>
                  <p className="text-sm font-bold">{option.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
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

      <div className="flex items-center justify-end gap-3">
        {isConfigured ? null : (
          <p className="text-destructive text-sm">
            Select an ingestion project to capture gateway traffic.
          </p>
        )}
        <Button
          disabled={!isDirty || !isConfigured || isSaving}
          loading={isSaving}
          onClick={() => onSave({ projectId, ingestionMode })}
        >
          Save
        </Button>
      </div>
    </div>
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
        {isCopied ? (
          <Check size="sm" color="default" />
        ) : (
          <Copy size="sm" color="default" />
        )}
      </Button>
    </div>
  );
}
