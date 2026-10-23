import { IntegrationLogo } from "@/src/components/design-system/IntegrationLogo/IntegrationLogo";
import { Toggle } from "@/src/components/design-system/Toggle/Toggle";
import { cn } from "@/src/utils/tailwind";
import { logoOf } from "../../../../integrations/logos";
import { CODING_AGENTS, MORE_AGENTS, codingAgentOf } from "../../codingAgents";

/** The look of Toggle's chip for chips that aren't toggles: starting a setup, or browsing the rest. */
const ACTION_CHIP =
  "bg-background text-foreground hover:border-primary-accent/55 focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded-full border py-0 pr-2.5 pl-1 text-xs transition-[color,background-color,border-color,scale] duration-150 ease-out focus-visible:ring-2 focus-visible:outline-hidden motion-safe:active:scale-[0.97]";

type AgentChipsProps = {
  onPick: (slug: string) => void;
  onBrowseMore: () => void;
} & (
  | {
      /** No agent is set up yet, so each chip is a button that starts its agent's setup. */
      current: null;
      /** Names a chip's action, e.g. "Set up Claude Code"; its text stays the agent's name. */
      labelFor: (name: string) => string;
      /** A mouse resting on a chip, or focus on it, so a scene can show that agent first. */
      onPreview: (index: number) => void;
    }
  | {
      /** The agent being set up, pressed among the others. */
      current: string;
    }
);

type Chip = { slug: string; label: string };

function ChipLogo({ slug, label }: Chip) {
  return (
    <IntegrationLogo
      name={label}
      {...logoOf(slug)}
      size="xs"
      shape="circle"
      isDecorative
    />
  );
}

/** The chips while an agent is set up: toggles, the current one pressed; one picked from the rest gets a chip too. */
function SwitchChips({
  current,
  onPick,
}: {
  current: string;
  onPick: (slug: string) => void;
}) {
  const picked = CODING_AGENTS.some(({ slug }) => slug === current)
    ? undefined
    : codingAgentOf(current);
  const chips: Chip[] = [
    ...CODING_AGENTS.map(({ slug, label }) => ({ slug, label })),
    ...(picked ? [{ slug: picked.slug, label: picked.name }] : []),
  ];
  return chips.map((chip) => (
    <Toggle
      key={chip.slug}
      variant="chip"
      count={null}
      pressed={current === chip.slug}
      onClick={() => onPick(chip.slug)}
    >
      <ChipLogo {...chip} />
      {chip.label}
    </Toggle>
  ));
}

/** The chips before any agent is set up: each starts its agent's setup and previews it on hover or focus. */
function StartChips({
  labelFor,
  onPick,
  onPreview,
}: {
  labelFor: (name: string) => string;
  onPick: (slug: string) => void;
  onPreview: (index: number) => void;
}) {
  return CODING_AGENTS.map(({ slug, label }, index) => (
    <button
      key={slug}
      type="button"
      aria-label={labelFor(label)}
      onClick={() => onPick(slug)}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onPreview(index);
      }}
      onFocus={() => onPreview(index)}
      className={ACTION_CHIP}
    >
      <ChipLogo slug={slug} label={label} />
      {label}
    </button>
  ));
}

/**
 * The coding agents as chips, one click from their setup, and the rest of the catalog behind "+N more". An agent
 * picked from the rest gets a chip of its own while it's set up.
 */
export function AgentChips(props: AgentChipsProps) {
  return (
    <div
      role="group"
      aria-label="Coding agents"
      className="flex flex-wrap gap-1.5"
    >
      {props.current === null ? (
        <StartChips
          labelFor={props.labelFor}
          onPick={props.onPick}
          onPreview={props.onPreview}
        />
      ) : (
        <SwitchChips current={props.current} onPick={props.onPick} />
      )}
      {MORE_AGENTS > 0 ? (
        <button
          type="button"
          onClick={props.onBrowseMore}
          className={cn(
            ACTION_CHIP,
            "text-foreground-secondary hover:text-foreground border-dashed px-2.5",
          )}
        >
          +{MORE_AGENTS} more
        </button>
      ) : null}
    </div>
  );
}
