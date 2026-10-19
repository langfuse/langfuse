// The projects feature's public client surface (RFC rule 8). Named re-exports
// only — exactly the hooks other features already imported.
//
// useProjectSettingsPages stays off this door. CommandMenu and the settings
// page shims import it from ProjectSettingsPage: the barrel is already
// consumed by useQueryProject callers (including filter-builder on the
// filters door that ComposerTokens imports), and adding the settings page
// would pull that graph into every project-hook consumer.
//
// NewProjectForm stays a page-level deep import. projectsRouter stays a
// direct import from the tRPC root via server/index.ts.
export {
  useOrgProjectSwitchPaths,
  useProject,
  useQueryProject,
  useQueryProjectOrOrganization,
} from "@/src/features/projects/hooks";
