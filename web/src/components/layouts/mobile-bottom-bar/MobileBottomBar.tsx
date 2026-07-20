import { ChevronUp } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { Button } from "@/src/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { Layer } from "@/src/components/ui/layer";
import { cn } from "@/src/utils/tailwind";
import {
  MobileBottomBarSlotTarget,
  useMobileBottomBar,
} from "@/src/components/layouts/mobile-bottom-bar/mobile-bottom-bar-context";

// Safe-area-aware bottom padding: honour the notch/home-indicator inset but
// keep a comfortable floor so the pill never hugs the very edge.
const SAFE_BOTTOM = "pb-[max(0.75rem,env(safe-area-inset-bottom))]";

const wrapperVariants = cva(
  // pointer-events-none so taps pass THROUGH the empty gutter around the pill;
  // only the pill itself (pointer-events-auto) catches events.
  "pointer-events-none fixed inset-x-0 bottom-0 flex justify-center px-3",
  {
    variants: {
      visibility: {
        // Real app: mobile-only. CSS breakpoint (not the JS useIsMobile hook)
        // so there is no hydration flash of the bar on desktop.
        responsive: "md:hidden",
        // Storybook / previews: force it on regardless of viewport width.
        always: "",
      },
    },
    defaultVariants: { visibility: "responsive" },
  },
);

type MobileBottomBarProps = VariantProps<typeof wrapperVariants> & {
  className?: string;
};

/**
 * Expandable mobile bottom action bar — the app-shell home for per-page
 * controls on mobile. Collapsed, it is a compact floating pill pinned to the
 * bottom of the viewport (safe-area aware). Its expand handle opens a bottom
 * sheet (the shared `vaul` {@link Drawer}) that hosts the fuller control set.
 *
 * Pages fill it through the {@link MobileBottomBarPortal} seam (regions `"bar"`
 * and `"sheet"`); this component owns only the chrome. Both surfaces portal
 * through the app overlay `panel` layer — the collapsed pill via {@link Layer},
 * the sheet via the Drawer's own layer-routed portal — so no raw z-index is
 * used to escape the app shell.
 */
export function MobileBottomBar({
  visibility,
  className,
}: MobileBottomBarProps) {
  const ctx = useMobileBottomBar();
  if (!ctx) return null;
  const { expanded, setExpanded } = ctx;

  return (
    <>
      {/* Collapsed pill. Bespoke fixed content → portal through the `panel`
          layer with <Layer>. It stays mounted while the sheet is open (the
          sheet's overlay, appended later into the same layer, paints over it),
          so the `bar` slot target — and any content a page portals into it —
          keeps a stable DOM home. */}
      <Layer name="panel">
        <div className={cn(wrapperVariants({ visibility }), SAFE_BOTTOM)}>
          <div
            className={cn(
              "border-border-contrast bg-background/85 pointer-events-auto flex items-center gap-1 rounded-full border p-1.5 shadow-lg backdrop-blur-md",
              className,
            )}
          >
            <MobileBottomBarSlotTarget region="bar" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="More actions"
              aria-expanded={expanded}
              onClick={() => setExpanded(true)}
            >
              <ChevronUp className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </Layer>

      {/* Expanded bottom sheet. The Drawer routes its portal into the `panel`
          layer itself (see ui/drawer.tsx) and handles focus trap / Escape /
          aria-modal; we only supply the content. h-auto lets it fit content up
          to a max, with the body scrolling past that. */}
      <Drawer
        open={expanded}
        onOpenChange={setExpanded}
        forceDirection="bottom"
      >
        <DrawerContent
          className={cn("h-auto max-h-[85svh] rounded-t-2xl", SAFE_BOTTOM)}
        >
          <div
            aria-hidden
            className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full"
          />
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle>Actions</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-2">
            <MobileBottomBarSlotTarget region="sheet" />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
