# App shell

Navigation is one persistent surface with three modes: collapsed, expanded, and mobile. Desktop expansion animates the surface and its layout gutter together. The icon lane, row heights, workspace control, and footer stay anchored; labels reveal inside that structure. Native CSS transitions reverse from their current position without timers or intermediate React state, and respect reduced motion.

In collapsed mode, hovering or focusing an icon reveals only that entry's full clickable row in the tooltip layer. It never expands the sidebar or shifts the page. The expand/collapse button stays in the sidebar header. Cmd/Ctrl+B toggles desktop expansion. Fresh browsers start collapsed; explicit browser preferences are preserved.

Below `md`, the hamburger opens the same mounted surface as a full-width modal menu with touch-sized rows. Workspace switching, grouped links, and account controls keep their identity. The close button, navigation, and breakpoint changes close transient menus and release focus/scroll locks. Returning to desktop preserves the expansion preference.

The shell is selected per browser through the user menu or `?shell=next` / `?shell=classic`.

## Owner map

| Concern                                        | Owner                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Expansion, viewport and child-menu state       | `stores/sidebarStore.ts`, provided by `contexts/AppShellSidebarProvider.tsx`                  |
| Persistent surface, gutter and mobile modality | `components/ShellSidebar.tsx`                                                                 |
| Width, label and presence transitions          | `components/sidebarMotion.module.css`, `components/nav/SidebarNavItem.module.css`             |
| Panel composition and expansion control        | `components/AppShellSidebarPanel.tsx`, `components/SidebarExpansionToggle.tsx`                |
| Per-entry hover/focus presentation             | `components/nav/SidebarNavItem.tsx` (context-free, explicit `isCollapsed`)                    |
| Filtered links and group separators            | `components/SidebarNavigation.tsx`, `components/layouts/routes.tsx`                           |
| Keyboard shortcuts and route lifecycle         | `hooks/useSidebarShortcuts.ts`, `contexts/AppShellSidebarProvider.tsx`                        |
| Workspace picker, recent projects and search   | `hooks/useWorkspaceSwitcher.ts`, `hooks/useRecentProjects.ts`, `fns/buildSwitcherSections.ts` |
| Last-used project on `/`                       | `features/projects/server/getLandingServerSideProps.ts`, `resolveLandingDestination.ts`       |

## Contracts

- `menuNode({ isCollapsed })` gives custom menu controls the same rail layout without duplicating their state, dialogs or switch IDs.
- Hover previews have one keyboard target: the original icon. Their portaled row repeats only the presentation and action, never a stateful control.
- Root page chrome does not render a second expansion control. The sidebar header owns expansion; mobile page chrome owns the hamburger.
- All three modes retain the same panel and control DOM nodes. Mode changes alter layout and modality rather than mounting separate render trees.
- The store owns viewport transitions and the single active child menu. A breakpoint change, parent close, or route transition closes transient UI and keeps the desktop expansion preference.
- Child overlays portal into containers inside the persistent surface so the mobile focus scope includes them. Escape closes the innermost surface first.
- Account and workspace identity boundaries remain blocked from replay, including portaled workspace and account content.
