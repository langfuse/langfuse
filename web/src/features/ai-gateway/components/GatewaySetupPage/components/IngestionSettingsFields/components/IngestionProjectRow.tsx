import type { ChangeEvent } from "react";

import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import type {
  GatewayIngestionSettings,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type IngestionProjectRowProps = {
  settings: GatewayIngestionSettings;
  projects: GatewayProject[];
  onChange: (settings: GatewayIngestionSettings) => void;
};

/** Reads as one sentence: "Record in a [new] project named [ai-gateway]". */
export function IngestionProjectRow({
  settings,
  projects,
  onChange,
}: IngestionProjectRowProps) {
  const targetOptions = [
    { value: "new" as const, label: "new" },
    projects.length > 0
      ? { value: "existing" as const, label: "existing" }
      : {
          value: "existing" as const,
          label: "existing",
          disabled: true as const,
          disabledReason: "This organization has no projects yet.",
        },
  ];
  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: project.name,
  }));

  function handleTargetChange(projectTarget: "new" | "existing") {
    onChange({ ...settings, projectTarget });
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    onChange({ ...settings, newProjectName: event.target.value });
  }

  function handleProjectChange(existingProjectId: string) {
    onChange({ ...settings, existingProjectId });
  }

  const isNewProject = settings.projectTarget === "new";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>{isNewProject ? "Record in a" : "Record in an"}</span>
      <div className="w-fit">
        <SelectInput
          aria-label="New or existing project"
          placeholder="new"
          value={settings.projectTarget}
          options={targetOptions}
          onValueChange={handleTargetChange}
        />
      </div>
      <span>{isNewProject ? "project named" : "project"}</span>
      {isNewProject ? (
        <div className="ph-no-capture w-fit">
          <Input
            layout="inline"
            aria-label="Project name"
            value={settings.newProjectName}
            onChange={handleNameChange}
            error={settings.newProjectName.trim().length === 0}
          />
        </div>
      ) : (
        <div className="ph-no-capture w-fit">
          <SelectInput
            aria-label="Ingestion project"
            placeholder="Select a project"
            search={{ placeholder: "Search projects" }}
            value={settings.existingProjectId ?? ""}
            options={projectOptions}
            onValueChange={handleProjectChange}
          />
        </div>
      )}
    </div>
  );
}
