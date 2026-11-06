# App shell (preview)

One sidebar instead of a collapsed and an expanded mode. Pinned, it docks
and pushes the page. Unpinned, it is hidden and floats over the page when the
pointer rests on the left screen edge or the header handle, or on Mod+B; it
closes when the pointer leaves, on Escape, or on a click outside. Below `md`
the same panel is a drawer. The shell is selected per browser
(`useAppShellVariant`: user menu, or `?shell=next` / `?shell=classic`), so it
can be compared with the classic shell.

## Owner map

| Concern                                                         | Owner                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pinned, overlay, drawer and switcher state; hover timing; holds | `stores/sidebarStore.ts` (per mount, created by `contexts/AppShellSidebarProvider.tsx`)                                  |
| Which surface renders the panel                                 | `components/ShellSidebar.tsx` (docked aside, overlay in the `panel` layer, `Sheet` on mobile)                            |
| Page chrome contract shared with classic                        | `components/nav/AppNavigationProvider.tsx` (`SidebarControl`, open/close of transient navigation)                        |
| Panel content                                                   | `components/AppShellSidebarPanel.tsx`, composed from `SidebarPanel` slots                                                |
| Navigation items                                                | `ROUTES` in `components/layouts/routes.tsx`, filtered by `useFilteredNavigation` (RBAC, entitlements, flags)             |
| Edge hover, shortcuts, overlay dismissal and focus              | `hooks/useSidebarEdgeHover.ts`, `hooks/useSidebarShortcuts.ts`, `hooks/useOverlayDismiss.ts`, `hooks/useOverlayFocus.ts` |
| Workspace switcher lists                                        | `fns/buildSwitcherSections.ts`, `fns/scoreSwitcherMatch.ts`, `hooks/useWorkspaceSwitcher.ts`                             |
| Recent projects                                                 | `hooks/useRecentProjects.ts` (local storage per user), recorded by `hooks/useRecordRecentProject.ts`                     |
| Last-used project on `/`                                        | `features/projects/server/getLandingServerSideProps.ts` and `resolveLandingDestination.ts`                               |

## Behavior

- Hover opens after 100 ms on the edge or handle and closes 300 ms after the
  pointer leaves. Menus opened from the floating sidebar (switcher, account,
  version) render inside its wrapper or hold it open, so moving into them
  never closes it.
- Keyboard and touch opens stay until dismissed; keyboard opens move focus to
  the current page's entry and return it on close.
- Pinning is stored per browser under `langfuse:sidebar:pinned:v1`; a
  collapsed classic sidebar starts unpinned.
- Mod+O opens the switcher, revealing the sidebar first if it is hidden.
  Enter on an empty query returns to the previous project. Choosing an
  organization opens its last-used project, its only project, or its
  overview.
