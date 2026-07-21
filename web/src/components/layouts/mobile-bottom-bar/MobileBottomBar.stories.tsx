import { BotMessageSquare, ListFilter, RefreshCw, Clock } from "lucide-react";
import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/ui/button";
import { MobileBottomBar } from "@/src/components/layouts/mobile-bottom-bar/MobileBottomBar";
import {
  MobileBottomBarPortal,
  MobileBottomBarProvider,
  useMobileBottomBar,
} from "@/src/components/layouts/mobile-bottom-bar/mobile-bottom-bar-context";

/**
 * `MobileBottomBar` is the app-shell mobile action bar (below `md`). Stories
 * default the `visibility` arg to `"always"` so the bar shows at any Storybook
 * canvas width; in the app it defaults to `"responsive"` (mobile-only). Flip the
 * `visibility` control (or `&args=visibility:responsive` in the URL) and load
 * the story in `iframe.html` to exercise the real mobile gate: below 768px the
 * pill shows and the sheet can open; at/above 768px the pill hides and an open
 * sheet auto-closes. The bar and its expanded sheet are `position: fixed`, so
 * they anchor to the bottom of the canvas viewport (exactly as in the app).
 */
const meta = preview.meta({
  component: MobileBottomBar,
  args: { visibility: "always" },
});

/** Icon-first quick actions for the collapsed pill (the `"bar"` region). */
function SampleBarActions() {
  const ctx = useMobileBottomBar();
  return (
    <MobileBottomBarPortal region="bar">
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label="Ask AI"
      >
        <BotMessageSquare className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label="Filters"
        onClick={() => ctx?.setExpanded(true)}
      >
        <ListFilter className="h-5 w-5" />
      </Button>
    </MobileBottomBarPortal>
  );
}

/** Labelled control set for the expanded sheet (the `"sheet"` region). */
function SampleSheetActions() {
  return (
    <MobileBottomBarPortal region="sheet">
      <Button variant="default" className="w-full justify-start gap-2">
        <BotMessageSquare className="h-4 w-4" />
        Ask Langfuse AI
      </Button>
      <Button variant="outline" className="w-full justify-start gap-2">
        <ListFilter className="h-4 w-4" />
        Filters
      </Button>
      <Button variant="outline" className="w-full justify-start gap-2">
        <Clock className="h-4 w-4" />
        Time range
      </Button>
      <Button variant="outline" className="w-full justify-start gap-2">
        <RefreshCw className="h-4 w-4" />
        Refresh
      </Button>
    </MobileBottomBarPortal>
  );
}

/** Collapsed pill with two sample quick actions + the expand handle. */
export const Collapsed = meta.story({
  render: (args) => (
    <MobileBottomBarProvider>
      <MobileBottomBar {...args} />
      <SampleBarActions />
      <SampleSheetActions />
    </MobileBottomBarProvider>
  ),
});

/** Expanded bottom sheet (opened on mount) with the fuller action set. */
export const Expanded = meta.story({
  render: (args) => (
    <MobileBottomBarProvider defaultExpanded>
      <MobileBottomBar {...args} />
      <SampleBarActions />
      <SampleSheetActions />
    </MobileBottomBarProvider>
  ),
});

/** The shell chrome with no page actions registered — just the expand handle,
 * and an empty sheet. Documents the "nothing to show" baseline. */
export const NoActions = meta.story({
  render: (args) => (
    <MobileBottomBarProvider>
      <MobileBottomBar {...args} />
    </MobileBottomBarProvider>
  ),
});
