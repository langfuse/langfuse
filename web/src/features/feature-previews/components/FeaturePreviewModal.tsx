import Image from "next/image";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Switch } from "@/src/components/ui/switch";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

import inAppAgentDarkIllustration from "../assets/in-app-agent-dark.svg";
import inAppAgentLightIllustration from "../assets/in-app-agent-light.svg";
import filterSearchBarDarkIllustration from "../assets/filter-search-bar-dark.svg";
import filterSearchBarLightIllustration from "../assets/filter-search-bar-light.svg";

/** Flags the Feature Preview modal can toggle. Keep in sync with the
 *  userAccount.setFeaturePreviewEnabled allowlist and available-flags.ts. */
export type PreviewFlag = "inAppAgent" | "searchBar";

type PreviewIllustration = {
  light: React.ComponentProps<typeof Image>["src"];
  dark: React.ComponentProps<typeof Image>["src"];
  alt: string;
};

type PreviewRegistryItem = {
  flag: PreviewFlag;
  title: string;
  sidebarLabel: string;
  description: string;
  details: string;
  feedbackUrl: string;
  illustration: PreviewIllustration;
};

/** Per-preview dynamic state, supplied by ControlledFeaturePreviewModal (which
 *  owns the session + the toggle mutation). The static content lives here. */
export type PreviewState = {
  enabled: boolean;
  warningReason?: string;
  onToggle: (enabled: boolean) => void;
  isToggling?: boolean;
};

// Static registry — one entry per preview. Order = sidebar order; each
// preview ships separate light/dark illustrations.
const PREVIEW_REGISTRY: PreviewRegistryItem[] = [
  {
    flag: "inAppAgent",
    title: "Langfuse Assistant",
    sidebarLabel: "Langfuse Assistant",
    description:
      "Explore project data, understand connected Langfuse resources, and get practical help while investigating your application.",
    details:
      "This experimental preview can help you inspect traces and observations, look up related scores or prompts, and answer practical questions while you work in a project. Today, it is most useful for exploring project data and understanding how different Langfuse resources connect. Over time, the goal is to help teams generate insights faster and improve their agentic products with less manual investigation.",
    feedbackUrl: "https://github.com/orgs/langfuse/discussions/14196",
    illustration: {
      light: inAppAgentLightIllustration,
      dark: inAppAgentDarkIllustration,
      alt: "Langfuse Assistant connects traces, scores, and prompts to answer project questions.",
    },
  },
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
  },
];

const FEATURE_PREVIEW_MODAL_TITLE = "Feature Preview";
const FEATURE_PREVIEW_MODAL_SUBTITLE =
  "Try upcoming and experimental product experiences before they become generally available.";

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
  // Keep the selection valid if the available previews change.
  useEffect(() => {
    if (items.length > 0 && !items.some((i) => i.flag === selectedFlag)) {
      setSelectedFlag(items[0]!.flag);
    }
  }, [items, selectedFlag]);

  const selected = items.find((i) => i.flag === selectedFlag) ?? items[0];
  const selectedState = selected ? state[selected.flag] : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeOnInteractionOutside
        overlayMode="blocking"
        className="border-border bg-background text-foreground max-h-[88vh] p-0 shadow-2xl sm:rounded-2xl"
      >
        <DialogHeader>
          <DialogTitle className="text-foreground text-lg font-semibold">
            {FEATURE_PREVIEW_MODAL_TITLE}
          </DialogTitle>
          <DialogDescription className="mt-0">
            {FEATURE_PREVIEW_MODAL_SUBTITLE}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid min-h-0 gap-0 overflow-hidden p-0 md:grid-cols-[220px_1fr]">
          <aside className="border-border bg-muted/20 border-b p-3 md:border-r md:border-b-0">
            <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-x-visible">
              {items.map((item) => {
                const isSelected = item.flag === selected?.flag;
                return (
                  <button
                    key={item.flag}
                    type="button"
                    onClick={() => setSelectedFlag(item.flag)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex min-w-48 items-start rounded-md border px-3 py-3 text-left transition-colors md:min-w-0",
                      isSelected
                        ? "bg-muted text-foreground border-transparent"
                        : "text-muted-foreground hover:bg-muted/50 border-transparent",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {item.sidebarLabel}
                      </span>
                      <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs">
                        {state[item.flag]?.enabled ? "Enabled" : "Available"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="bg-background min-h-0 overflow-y-auto p-6">
            {selected && selectedState ? (
              <>
                {selectedState.warningReason ? (
                  <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-200">
                    {selectedState.warningReason}
                  </div>
                ) : null}

                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h2 className="text-foreground text-xl font-semibold">
                      {selected.title}
                    </h2>
                    <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-5">
                      {selected.description}
                    </p>
                    <Button asChild className="mt-4">
                      <a
                        href={selected.feedbackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Give feedback
                      </a>
                    </Button>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Switch
                      checked={selectedState.enabled}
                      disabled={selectedState.isToggling === true}
                      onCheckedChange={selectedState.onToggle}
                      aria-label={`Toggle ${selected.title}`}
                    />
                  </div>
                </div>

                <PreviewMockupPanel illustration={selected.illustration} />

                <p className="text-muted-foreground mt-5 text-sm leading-5">
                  {selected.details}
                </p>
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
    <div className="border-border bg-muted/30 mt-6 overflow-hidden rounded-2xl border shadow-inner">
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
