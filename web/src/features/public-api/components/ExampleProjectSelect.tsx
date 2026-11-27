import { useId, useState } from "react";

import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Label } from "@/src/components/ui/label";
import { type ExampleProject } from "@/src/features/public-api/hooks/useOrganizationProjects";

/** PROJECT_ID_PLACEHOLDER stands in for the project id when the organization has no projects. */
const PROJECT_ID_PLACEHOLDER = "<your-project-id>";

/** useExampleProjectId tracks the project the examples name, defaulting to the first. */
export function useExampleProjectId(projects: ExampleProject[]) {
  const [selected, setSelected] = useState<string | null>(null);
  const projectId =
    projects.find((project) => project.id === selected)?.id ??
    projects[0]?.id ??
    PROJECT_ID_PLACEHOLDER;

  return [projectId, setSelected] as const;
}

/** ExampleProjectSelect picks the project an organization key's examples name; it does not change the key. */
export function ExampleProjectSelect(props: {
  projects: ExampleProject[];
  value: string;
  onValueChange: (projectId: string) => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Project</Label>
      <p className="text-muted-foreground text-sm">
        Organization keys work for every project. The examples use this
        project&apos;s ID as the public key.
      </p>
      <SelectInput
        id={id}
        value={props.value}
        options={props.projects.map((project) => ({
          value: project.id,
          label: project.name,
        }))}
        placeholder="Select a project"
        search={
          props.projects.length > 10
            ? { placeholder: "Search projects" }
            : undefined
        }
        onValueChange={props.onValueChange}
      />
    </div>
  );
}
