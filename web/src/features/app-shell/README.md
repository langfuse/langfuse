# App shell

Desktop navigation has two explicit layouts: a persistent icon rail and an
expanded sidebar. Hovering or focusing an icon reveals only that entry's full
clickable row in the tooltip layer. It never expands the sidebar or shifts the
page. The expand/collapse button stays in the sidebar header. Cmd/Ctrl+B toggles
these layouts. Fresh browsers start with the rail; explicit browser preferences
are preserved.

Below `md`, the hamburger opens a full-width mobile navigation sheet. It keeps
workspace switching, grouped links, and account controls together, with a close
button in the top corner. Navigation closes the sheet.

The shell is selected per browser through the user menu or `?shell=next` /
`?shell=classic`.

## Owner map

| Concern                                           | Owner                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Expansion, mobile menu and workspace picker state | `stores/sidebarStore.ts`, provided by `contexts/AppShellSidebarProvider.tsx`                  |
| Rail / expanded column and mobile sheet           | `components/ShellSidebar.tsx`                                                                 |
| Panel composition and expansion control           | `components/AppShellSidebarPanel.tsx`, `components/SidebarExpansionToggle.tsx`                |
| Per-entry hover/focus presentation                | `components/nav/SidebarNavItem.tsx` (context-free, explicit `isCollapsed`)                    |
| Filtered links and group separators               | `components/SidebarNavigation.tsx`, `components/layouts/routes.tsx`                           |
| Keyboard shortcuts and route lifecycle            | `hooks/useSidebarShortcuts.ts`, `contexts/AppShellSidebarProvider.tsx`                        |
| Workspace picker, recent projects and search      | `hooks/useWorkspaceSwitcher.ts`, `hooks/useRecentProjects.ts`, `fns/buildSwitcherSections.ts` |
| Last-used project on `/`                          | `features/projects/server/getLandingServerSideProps.ts`, `resolveLandingDestination.ts`       |

## Contracts

- `menuNode({ isCollapsed })` gives custom menu controls the same rail layout
  without duplicating their state, dialogs or switch IDs.
- Hover previews have one keyboard target: the original icon. Their portaled
  row repeats only the presentation and action, never a stateful control.
- Root page chrome does not render a second expansion control. The sidebar
  header owns expansion; mobile page chrome owns the hamburger.
- A route transition closes transient workspace/mobile UI and keeps the
  desktop expansion preference.
- Account and workspace identity boundaries remain blocked from replay,
  including portaled workspace and account content.
