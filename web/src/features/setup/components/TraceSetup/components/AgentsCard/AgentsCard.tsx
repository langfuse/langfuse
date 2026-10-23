"use client";

import { useState } from "react";
import { IllustrationHost } from "@/src/components/design-system/IllustrationHost/IllustrationHost";
import { LangfuseIllustration } from "@/src/components/design-system/LangfuseIllustration/LangfuseIllustration";
import { CODING_AGENTS } from "../../codingAgents";
import { cn } from "@/src/utils/tailwind";
import type { WayOffer } from "../../types";
import { AgentChips } from "../AgentChips/AgentChips";

/** What the card says, by what it offers. */
const COPY = {
  choice: {
    title: "Trace your coding agent",
    lead: "See every prompt, tool call and token of your Claude Code, Codex, OpenCode or Pi sessions.",
    action: (name: string) => `Set up ${name}`,
  },
  alternative: {
    title: "Trace your coding agent instead",
    lead: "No app to trace yet? See every prompt and tool call of your Claude Code, Codex, OpenCode or Pi sessions.",
    action: (name: string) => `Set up ${name}`,
  },
  newProject: {
    title: "Also trace your coding agents",
    lead: "Trace your Claude Code, Codex, OpenCode or Pi sessions too, in a project of their own so their turns stay out of your app's numbers.",
    action: (name: string) => `Set up ${name} in a new project`,
  },
} as const;

/** Beside a setup the card only offers the other way in, so it keeps its own height instead of stretching to the setup's. */
const HEIGHT = {
  choice: null,
  alternative: "lg:h-auto lg:self-start",
  newProject: "lg:h-auto lg:self-start",
} as const satisfies Record<WayOffer, string | null>;

type AgentsCardProps = {
  offer: WayOffer;
  onPick: (slug: string) => void;
  onBrowseMore: () => void;
};

/**
 * The way in for a coding agent's sessions: each agent is a chip one click from its setup, and the scene shows the
 * agent the pointer rests on, swapped in place.
 */
export function AgentsCard({ offer, onPick, onBrowseMore }: AgentsCardProps) {
  const [shown, setShown] = useState(0);
  const copy = COPY[offer];
  return (
    <IllustrationHost>
      <div
        className={cn(
          "bg-muted/60 flex h-full flex-col gap-4 rounded-2xl p-6 max-lg:sm:grid max-lg:sm:grid-cols-[minmax(0,1fr)_auto] max-lg:sm:items-center",
          HEIGHT[offer],
        )}
      >
        <div className="flex flex-col gap-1.5 max-lg:sm:col-start-1 max-lg:sm:row-start-1">
          <h2 className="text-base font-bold">{copy.title}</h2>
          <p className="text-muted-foreground text-sm">{copy.lead}</p>
        </div>
        <div className="grid flex-1 place-items-center max-lg:sm:col-start-2 max-lg:sm:row-span-3 max-lg:sm:w-72">
          <div className="w-full max-w-xs">
            <LangfuseIllustration
              variant="agents"
              motion="once"
              floor="grid"
              accent="none"
              a11y="decorative"
              content={{
                agents: CODING_AGENTS.map(({ cli, logo }) => ({
                  name: cli,
                  logo,
                })),
                active: shown,
              }}
            />
          </div>
        </div>
        <div className="mt-auto max-lg:sm:col-start-1">
          <AgentChips
            current={null}
            labelFor={copy.action}
            onPick={onPick}
            onPreview={setShown}
            onBrowseMore={onBrowseMore}
          />
        </div>
      </div>
    </IllustrationHost>
  );
}
