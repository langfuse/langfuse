import Image from "next/image";
import { useState } from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

import filterSearchBarDarkIllustration from "../assets/filter-search-bar-dark.svg";
import filterSearchBarLightIllustration from "../assets/filter-search-bar-light.svg";
import modernSessionDarkIllustration from "../assets/modern-session-dark.svg";
import modernSessionLightIllustration from "../assets/modern-session-light.svg";

/** Flags the Feature Preview modal can toggle. Keep in sync with the
 *  userAccount.setFeaturePreviewEnabled allowlist and available-flags.ts.
 *  `searchBar` is retired and no longer renders a tile — see
 *  ControlledFeaturePreviewModal. It remains as rollback plumbing.
 *  TODO(remove ~2026-06-19): drop "searchBar" once GA is confirmed. */
export type PreviewFlag = "modernSession" | "searchBar";

type PreviewIllustration = {
  light: React.ComponentProps<typeof Image>["src"];
  dark: React.ComponentProps<typeof Image>["src"];
  alt: string;
};

/** Static provenance shown as a small mono metadata line in the detail pane.
 *  Dates come from the git history of the registry entry — update `updated`
 *  when a preview materially changes. Optional; omit rather than guess. */
type PreviewDates = {
  added: string;
  updated?: string;
};

type PreviewRegistryItem = {
  flag: PreviewFlag;
  title: string;
  sidebarLabel: string;
  description: string;
  details: string;
  feedbackUrl: string;
  illustration: PreviewIllustration;
  dates?: PreviewDates;
};

/** Per-preview dynamic state, supplied by ControlledFeaturePreviewModal (which
 *  owns the session + the toggle mutation). The static content lives here. */
export type PreviewState = {
  enabled: boolean;
  disabled?: boolean;
  warningReason?: string;
  onToggle: (enabled: boolean) => void;
  isToggling?: boolean;
};

// Static registry — one entry per preview. Order = sidebar order; each
// preview ships separate light/dark illustrations.
const PREVIEW_REGISTRY: PreviewRegistryItem[] = [
  {
    flag: "modernSession",
    title: "Compact Session View",
    sidebarLabel: "Compact Session View",
    description:
      "Navigate every trace in a session from one continuous conversation feed, with tools and structured data available on demand.",
    details:
      "Compact Session View replaces separate trace cards with a compact minimap and a virtualized feed. Jump between traces, keep the active trace in view, or temporarily show inline tool calls and system prompts.",
    feedbackUrl: "https://github.com/orgs/langfuse/discussions",
    illustration: {
      light: modernSessionLightIllustration,
      dark: modernSessionDarkIllustration,
      alt: "Compact Session View showing a trace minimap beside a continuous session conversation feed.",
    },
    dates: { added: "Jul 20, 2026" },
  },
  // TODO(remove ~2026-06-19): dead registry entry — "searchBar" is GA on the v4
  // events tables and no longer surfaced in the dialog (no state entry in
  // ControlledFeaturePreviewModal), so this is filtered out and never renders.
  // Kept for a safe rollback; delete with the rest of the searchBar plumbing.
  {
    flag: "searchBar",
    title: "Filter Search Bar",
    sidebarLabel: "Filter Search Bar",
    description:
      "A keyboard-driven query bar on the Observations and Traces tables — type filters like level:ERROR -env:dev latency:>2 with inline suggestions, alongside the existing filter sidebar.",
    details:
      "The search bar lets you build and edit filters by typing a compact query language with autocomplete, instead of clicking through the sidebar. It stays in sync with the sidebar (both read and write the same filter state) and supports field filters, comparisons, any-of groups, negation, metadata/score paths, and full-text search across input/output. It is available on the new (v4) Observations and Traces tables.",
    feedbackUrl: "https://github.com/orgs/langfuse/discussions/14196",
    illustration: {
      light: filterSearchBarLightIllustration,
      dark: filterSearchBarDarkIllustration,
      alt: "The filter search bar turns typed queries like level:ERROR -env:dev into Observations and Traces table filters with inline suggestions.",
    },
    dates: { added: "Jun 17, 2026", updated: "Jun 18, 2026" },
  },
];

const FEATURE_PREVIEW_MODAL_TITLE = "Feature Preview";

export type FeaturePreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dynamic state per preview flag. Only previews with an entry here render. */
  state: Partial<Record<PreviewFlag, PreviewState>>;
};

export function FeaturePreviewModal({
  open,
  onOpenChange,
  state,
}: FeaturePreviewModalProps) {
  const items = PREVIEW_REGISTRY.filter((item) => state[item.flag]);
  const [selectedFlag, setSelectedFlag] = useState<PreviewFlag | null>(
    items[0]?.flag ?? null,
  );
  // A removed preview falls back without synchronizing derived props into state.
  const selected = items.find((i) => i.flag === selectedFlag) ?? items[0];
  const selectedState = selected ? state[selected.flag] : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" closeOnInteractionOutside overlayMode="blocking">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {FEATURE_PREVIEW_MODAL_TITLE}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="grid min-h-0 gap-0 overflow-hidden p-0 md:grid-cols-[240px_1fr]">
          <aside className="border-border flex flex-col gap-1 border-b p-2 md:border-r md:border-b-0">
            {items.map((item) => {
              const itemState = state[item.flag];
              const isSelected = item.flag === selected?.flag;
              return (
                <div
                  key={item.flag}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
                    isSelected ? "bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFlag(item.flag)}
                    aria-pressed={isSelected}
                    title={item.sidebarLabel}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-sm font-bold",
                      isSelected ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {item.sidebarLabel}
                  </button>
                  <Switch
                    checked={itemState?.enabled === true}
                    disabled={
                      itemState?.disabled === true ||
                      itemState?.isToggling === true
                    }
                    onCheckedChange={(enabled) => {
                      setSelectedFlag(item.flag);
                      itemState?.onToggle(enabled);
                    }}
                    aria-label={`Toggle ${item.title}`}
                  />
                </div>
              );
            })}
          </aside>

          <section className="min-h-0 overflow-y-auto p-6">
            {selected && selectedState ? (
              <>
                {selectedState.warningReason ? (
                  <div className="mb-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-200">
                    {selectedState.warningReason}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-foreground text-xl font-bold">
                    {selected.title}
                  </h2>
                  <Badge
                    variant={selectedState.enabled ? "success" : "secondary"}
                  >
                    {selectedState.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>

                <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-5">
                  {selected.description}
                </p>

                {selected.dates ? (
                  <p className="text-muted-foreground mt-2 font-mono text-xs">
                    added {selected.dates.added}
                    {selected.dates.updated
                      ? ` · updated ${selected.dates.updated}`
                      : null}
                  </p>
                ) : null}

                <PreviewMockupPanel illustration={selected.illustration} />

                <p className="text-muted-foreground mt-5 text-sm leading-5">
                  {selected.details}
                </p>

                <div className="border-border mt-6 border-t border-dashed" />

                <Button asChild className="mt-4">
                  <a
                    href={selected.feedbackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Give feedback
                  </a>
                </Button>
              </>
            ) : null}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function PreviewMockupPanel({
  illustration,
}: {
  illustration: PreviewIllustration;
}) {
  return (
    <div className="border-border bg-muted/30 mt-6 overflow-hidden rounded-md border">
      <Image
        src={illustration.light}
        alt={illustration.alt}
        className="block h-auto w-full dark:hidden"
      />
      <Image
        src={illustration.dark}
        alt={illustration.alt}
        className="hidden h-auto w-full dark:block"
      />
    </div>
  );
}
