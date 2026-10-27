import { useState } from "react";
import { useRouter } from "next/router";
import { Check } from "@langfuse/icons";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { WorkspaceGlyph } from "@/src/features/app-shell/components/WorkspaceGlyph";
import { type SwitcherProject } from "@/src/features/app-shell/fns/buildSwitcherSections";
import { scoreSwitcherMatch } from "@/src/features/app-shell/fns/scoreSwitcherMatch";
import { useWorkspaceSwitcher } from "@/src/features/app-shell/hooks/useWorkspaceSwitcher";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

type SelectionSection = "recent" | "organization" | "search" | "actions";

function ProjectItem({
  project,
  value,
  isOrganizationShown,
  onSelect,
}: {
  project: SwitcherProject;
  value: string;
  isOrganizationShown: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={value}
      keywords={[project.name, project.organizationName]}
      onSelect={onSelect}
    >
      <WorkspaceGlyph id={project.id} name={project.name} size="sm" />
      <span className="min-w-0 flex-1 truncate" title={project.name}>
        {project.name}
      </span>
      {isOrganizationShown ? (
        <span
          className="text-muted-foreground max-w-[45%] shrink-0 truncate text-xs"
          title={project.organizationName}
        >
          {project.organizationName}
        </span>
      ) : null}
      {project.isCurrent ? (
        <Check size="base" color="muted" aria-label="Current project" />
      ) : null}
    </CommandItem>
  );
}

/**
 * Searchable, keyboard-driven list for switching project or organization.
 * Empty query: recent projects, the current organization's projects, the
 * organizations, and quick actions. While searching, every organization's
 * projects are searchable by project or organization name.
 */
export function WorkspaceSwitcherMenu({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const {
    sections,
    actions,
    currentOrganization,
    projectHref,
    organizationHref,
  } = useWorkspaceSwitcher();
  const [query, setQuery] = useState("");
  const isSearching = query.trim().length > 0;

  const select = (
    href: string,
    selection: {
      kind: "project" | "organization" | "action";
      section: SelectionSection;
    },
  ) => {
    capture("app_shell:workspace_switcher_selected", {
      ...selection,
      hasQuery: isSearching,
      queryLength: query.length,
    });
    onDone();
    router.push(href);
  };

  const visibleGroups =
    isSearching || !currentOrganization
      ? sections.projectGroups
      : sections.projectGroups.filter(
          (group) => group.organization.id === currentOrganization.id,
        );
  const projectSection: SelectionSection = isSearching
    ? "search"
    : "organization";
  // Mod+O then Enter returns to the previous project, like switching back a tab.
  const previousProject = sections.recentProjects.find(
    (project) => !project.isCurrent,
  );

  return (
    <Command
      loop
      label="Switch project or organization"
      defaultValue={
        previousProject ? `recent ${previousProject.id}` : undefined
      }
      filter={(_value, search, keywords) =>
        scoreSwitcherMatch(search, keywords ?? [])
      }
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Find a project or organization…"
        aria-label="Find a project or organization"
      />
      <CommandList className="max-h-[min(26rem,60dvh)] p-1">
        <CommandEmpty>No matching project or organization.</CommandEmpty>
        {!isSearching && sections.recentProjects.length > 0 ? (
          <CommandGroup heading="Recent">
            {sections.recentProjects.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                value={`recent ${project.id}`}
                isOrganizationShown
                onSelect={() =>
                  select(projectHref(project.id), {
                    kind: "project",
                    section: "recent",
                  })
                }
              />
            ))}
          </CommandGroup>
        ) : null}
        {visibleGroups.map(({ organization, projects }) =>
          projects.length > 0 ? (
            <CommandGroup
              key={organization.id}
              heading={
                isSearching
                  ? organization.name
                  : `Projects in ${organization.name}`
              }
            >
              {projects.map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  value={`project ${project.name} ${project.id}`}
                  isOrganizationShown={false}
                  onSelect={() =>
                    select(projectHref(project.id), {
                      kind: "project",
                      section: projectSection,
                    })
                  }
                />
              ))}
            </CommandGroup>
          ) : null,
        )}
        {sections.organizations.length > 1 ? (
          <CommandGroup heading="Organizations">
            {sections.organizations.map((organization) => (
              <CommandItem
                key={organization.id}
                value={`organization ${organization.name} ${organization.id}`}
                keywords={[organization.name]}
                onSelect={() =>
                  select(organizationHref(organization), {
                    kind: "organization",
                    section: isSearching ? "search" : "organization",
                  })
                }
              >
                <WorkspaceGlyph
                  id={organization.id}
                  name={organization.name}
                  size="sm"
                />
                <span
                  className="min-w-0 flex-1 truncate"
                  title={organization.name}
                >
                  {organization.name}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {organization.isDemo
                    ? "Demo"
                    : `${organization.projectCount} ${organization.projectCount === 1 ? "project" : "projects"}`}
                </span>
                {organization.isCurrent ? (
                  <Check
                    size="base"
                    color="muted"
                    aria-label="Current organization"
                  />
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandGroup heading="Actions">
          {actions.map((action) => (
            <CommandItem
              key={action.id}
              value={`action ${action.label}`}
              keywords={[action.label, ...action.keywords]}
              onSelect={() =>
                select(action.href, { kind: "action", section: "actions" })
              }
            >
              <span className="flex size-5 shrink-0 items-center justify-center">
                <action.icon size="base" color="default" />
              </span>
              <span className="min-w-0 flex-1 truncate" title={action.label}>
                {action.label}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="text-muted-foreground flex items-center gap-3 border-t px-3 py-2 text-xs">
        <span className="flex items-center gap-1">
          <KeyboardShortcut keys={["ArrowUp"]} variant="keycap" size="sm" />
          <KeyboardShortcut keys={["ArrowDown"]} variant="keycap" size="sm" />
          navigate
        </span>
        <span className="flex items-center gap-1">
          <KeyboardShortcut keys={["Enter"]} variant="keycap" size="sm" />
          open
        </span>
        <span className="ml-auto flex items-center gap-1">
          <KeyboardShortcut keys={["Mod", "O"]} variant="keycap" size="sm" />
        </span>
      </div>
    </Command>
  );
}
