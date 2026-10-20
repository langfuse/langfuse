# Langfuse design system - how to build with it

Components are on `window.LangfuseDS` (e.g. `const { Button, Alert, Tabs, Badge } = window.LangfuseDS;`). Each component's `<Name>.d.ts` is its API contract and `<Name>.prompt.md` shows real usage - read both before using a component.

## Wrap everything in `LangfuseProvider`

Render your whole app inside `LangfuseDS.LangfuseProvider` exactly once, at the root. It sets the light theme class, the `bg-background text-foreground` page surface, the overlay layer root that dialogs/menus/tooltips portal into, and the tooltip/session context. Without it, overlays have nowhere to mount and tooltips throw.

```jsx
const { LangfuseProvider } = window.LangfuseDS;
root.render(<LangfuseProvider><App /></LangfuseProvider>);
```

Dark mode: pass `theme="dark"` - `<LangfuseProvider theme="dark">` - so the `dark` class lands on `<html>` and portalled dialogs, menus, tooltips and code highlighting switch too. A `<div className="dark bg-background text-foreground">` wrapper only flips inline content inside it, never overlays.

## Component API idiom

- Components take **no `className`/`style`** - style comes from enum props (`variant`, `size`), never Tailwind strings. Use only the values the `.d.ts` lists.
- Labels are props, not children, where the API says so: `<Button text="Save" variant="primary" />`, `<Badge text="beta" />`.
- Compound components hang off the parent: `Alert.Title`/`Alert.Description`, `Tabs.List`/`Tabs.Trigger`/`Tabs.Content`.
- Booleans are `is*`/`should*` or plain (`loading`, `disabled`); components never carry outer margin - spacing is the parent's job.
- Prefer a library component over hand-rolled markup: `Button`, `IconButton`, `TextLink`, `Input`, `SearchInput`, `SelectInput`, `Checkbox`, `Switch`, `Tabs`, `Dialog` + `DialogController`, `Tooltip`, `Badge`, `Tag`, `Alert`, `Callout`, `StatusMessage`, `Codeblock`, `Table`, charts (`LineChart`, `BarChart`, `AreaChart`, `PieChart`, ...).
- Icons are typed `@langfuse/icons` wrappers on `window.LangfuseDS.LucideIcons`: `const { Plus, Trash2 } = window.LangfuseDS.LucideIcons;` then `<IconButton icon={Trash2} ... />` / `<Button icon={Plus} ... />`. For standalone icons, use semantic `size` and `color` props, not raw Lucide sizes, colors, `className`, or `style`. Never draw inline SVGs or use emoji.

## App components (Playground group)

The `playground` group holds Langfuse app components built for specific screens: `AppSidebar`, `OrganizationDropdownMenu`/`ProjectDropdownMenu`, `Drawer`, `MarkdownView`, `StatusBadge`, `ItemBadge`, `ScoreBadge`/`ScoreTag`/`GroupedScoreBadges`, `EnvLabelBadge`, `MediaTag`/`MediaFileCard`, `AIAssistedInput`, `CrashModal`, `EvaluatorsOnboardingView`, `DataTable`, and table chrome (`FacetHeader`, `KeyValueFilterBuilder`, `OverviewSelectionBar`, `TableViewPresetsButton`, `ColumnVisibilityHeader`). Use them when a design shows that exact piece of the app. They predate the design-system rules above, so follow each one's `.d.ts` rather than the idiom - and for generic UI always reach for the design-system component first (`Table` for simple lists, `Tooltip` for help text, `Badge`/`Tag` for chips, `Button` for actions). Tables: use `Table` for simple lists (sorting, resizing, column visibility, a row actions menu, `rowHeight`). Use `DataTable` for explorer screens such as traces, observations and evals. It adds pagination with totals, row selection, pinned columns, density and custom row heights, grouped headers and folder rows that `Table` lacks. Build `DataTable` columns with the same `create*TableColumn` helpers. `AppSidebar` only renders inside `SidebarProvider`, with the page body in a sibling `SidebarInset`: `<SidebarProvider open><AppSidebar ... /><SidebarInset>...</SidebarInset></SidebarProvider>`.

## Layout glue: Tailwind v4 utilities with Langfuse tokens

Your own layout markup uses Tailwind classes - but only ones present in the shipped `_ds_bundle.css` (it is precompiled; classes it doesn't contain do nothing). Safe vocabulary:

| Family | Classes |
|---|---|
| Surfaces | `bg-background` `bg-card` `bg-muted` `bg-secondary` `bg-surface-sunken` `bg-primary` |
| Text | `text-foreground` `text-foreground-secondary` `text-foreground-tertiary` `text-muted-foreground` `text-primary` `text-primary-foreground` `text-link` `text-destructive` |
| Status | `bg-light-red`/`text-dark-red`, `bg-light-yellow`/`text-dark-yellow`, `bg-light-green`/`text-dark-green` |
| Borders | `border` `border-border` `divide-y` `rounded-md` `rounded-lg` `shadow-sm` |
| Type | `text-2xs` `text-xs` `text-sm` `text-base` `text-lg` `text-xl` `text-2xl`, `font-bold` (the only bold weight), `font-mono` (IBM Plex Mono) |
| Layout | `flex` `flex-col` `grid` `grid-cols-2` `grid-cols-3` `items-center` `justify-between` `gap-1..6` `p-2..6` `px-4` `py-3` `space-y-2` `space-y-4` `w-full` `h-full` `max-w-md` `max-w-lg` `truncate` `overflow-auto` |

Never use hex colors or raw px; `font-medium`/`font-semibold` compile but are off-system drift - use `font-bold` or nothing. The token source is `styles.css` -> `_ds_bundle.css` (`--color-*`, `--radius`, `--text-*`).

## Example

```jsx
const { LangfuseProvider, Alert, Button, Badge } = window.LangfuseDS;

function Panel() {
  return (
    <div className="flex flex-col gap-4 p-6 max-w-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Evaluators</h2>
        <Badge text="beta" />
      </div>
      <Alert variant="warning">
        <Alert.Title>Quota almost reached</Alert.Title>
        <Alert.Description>90% of this month's evaluations are used.</Alert.Description>
      </Alert>
      <div className="flex gap-2">
        <Button text="Cancel" variant="secondary" />
        <Button text="Upgrade" variant="primary" />
      </div>
    </div>
  );
}
```
