import { type ComponentProps } from "react";
import { ArrowRight } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/design-system/Button/Button";
import { IllustrationHost } from "@/src/components/design-system/IllustrationHost/IllustrationHost";
import { LangfuseIllustration } from "@/src/components/design-system/LangfuseIllustration/LangfuseIllustration";
import { LogoStack } from "@/src/components/design-system/LogoStack/LogoStack";
import { INTEGRATIONS } from "../../../../integrations/generated";
import type { WayOffer } from "../../types";

/** The trace an app sends first, as the observability scene: the same spans the first trace's card shows. */
const APP_SCENE = {
  spans: [
    { name: "chat-completion", duration: 1.24, cost: 0.0021, start: 0 },
    { name: "retrieve-context", duration: 0.18, cost: 0.000012, start: 0 },
    { name: "openai.chat", duration: 1.02, cost: 0.002088, start: 0.2 },
  ],
  selected: 2,
  axis: [0, 0.25, 0.5, 0.75, 1, 1.25],
};

/** What the card says, by what it offers. */
const COPY = {
  choice: {
    title: "Trace your app",
    lead: "See every LLM call your app makes, step by step, with its cost and speed.",
    action: "Set up tracing",
  },
  alternative: {
    title: "Trace your app instead",
    lead: "See every LLM call your app makes, step by step, with its cost and speed.",
    action: "Set up tracing",
  },
  newProject: {
    title: "Also trace your app",
    lead: "Send your app's traces to a project of their own, so they stay apart from your agent's turns.",
    action: "Trace your app in a new project",
  },
} as const;

/** Beside a setup the card only offers the other way in, so it keeps its own height instead of stretching to the setup's. */
const HEIGHT = {
  choice: null,
  alternative: "lg:h-auto lg:self-start",
  newProject: "lg:h-auto lg:self-start",
} as const satisfies Record<WayOffer, string | null>;

type AppCardProps = {
  offer: WayOffer;
  /** The integrations to show as logos. */
  logos: ComponentProps<typeof LogoStack>["logos"];
  onTraceApp: () => void;
};

/** The way in for an app's own traces: what you'll see, the integrations it works with, and the button that sets it up. */
export function AppCard({ offer, logos, onTraceApp }: AppCardProps) {
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
              variant="observability"
              motion="once"
              floor="grid"
              accent="none"
              a11y="decorative"
              content={APP_SCENE}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 max-lg:sm:col-start-1">
          <LogoStack
            label={`Works with ${logos
              .slice(0, 3)
              .map(({ name }) => name)
              .join(", ")} and more`}
            logos={logos}
            size="sm"
            max={6}
          />
          <p className="text-muted-foreground min-w-0 flex-[1_1_12rem] text-xs">
            <span className="text-foreground font-bold">
              {INTEGRATIONS.length} integrations
            </span>
            , from OpenAI to OpenTelemetry
          </p>
        </div>
        <div className="mt-auto max-lg:sm:col-start-1">
          <Button
            text={copy.action}
            variant={offer === "choice" ? "primary" : "secondary"}
            size="sm"
            trailingIcon={ArrowRight}
            onClick={onTraceApp}
          />
        </div>
      </div>
    </IllustrationHost>
  );
}
