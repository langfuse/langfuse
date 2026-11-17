# App shell

Navigation is one persistent surface with three modes: collapsed, expanded, and mobile. Desktop expansion animates the surface and its layout gutter together. The icon lane, row heights, workspace control, and footer stay anchored; labels reveal inside that structure. Native CSS transitions reverse from their current position without timers or intermediate React state, and respect reduced motion.

In collapsed mode, icons keep the standard navigation label tooltips and hover styling. Hover never expands the sidebar or shifts the page. The organization selector stays at the top of the sidebar, matching classic navigation; the page header owns desktop expansion. Cmd/Ctrl+B toggles desktop expansion. Fresh browsers start collapsed; explicit browser preferences are preserved.

Below `md`, the hamburger opens the same mounted surface as a full-width modal menu with touch-sized rows. Workspace switching, grouped links, and account controls keep their identity. The close button, navigation, and breakpoint changes close transient menus and release focus/scroll locks. Returning to desktop preserves the expansion preference.

The shell is selected per browser through the user menu or `?shell=next` / `?shell=classic`.

## Owner map

| Concern                                        | Owner                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Expansion, viewport and child-menu state       | `stores/sidebarStore.ts`, provided by `contexts/AppShellSidebarProvider.tsx`                  |
| Persistent surface, gutter and mobile modality | `components/ShellSidebar.tsx`                                                                 |
| Width, label and presence transitions          | `components/sidebarMotion.module.css`, `components/nav/SidebarNavItem.module.css`             |
| Panel composition and expansion control        | `components/AppShellSidebarPanel.tsx`, `components/SidebarExpansionToggle.tsx`                |
| Standard hover/focus tooltips                  | `components/nav/SidebarNavItem.tsx` (context-free, explicit `isCollapsed`)                    |
| Filtered links and group separators            | `components/SidebarNavigation.tsx`, `components/layouts/routes.tsx`                           |
| Keyboard shortcuts and route lifecycle         | `hooks/useSidebarShortcuts.ts`, `contexts/AppShellSidebarProvider.tsx`                        |
| Workspace picker, recent projects and search   | `hooks/useWorkspaceSwitcher.ts`, `hooks/useRecentProjects.ts`, `fns/buildSwitcherSections.ts` |
| Last-used project on `/`                       | `features/projects/server/getLandingServerSideProps.ts`, `resolveLandingDestination.ts`       |

## Contracts

- `menuNode({ isCollapsed })` gives custom menu controls the same rail layout without duplicating their state, dialogs or switch IDs.
- Collapsed tooltips use the navigation label by default. Controls can provide an explanatory description, visible on hover or focus in every mode. The original link or button owns focus and actions.
- Shared navigation rows default to 44px on mobile, 36px on desktop, and a 40px leading lane. `NavMain` supplies `--sidebar-nav-row-height` and `--sidebar-nav-leading-width` tokens to match the classic sidebar's 32px geometry.
- The organization selector retains its classic placement and actions at the top of the sidebar. Page chrome owns the single desktop expansion control and the mobile hamburger; the mobile panel owns its close control.
- All three modes retain the same panel and control DOM nodes. Mode changes alter layout and modality rather than mounting separate render trees.
- The passive gutter owns the shared `data-sidebar="sidebar"` measurement marker: desktop peeks reserve its animated width, while mobile measures zero.
- The store owns viewport transitions and the single active child menu. A breakpoint change, parent close, or route transition closes transient UI and keeps the desktop expansion preference.
- Collapsing desktop navigation closes the organization menu before its trigger becomes inert. Mobile focus returns to the actual hamburger ref supplied by page chrome.
- Workspace picker content unmounts when closed so a rapid reopen creates a fresh focus scope. Deferred menu exits yield to the current menu owner.
- Child popovers portal inside the persistent surface. Child dialogs use a stable host in the modal layer, outside the sidebar's inert subtree and included in its mobile focus scope. Escape closes the innermost surface first.
- Activating a same-tab sidebar link closes transient navigation even when its pathname stays the same. Background query-only route changes keep navigation open.
- Account actions that open root-layer dialogs release transient navigation and its modality before handing focus to the dialog.
- Account, organization, and workspace identity boundaries remain blocked from replay, including portaled content.
