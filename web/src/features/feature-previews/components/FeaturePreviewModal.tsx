import Image from "next/image";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Switch } from "@/src/components/ui/switch";

import inAppAgentDarkIllustration from "../assets/in-app-agent-dark.svg";
import inAppAgentLightIllustration from "../assets/in-app-agent-light.svg";

const IN_APP_AGENT_PREVIEW_ITEM = {
  id: "in-app-agent",
  title: "Langfuse Assistant",
  sidebarLabel: "Langfuse Assistant",
  description:
    "Explore project data, understand connected Langfuse resources, and get practical help while investigating your application.",
  details:
    "This experimental preview can help you inspect traces and observations, look up related scores or prompts, and answer practical questions while you work in a project. Today, it is most useful for exploring project data and understanding how different Langfuse resources connect. Over time, the goal is to help teams generate insights faster and improve their agentic products with less manual investigation.",
} as const;

const FEATURE_PREVIEW_MODAL_TITLE = "Feature Preview";
const FEATURE_PREVIEW_MODAL_SUBTITLE =
  "Try upcoming and experimental product experiences before they become generally available.";

export type FeaturePreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inAppAgent: {
    enabled: boolean;
    warningReason?: string;
    onToggle: (enabled: boolean) => void;
    isToggling?: boolean;
  };
};

export function FeaturePreviewModal({
  open,
  onOpenChange,
  inAppAgent,
}: FeaturePreviewModalProps) {
  const inAppAgentToggleDisabled = inAppAgent.isToggling === true;

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
              <button
                type="button"
                className="bg-muted text-foreground flex min-w-48 items-start rounded-md border border-transparent px-3 py-3 text-left transition-colors md:min-w-0"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {IN_APP_AGENT_PREVIEW_ITEM.sidebarLabel}
                  </span>
                  <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs">
                    {inAppAgent.enabled ? "Enabled" : "Available"}
                  </span>
                </span>
              </button>
            </div>
          </aside>

          <section className="bg-background min-h-0 overflow-y-auto p-6">
            {inAppAgent.warningReason ? (
              <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-200">
                {inAppAgent.warningReason}
              </div>
            ) : null}

            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-foreground text-xl font-semibold">
                  {IN_APP_AGENT_PREVIEW_ITEM.title}
                </h2>
                <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-5">
                  {IN_APP_AGENT_PREVIEW_ITEM.description}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Switch
                  checked={inAppAgent.enabled}
                  disabled={inAppAgentToggleDisabled}
                  onCheckedChange={inAppAgent.onToggle}
                  aria-label={`Toggle ${IN_APP_AGENT_PREVIEW_ITEM.title}`}
                />
              </div>
            </div>

            <PreviewMockupPanel />

            <p className="text-muted-foreground mt-5 text-sm leading-5">
              {IN_APP_AGENT_PREVIEW_ITEM.details}
            </p>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function PreviewMockupPanel() {
  return (
    <div className="border-border bg-muted/30 mt-6 overflow-hidden rounded-2xl border shadow-inner">
      <Image
        src={inAppAgentLightIllustration}
        alt="Langfuse Assistant connects traces, scores, and prompts to answer project questions."
        className="block h-auto w-full dark:hidden"
      />
      <Image
        src={inAppAgentDarkIllustration}
        alt="Langfuse Assistant connects traces, scores, and prompts to answer project questions."
        className="hidden h-auto w-full dark:block"
      />
    </div>
  );
}
